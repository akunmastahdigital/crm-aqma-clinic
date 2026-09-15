import { prisma } from "@/lib/db";
import { sendWabaText, sendWabaMedia } from "@/lib/waba";
import { sendIgDM, sendMessengerDM } from "@/lib/meta-messaging";
import { fireWebhook } from "@/lib/webhooks";
import { pushChatActivity } from "@/lib/konektor-sync";

type Att = { url: string; type: string; name?: string };
type ReplyTo = { externalId: string | null; fromMe: boolean; text: string | null };
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://crm.klinikaqma.com";

// Simpan wamid balasan ke Message.externalId (biar reply masuk bisa dipetakan ke bubble ini).
async function persistIds(messageIds: string[] | undefined, ids: (string | null)[]) {
  if (!messageIds) return;
  for (let i = 0; i < messageIds.length && i < ids.length; i++) {
    if (ids[i]) {
      await prisma.message
        .update({ where: { id: messageIds[i] }, data: { externalId: ids[i] } })
        .catch(() => {});
    }
  }
}

// Kirim pesan keluar ke channel asli. SIMULATOR = tak ada pengiriman eksternal.
export async function deliverOutbound(
  conversationId: string,
  payload: {
    text?: string | null;
    attachments?: Att[];
    messageIds?: string[]; // baris OUT urut [teks?, ...lampiran] — buat simpan wamid
    replyTo?: ReplyTo; // kutipan bubble yang dibalas
  },
) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true },
  });
  if (!conv) return;

  const hasText = !!(payload.text && payload.text.trim());
  const atts = payload.attachments ?? [];
  const quoteWamid = payload.replyTo?.externalId ?? null;

  if (conv.channel === "WA_CLOUD" && conv.channelAccountId) {
    const ch = await prisma.wabaChannel.findUnique({
      where: { phoneNumberId: conv.channelAccountId },
    });
    if (!ch || !ch.active) return;
    const to = conv.customer.externalId;
    const ids: (string | null)[] = [];
    try {
      let first = true;
      if (hasText) {
        const r = await sendWabaText(ch.phoneNumberId, to, payload.text!, ch.accessToken, first ? quoteWamid : null);
        ids.push(r.id);
        first = false;
      }
      for (const a of atts) {
        const url = a.url.startsWith("http") ? a.url : `${APP_URL}${a.url}`;
        const type = (["image", "video", "audio", "document"] as const).includes(
          a.type as "image",
        )
          ? (a.type as "image" | "video" | "audio" | "document")
          : "document";
        const r = await sendWabaMedia(ch.phoneNumberId, to, type, url, ch.accessToken, a.name, first ? quoteWamid : null);
        ids.push(r.id);
        first = false;
      }
      await persistIds(payload.messageIds, ids);
      void fireWebhook("message.sent", {
        conversationId: conv.id,
        to,
        text: payload.text ?? null,
      });
    } catch (e) {
      console.error("deliverOutbound WA_CLOUD error:", e);
    }
  }

  // WhatsApp mode QR (Baileys) — kirim lewat worker (teks + lampiran + kutipan)
  if (conv.channel === "WA_QR") {
    const to = conv.customer.externalId;
    if (hasText || atts.length) {
      try {
        // Kalau ada channelAccountId → cari port worker dari WaQrChannel, else fallback ke env
        let workerUrl = process.env.WA_WORKER_URL || "http://127.0.0.1:3051";
        if (conv.channelAccountId) {
          const qrCh = await prisma.waQrChannel.findUnique({ where: { id: conv.channelAccountId } });
          if (qrCh) workerUrl = `http://127.0.0.1:${qrCh.port}`;
        }
        const res = await fetch(`${workerUrl}/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": process.env.INTERNAL_SECRET || "",
          },
          body: JSON.stringify({
            to,
            text: payload.text ?? "",
            attachments: atts,
            replyTo: payload.replyTo?.externalId
              ? { id: payload.replyTo.externalId, fromMe: payload.replyTo.fromMe, text: payload.replyTo.text ?? "" }
              : null,
          }),
        });
        const out = await res.json().catch(() => ({}));
        await persistIds(payload.messageIds, Array.isArray(out.ids) ? out.ids : []);
        void fireWebhook("message.sent", { conversationId: conv.id, to, text: payload.text ?? null });
      } catch (e) {
        console.error("deliverOutbound WA_QR error:", e);
      }
    }
  }

  // Instagram DM — lewat Graph API Instagram
  if (conv.channel === "INSTAGRAM" && conv.channelAccountId && hasText) {
    try {
      const ch = await prisma.metaChannel.findUnique({ where: { id: conv.channelAccountId } });
      if (ch && ch.active && ch.igAccountId) {
        const r = await sendIgDM(ch.igAccountId, conv.customer.externalId, payload.text!, ch.pageAccessToken);
        await persistIds(payload.messageIds, [r.message_id ?? null]);
        void fireWebhook("message.sent", { conversationId: conv.id, to: conv.customer.externalId, text: payload.text ?? null });
      }
    } catch (e) {
      console.error("deliverOutbound INSTAGRAM error:", e);
    }
  }

  // Messenger DM — lewat Graph API Facebook
  if (conv.channel === "MESSENGER" && conv.channelAccountId && hasText) {
    try {
      const ch = await prisma.metaChannel.findUnique({ where: { id: conv.channelAccountId } });
      if (ch && ch.active) {
        const r = await sendMessengerDM(ch.pageId, conv.customer.externalId, payload.text!, ch.pageAccessToken);
        await persistIds(payload.messageIds, [r.message_id ?? null]);
        void fireWebhook("message.sent", { conversationId: conv.id, to: conv.customer.externalId, text: payload.text ?? null });
      }
    } catch (e) {
      console.error("deliverOutbound MESSENGER error:", e);
    }
  }

  // push aktivitas balasan agen ke Konektor (opt-in)
  if (hasText || atts.length) {
    void pushChatActivity({
      customerId: conv.customer.id,
      phone: conv.customer.phone ?? conv.customer.externalId,
      name: conv.customer.name,
      konektorId: conv.customer.konektorId,
      conversationId: conv.id,
      direction: "OUT",
      text: payload.text?.trim() || (atts[0] ? `[${atts[0].type}]` : ""),
    });
  }
}
