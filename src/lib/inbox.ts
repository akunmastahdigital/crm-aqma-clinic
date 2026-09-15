import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { runAutomations } from "@/lib/automation";
import { maybeAutoAiReply, getAiSettings } from "@/lib/ai";
import { broadcastInbox } from "@/lib/sse-hub";
import { sendPushToAll } from "@/lib/push";
import { deliverOutbound } from "@/lib/delivery";
import { isOutsideHours, matchesEscalation } from "@/lib/chatrules";
import { sendWabaTemplate } from "@/lib/waba";
import { fireWebhook } from "@/lib/webhooks";
import { notifyIncoming } from "@/lib/notify";
import { runRules } from "@/lib/rule-engine";
import { pushChatActivity } from "@/lib/konektor-sync";
import { recordAgentMessage, onIncomingMessage } from "@/lib/agent-assignment";
import { getBusinessHours, isInsideBusinessHours } from "@/lib/business-hours";

// --- API publik: kirim pesan ke nomor (dipakai integrasi eksternal) ---
async function resolveChannel(channelAccountId?: string) {
  const ch = channelAccountId
    ? await prisma.wabaChannel.findUnique({ where: { phoneNumberId: channelAccountId } })
    : await prisma.wabaChannel.findFirst({ where: { active: true } });
  if (!ch) throw new Error("Nomor pengirim WhatsApp tidak ditemukan");
  return ch;
}

async function upsertConv(to: string, channelAccountId: string) {
  const now = new Date();
  const customer = await prisma.customer.upsert({
    where: { channel_externalId: { channel: "WA_CLOUD", externalId: to } },
    update: { lastContactAt: now },
    create: { channel: "WA_CLOUD", externalId: to, phone: to, lastContactAt: now },
  });
  let conv = await prisma.conversation.findFirst({
    where: { customerId: customer.id, status: { not: "CLOSED" }, channelAccountId },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conv)
    conv = await prisma.conversation.create({
      data: { customerId: customer.id, channel: "WA_CLOUD", channelAccountId, status: "OPEN" },
    });
  return conv;
}

export async function apiSendText(channelAccountId: string | undefined, to: string, text: string) {
  const channel = await resolveChannel(channelAccountId);
  const conv = await upsertConv(to, channel.phoneNumberId);
  await prisma.message.create({
    data: { conversationId: conv.id, direction: "OUT", text, status: "SENT" },
  });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: new Date(), lastMessageText: text },
  });
  await deliverOutbound(conv.id, { text });
  return { conversationId: conv.id };
}

export async function apiSendTemplate(
  channelAccountId: string | undefined,
  to: string,
  template: string,
  language: string,
) {
  const channel = await resolveChannel(channelAccountId);
  await sendWabaTemplate(channel.phoneNumberId, to, template, language, channel.accessToken);
  const conv = await upsertConv(to, channel.phoneNumberId);
  const label = `[Template] ${template}`;
  await prisma.message.create({
    data: { conversationId: conv.id, direction: "OUT", text: label, status: "SENT" },
  });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: new Date(), lastMessageText: label },
  });
  return { conversationId: conv.id };
}

// kirim 1 pesan sistem (OUT) + teruskan ke channel asli
async function systemReply(convId: string, text: string) {
  await prisma.message.create({
    data: { conversationId: convId, direction: "OUT", text, status: "SENT" },
  });
  await prisma.conversation.update({
    where: { id: convId },
    data: { lastMessageAt: new Date(), lastMessageText: text },
  });
  await deliverOutbound(convId, { text });
}

// Hitung & simpan First Response Time saat agent pertama kali manual reply
async function recordFirstResponse(convId: string): Promise<void> {
  const conv = await prisma.conversation.findUnique({
    where: { id: convId },
    select: { firstResponseAt: true, createdAt: true },
  });
  if (!conv || conv.firstResponseAt) return; // sudah tercatat sebelumnya

  // Cari pesan IN pertama di conversation ini
  const firstIn = await prisma.message.findFirst({
    where: { conversationId: convId, direction: "IN" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const startTime = firstIn?.createdAt ?? conv.createdAt;
  const now = new Date();

  const bh = await getBusinessHours();
  const { businessMinutesBetween } = await import("@/lib/business-hours");
  const minutes = businessMinutesBetween(bh, startTime, now);

  await prisma.conversation.update({
    where: { id: convId },
    data: { firstResponseAt: now, firstResponseMinutes: minutes },
  });
}

// Cek jam kerja → kirim auto-reply sekali per sesi + tandai conversation perlu tindak lanjut
// skipAutoReply=true → tandai needsFollowUp tapi tidak kirim pesan otomatis (mis. komentar IG)
async function maybeOutsideHoursReply(convId: string, skipAutoReply = false): Promise<void> {
  const bh = await getBusinessHours();
  if (!bh.enabled) return;
  if (isInsideBusinessHours(bh)) return;

  const conv = await prisma.conversation.findUnique({
    where: { id: convId },
    select: { outsideHoursRepliedAt: true },
  });
  if (!conv) return;

  let shouldSendReply = false;
  if (!skipAutoReply && bh.autoReplyEnabled && bh.outsideMessage?.trim()) {
    const tz = bh.timezone || "Asia/Jakarta";
    const todayWib = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    const lastRepliedWib = conv.outsideHoursRepliedAt
      ? conv.outsideHoursRepliedAt.toLocaleDateString("en-CA", { timeZone: tz })
      : null;
    shouldSendReply = lastRepliedWib !== todayWib;
  }

  await prisma.conversation.update({
    where: { id: convId },
    data: {
      needsFollowUp: true,
      ...(shouldSendReply ? { outsideHoursRepliedAt: new Date() } : {}),
    },
  });

  if (shouldSendReply) {
    await systemReply(convId, bh.outsideMessage.trim());
  }
}

const WINDOW_MS = 24 * 3_600_000;

// Semua role lihat semua chat. Filter "mine"/"unassigned" dihandle via param assign.
function inboxWhere(_session: SessionUser): Prisma.ConversationWhereInput {
  return {};
}

export type InboxFilter = {
  read?: "all" | "unread" | "read";
  assign?: "all" | "mine" | "unassigned";
  account?: string;   // single (legacy)
  accounts?: string[]; // multi-select
  q?: string;
  take?: number;
  dateFrom?: string;    // YYYY-MM-DD, WIB
  dateTo?: string;      // YYYY-MM-DD, WIB
  tags?: string[];      // customer punya salah satu tag ini
  pipelineId?: string;
  stageId?: string;
  hasFuPending?: boolean;
  needsFollowUp?: boolean;
  minatTagIds?: string[]; // "__none__" = belum ditandai; ID lain = OR filter
};

export async function listConversations(
  session: SessionUser,
  filter: InboxFilter = {},
) {
  const base = inboxWhere(session);
  const and: Prisma.ConversationWhereInput[] = [];
  if (filter.read === "unread") and.push({ unread: { gt: 0 } });
  if (filter.read === "read") and.push({ unread: 0 });
  if (filter.assign === "mine") and.push({ assignedToId: session.uid });
  if (filter.assign === "unassigned") and.push({ assignedToId: null });
  if (filter.accounts && filter.accounts.length > 0) {
    and.push({ channelAccountId: { in: filter.accounts } });
  } else if (filter.account) {
    and.push({ channelAccountId: filter.account });
  }
  if (filter.q && filter.q.trim()) {
    const q = filter.q.trim();
    const digitsOnly = q.replace(/\D/g, "");
    const orClauses: Prisma.ConversationWhereInput[] = [
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { messages: { some: { text: { contains: q, mode: "insensitive" } } } },
    ];
    // hanya search by nomor HP jika query mengandung minimal 5 digit (hindari "T-PPC7Z" → "7" match semua)
    if (digitsOnly.length >= 5) {
      orClauses.push({ customer: { externalId: { contains: digitsOnly } } });
    }
    and.push({ OR: orClauses });
  }
  if (filter.dateFrom) {
    and.push({ lastMessageAt: { gte: new Date(filter.dateFrom + "T00:00:00+07:00") } });
  }
  if (filter.dateTo) {
    and.push({ lastMessageAt: { lte: new Date(filter.dateTo + "T23:59:59+07:00") } });
  }
  if (filter.tags && filter.tags.length > 0) {
    and.push({ customer: { tags: { hasSome: filter.tags } } });
  }
  if (filter.stageId) {
    and.push({ customer: { deals: { some: { stageId: filter.stageId } } } });
  } else if (filter.pipelineId) {
    and.push({ customer: { deals: { some: { pipelineId: filter.pipelineId } } } });
  }
  if (filter.minatTagIds && filter.minatTagIds.length > 0) {
    if (filter.minatTagIds.includes("__none__") && filter.minatTagIds.length === 1) {
      and.push({ customer: { leadTagItems: { none: {} } } });
    } else {
      const realIds = filter.minatTagIds.filter((id) => id !== "__none__");
      if (realIds.length > 0) {
        and.push({ customer: { leadTagItems: { some: { tagId: { in: realIds } } } } });
      }
    }
  }
  if (filter.hasFuPending) {
    and.push({ customer: { followUps: { some: { status: "PENDING" } } } });
  }
  if (filter.needsFollowUp) {
    and.push({ needsFollowUp: true });
  }
  const where: Prisma.ConversationWhereInput = and.length
    ? { AND: [base, ...and] }
    : base;

  return prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: Math.min(filter.take ?? 50, 500),
    include: {
      customer: { select: { name: true, externalId: true, channel: true, windowExpiresAt: true } },
      assignedTo: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, text: true, status: true } },
    },
  });
}

export async function setAiPaused(
  convId: string,
  paused: boolean,
  session: SessionUser,
) {
  const conv = await prisma.conversation.findFirst({
    where: { id: convId, ...inboxWhere(session) },
  });
  if (!conv) throw new Error("Percakapan tidak ditemukan");
  const updated = await prisma.conversation.update({
    where: { id: convId },
    data: { aiPaused: paused, ...(paused ? { needsFollowUp: false } : {}) },
  });
  broadcastInbox(convId);
  return updated;
}

export async function markUnread(convId: string, session: SessionUser) {
  const conv = await prisma.conversation.findFirst({
    where: { id: convId, ...inboxWhere(session) },
  });
  if (!conv) throw new Error("Percakapan tidak ditemukan");
  return prisma.conversation.update({
    where: { id: convId },
    data: { unread: conv.unread > 0 ? conv.unread : 1 },
  });
}

export async function getConversation(id: string, session: SessionUser) {
  const conv = await prisma.conversation.findFirst({
    where: { id, ...inboxWhere(session) },
    include: {
      customer: true,
      assignedTo: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          replyTo: { select: { id: true, text: true, mediaType: true, direction: true } },
        },
      },
    },
  });
  if (conv && conv.unread > 0) {
    await prisma.conversation.update({ where: { id }, data: { unread: 0 } });
  }
  return conv;
}

export type Attachment = { url: string; type: string; name?: string };

export async function sendReply(
  convId: string,
  text: string,
  session: SessionUser,
  attachments: Attachment[] = [],
  replyToId?: string | null,
) {
  const conv = await prisma.conversation.findFirst({
    where: { id: convId, ...inboxWhere(session) },
  });
  if (!conv) throw new Error("Percakapan tidak ditemukan");

  // Validasi authorId — kalau user ID tidak ada di DB (misal setelah re-seed),
  // set null agar FK tidak gagal.
  const authorExists = await prisma.user.findUnique({ where: { id: session.uid }, select: { id: true } });
  const authorId = authorExists ? session.uid : null;

  // bubble yang dibalas (buat kutipan + kirim quoted ke WhatsApp)
  const replyTarget = replyToId
    ? await prisma.message.findFirst({
        where: { id: replyToId, conversationId: convId },
        select: { id: true, externalId: true, direction: true, text: true },
      })
    : null;

  const created = [];
  if (text.trim()) {
    created.push(
      await prisma.message.create({
        data: {
          conversationId: convId,
          direction: "OUT",
          text,
          status: "SENT",
          authorId,
          replyToId: replyTarget ? replyTarget.id : null,
        },
      }),
    );
  }
  for (const a of attachments) {
    created.push(
      await prisma.message.create({
        data: {
          conversationId: convId,
          direction: "OUT",
          mediaUrl: a.url,
          mediaType: a.type,
          text: a.name ?? null,
          status: "SENT",
          authorId,
          // kutipan hanya nempel di bubble pertama kalau tak ada teks
          replyToId: replyTarget && created.length === 0 ? replyTarget.id : null,
        },
      }),
    );
  }

  const preview =
    text.trim() ||
    (attachments.length ? `[${attachments[0].type}] ${attachments[0].name ?? ""}` : "");
  await prisma.conversation.update({
    where: { id: convId },
    data: {
      lastMessageAt: new Date(),
      lastMessageText: preview,
      ...(conv.assignedToId === null && session.role === "AGENT"
        ? { assignedToId: session.uid }
        : {}),
    },
  });
  // kirim ke channel asli (WA_CLOUD/WA_QR); SIMULATOR = no-op
  await deliverOutbound(convId, {
    text,
    attachments,
    messageIds: created.map((c) => c.id),
    replyTo: replyTarget
      ? { externalId: replyTarget.externalId, fromMe: replyTarget.direction === "OUT", text: replyTarget.text }
      : undefined,
  });

  // Jalankan rules juga untuk pesan keluar (agen) — misal trigger Purchase event
  if (text.trim()) {
    void runRules({ customerId: conv.customerId, conversationId: convId, text });
  }

  // Catat agent sebagai handler conversation (primary/secondary tracking)
  if (authorId) void recordAgentMessage(convId, authorId);

  if (authorId) {
    // Hitung FRT (hanya sekali, saat pertama kali manual reply)
    void recordFirstResponse(convId);
    // Agent manual reply → hapus flag "perlu tindak lanjut" (await agar clear sebelum broadcast)
    await prisma.conversation.update({
      where: { id: convId },
      data: { needsFollowUp: false },
    });
  }

  broadcastInbox(convId, "outgoing");
  return created;
}

// Inti pemrosesan pesan masuk — dipakai simulator & channel asli (WA_CLOUD, dll).
export async function ingestIncoming(input: {
  channel: "SIMULATOR" | "WA_CLOUD" | "WA_QR" | "INSTAGRAM" | "MESSENGER";
  channelAccountId?: string | null;
  from: string;
  name?: string;
  text: string;
  externalId?: string; // id pesan dari channel (anti-duplikat webhook)
  mediaUrl?: string | null; // media masuk (sudah diunduh & disimpan)
  mediaType?: string | null; // image | video | audio | document
  replyToExternalId?: string | null; // wamid bubble yang dibalas pelanggan
  referral?: { source_url?: string; source_type?: string; source_id?: string; ctwa_clid?: string; headline?: string; body?: string; media_type?: string; image_url?: string; thumbnail_url?: string } | null;
  metaSubType?: "DM" | "COMMENT"; // hanya untuk INSTAGRAM & MESSENGER
}) {
  // anti-duplikat (Meta bisa kirim webhook berulang)
  if (input.externalId) {
    const dup = await prisma.message.findFirst({ where: { externalId: input.externalId } });
    if (dup) {
      // Retry T-code attribution jika webhook pertama gagal (silent catch)
      if (dup.text) {
        const codeMatch = dup.text.match(/\[T-([A-Z0-9]{5})\]/i);
        if (codeMatch) {
          const code = `T-${codeMatch[1].toUpperCase()}`;
          const clickSess = await prisma.clickSession.findUnique({ where: { code } }).catch(() => null);
          if (clickSess && !clickSess.customerId) {
            const cust = await prisma.customer.findUnique({
              where: { channel_externalId: { channel: input.channel, externalId: input.from } },
              select: { id: true },
            }).catch(() => null);
            if (cust) {
              const existingMatch = await prisma.clickSession.findFirst({
                where: { linkId: clickSess.linkId, adId: clickSess.adId ?? null, customerId: cust.id },
              }).catch(() => null);
              if (!existingMatch) {
                await prisma.clickSession.update({
                  where: { code },
                  data: { customerId: cust.id, matchedAt: new Date() },
                }).catch((err) => console.error("[attribution-dup T-code]", err));
                console.log(`[attribution-dup] Linked ${code} → ${cust.id} on webhook retry`);
              }
            }
          }
        }
      }
      return { customerId: "", conversationId: dup.conversationId, duplicate: true };
    }
  }

  // petakan balasan pelanggan ke bubble kita (kutipan)
  const replyToId = input.replyToExternalId
    ? (
        await prisma.message.findFirst({
          where: { externalId: input.replyToExternalId },
          select: { id: true },
        })
      )?.id ?? null
    : null;

  const now = new Date();
  const windowExpiresAt = new Date(now.getTime() + WINDOW_MS);

  const existing = await prisma.customer.findUnique({
    where: { channel_externalId: { channel: input.channel, externalId: input.from } },
  });
  const isFirstMessage = !existing;

  const customer = await prisma.customer.upsert({
    where: { channel_externalId: { channel: input.channel, externalId: input.from } },
    update: { lastContactAt: now, windowExpiresAt, ...(input.name ? { name: input.name } : {}) },
    create: {
      channel: input.channel,
      externalId: input.from,
      name: input.name ?? null,
      phone: input.from,
      lastContactAt: now,
      windowExpiresAt,
    },
  });

  // Percakapan dipisah PER NOMOR BISNIS (channelAccountId). Pelanggan yang sama
  // chat ke nomor Depok vs Pondok Kelapa = dua percakapan terpisah, tidak nyampur.
  let conv = await prisma.conversation.findFirst({
    where: {
      customerId: customer.id,
      status: { not: "CLOSED" },
      ...(input.channelAccountId
        ? { channelAccountId: input.channelAccountId }
        : { channelAccountId: null }),
    },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conv) {
    conv = await prisma.conversation.create({
      data: {
        customerId: customer.id,
        channel: input.channel,
        channelAccountId: input.channelAccountId ?? null,
        status: "OPEN",
        metaSubType: input.metaSubType ?? null,
      },
    });
  }

  await prisma.message.create({
    data: {
      conversationId: conv.id,
      direction: "IN",
      text: input.text || null,
      mediaUrl: input.mediaUrl ?? null,
      mediaType: input.mediaType ?? null,
      status: "DELIVERED",
      externalId: input.externalId ?? null,
      replyToId,
    },
  });
  // Pesan masuk: evaluasi ulang syarat secondary untuk agent PENDING
  void onIncomingMessage(conv.id);
  // Cek jam kerja — kirim auto-reply luar jam + tandai perlu tindak lanjut
  // Komentar IG/FB: badge muncul tapi tidak kirim pesan otomatis
  void maybeOutsideHoursReply(conv.id, input.metaSubType === "COMMENT");

  // CTWA card: simpan preview iklan sebagai bubble khusus (sekali per percakapan)
  if (input.referral?.source_type === "ad") {
    const hasCard = await prisma.message.findFirst({
      where: { conversationId: conv.id, mediaType: "ctwa_ref" },
      select: { id: true },
    });
    if (!hasCard) {
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: "IN",
          text: JSON.stringify({
            sourceUrl: input.referral.source_url ?? null,
            headline:  input.referral.headline  ?? null,
            body:      input.referral.body      ?? null,
            imageUrl:  input.referral.image_url ?? input.referral.thumbnail_url ?? null,
            adId:      input.referral.source_id ?? null,
          }),
          mediaType: "ctwa_ref",
          status: "DELIVERED",
          createdAt: new Date(now.getTime() - 500), // muncul sebelum pesan customer
        },
      });
    }
  }

  // Lead attribution: deteksi kode [T-XXXX] dari pesan pertama
  if (input.text) {
    const codeMatch = input.text.match(/\[T-([A-Z0-9]{5})\]/i);
    if (codeMatch) {
      const code = `T-${codeMatch[1]}`;
      try {
        const session = await prisma.clickSession.findUnique({ where: { code } });
        if (session && !session.customerId) {
          // Skip jika sudah ada session dari link+creative yang sama
          const existing = await prisma.clickSession.findFirst({
            where: { linkId: session.linkId, adId: session.adId ?? null, customerId: customer.id },
          });
          if (!existing) {
            await prisma.clickSession.update({
              where: { code },
              data: { customerId: customer.id, matchedAt: now },
            });
          }
        }
      } catch (err) {
        console.error("[attribution T-code]", err);
      }
    }
  }

  // CTWA attribution: deteksi pesan dari iklan Click-to-WhatsApp
  let ctwaAdId: string | undefined;
  if (input.referral?.source_type === "ad") {
    const adId = input.referral.source_id ?? null;
    const ctwaClid = input.referral.ctwa_clid ?? null;
    const ctwaSlug = `ctwa-${input.channelAccountId ?? "default"}`;

    // Find or auto-create virtual tracking link untuk CTWA
    let ctwaLink = await prisma.trackingLink.findUnique({ where: { slug: ctwaSlug } });
    if (!ctwaLink) {
      ctwaLink = await prisma.trackingLink.create({
        data: { slug: ctwaSlug, name: "CTWA Auto", greetingTemplate: "", isActive: true },
      });
    }

    // Deduplication: skip jika ad yang sama sudah ada session untuk customer ini (30 hari)
    const recentCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const existingCtwa = await prisma.clickSession.findFirst({
      where: { customerId: customer.id, adId, createdAt: { gte: recentCutoff } },
    });

    if (!existingCtwa) {
      // Generate kode C-XXXXX untuk CTWA (tidak muncul di pesan WA)
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let cCode = "C-";
      for (let i = 0; i < 5; i++) cCode += chars[Math.floor(Math.random() * chars.length)];
      // Pastikan unik
      for (let i = 0; i < 5; i++) {
        const exists = await prisma.clickSession.findUnique({ where: { code: cCode } });
        if (!exists) break;
        cCode = "C-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      }
      await prisma.clickSession.create({
        data: {
          linkId: ctwaLink.id,
          code: cCode,
          adId,
          fbclid: ctwaClid,
          customerId: customer.id,
          matchedAt: now,
        },
      }).catch(() => {});
    }

    ctwaAdId = adId ?? undefined;
  }

  const preview = input.text || (input.mediaType ? `[${input.mediaType}]` : "");
  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      lastMessageAt: now,
      lastMessageText: preview,
      unread: { increment: 1 },
      status: "OPEN",
    },
  });

  // webhook keluar: pesan masuk
  void fireWebhook("message.received", {
    conversationId: conv.id,
    from: input.from,
    name: input.name ?? null,
    text: input.text,
    channel: input.channel,
  });

  // notifikasi Telegram: ada chat masuk
  let channelLabel: string | null = null;
  if (input.channelAccountId) {
    const acc = await prisma.wabaChannel.findUnique({
      where: { phoneNumberId: input.channelAccountId },
      select: { label: true },
    });
    channelLabel = acc?.label ?? null;
  }
  void notifyIncoming({
    name: customer.name ?? input.name ?? null,
    from: input.from,
    text: input.text || (input.mediaType ? `[${input.mediaType}]` : ""),
    channelLabel,
    conversationId: conv.id,
  });

  // push aktivitas chat masuk ke Konektor (opt-in)
  void pushChatActivity({
    customerId: customer.id,
    phone: customer.phone ?? input.from,
    name: customer.name ?? input.name ?? null,
    konektorId: customer.konektorId,
    conversationId: conv.id,
    direction: "IN",
    text: input.text || (input.mediaType ? `[${input.mediaType}]` : ""),
  });

  // jalankan tag otomatis & balas otomatis (sendSystemMessages sudah kirim ke channel)
  void runRules({ customerId: customer.id, conversationId: conv.id, text: input.text || "", ctwaAdId });

  const auto = await runAutomations({
    customerId: customer.id,
    conversationId: conv.id,
    text: input.text,
    isFirstMessage,
  });

  // perilaku chatbot: eskalasi -> jam kerja -> AI
  const settings = await getAiSettings();

  if (matchesEscalation(input.text, settings)) {
    // pelanggan minta manusia -> alihkan ke agen, AI berhenti
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { aiPaused: true },
    });
    if (settings.escalationMessage?.trim())
      await systemReply(conv.id, settings.escalationMessage);
  } else {
    const fresh = await prisma.conversation.findUnique({
      where: { id: conv.id },
      select: { aiPaused: true },
    });
    if (!fresh?.aiPaused) {
      const outsideHours = isOutsideHours(settings);
      // alwaysActive: AI tetap jalan 24 jam, pesan "kami tutup" tidak dikirim
      if (outsideHours && !settings.alwaysActive) {
        if (settings.outsideMessage?.trim())
          await systemReply(conv.id, settings.outsideMessage);
      } else if (auto.autoReplied === 0) {
        // Beri tahu client bahwa AI sedang memproses
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { aiTyping: true, aiTypingAt: new Date() },
        });
        try {
          const aiResult = await maybeAutoAiReply(input.text);
          if (aiResult) {
            if (aiResult.draft) {
              // Draft mode: simpan ke conversation, agen yang kirim
              await prisma.conversation.update({
                where: { id: conv.id },
                data: { aiDraft: aiResult.text },
              });
            } else {
              await systemReply(conv.id, aiResult.text);
            }
          }
        } finally {
          // Reset aiTyping apapun yang terjadi (sukses atau error)
          await prisma.conversation.update({
            where: { id: conv.id },
            data: { aiTyping: false, aiTypingAt: null },
          });
        }
      }
    }
  }

  broadcastInbox(conv.id, "incoming");
  void sendPushToAll({
    title: customer.name ?? customer.externalId ?? "Pesan baru",
    body: input.text.slice(0, 100),
    conversationId: conv.id,
    url: `/inbox?c=${conv.id}`,
  });
  return { customerId: customer.id, conversationId: conv.id };
}

// Simulasi pesan masuk (channel SIMULATOR).
export async function simulateIncoming(input: {
  from: string;
  name?: string;
  text: string;
}) {
  return ingestIncoming({ channel: "SIMULATOR", from: input.from, name: input.name, text: input.text });
}
