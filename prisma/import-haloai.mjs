import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const TOKEN = process.env.HALOAI_TOKEN;
const BID = process.env.HALOAI_BID;
const MAX_ROOMS = process.env.MAX_ROOMS ? parseInt(process.env.MAX_ROOMS, 10) : Infinity;
const ONLY_INBOX = process.env.ONLY_INBOX || null; // batasi ke 1 inbox (buat tes)
const MAPPED_ONLY = process.env.MAPPED_ONLY === "1"; // cuma nomor yang terdaftar di CRM
const UNMAPPED_ONLY = process.env.UNMAPPED_ONLY === "1"; // cuma cabang yang BELUM dimapping
const FORCE_ACCOUNT = process.env.FORCE_ACCOUNT || null; // paksa semua ke phoneNumberId ini

if (!TOKEN || !BID) { console.error("HALOAI_TOKEN / HALOAI_BID kosong"); process.exit(1); }

const BASE = "https://www.haloai.co.id/api/open";
const H = { Authorization: `Bearer ${TOKEN}`, "X-HaloAI-Business-Id": BID };
const onlyDigits = (s) => (s || "").replace(/\D/g, "");
const norm = (p) => { let d = onlyDigits(p); if (d.startsWith("0")) d = "62" + d.slice(1); return d; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 8) {
  for (let i = 0; i < tries; i++) {
    await sleep(400); // throttle biar nggak kena rate limit
    let r;
    try {
      r = await fetch(url, { headers: H });
    } catch {
      await sleep(3000 * (i + 1));
      continue;
    }
    if (r.status === 429 || r.status >= 500) {
      await sleep(3000 * (i + 1)); // backoff
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }
  throw new Error(`gagal setelah retry: ${url}`);
}

// paginate offset+nextCursor
async function* paginate(build) {
  let offset = 0;
  while (true) {
    const d = await getJson(build(offset));
    const rows = d.data || [];
    for (const row of rows) yield row;
    if (d.nextCursor == null || rows.length === 0) break;
    offset = d.nextCursor;
  }
}

function messageText(contents) {
  const parts = (contents || []).map((c) =>
    c.type === "text" ? (c.text || "") : `[${c.type}]${c.text ? " " + c.text : ""}`,
  );
  return parts.join("\n").trim();
}

async function main() {
  // 1) channel -> phone -> phoneNumberId kita
  const channels = [];
  for await (const c of paginate((o) => `${BASE}/channel/v1/list?limit=50&offset=${o}`)) channels.push(c);
  const waba = await prisma.wabaChannel.findMany();
  const byPhone = {};
  for (const w of waba) byPhone[norm(w.displayPhone)] = w.phoneNumberId;

  const inboxes = [];
  for (const c of channels) {
    if (!c.inboxId) continue;
    const phone = norm((c.label || "").match(/(\d[\d]{6,})/)?.[1] || "");
    inboxes.push({ inboxId: c.inboxId, label: c.label, phoneNumberId: byPhone[phone] || null });
  }
  console.log("channel/inbox:", inboxes.map((i) => `${i.label} -> ${i.phoneNumberId || "(no map)"}`).join(" | "));

  let roomCount = 0, msgNew = 0, msgSkip = 0;

  for (const ib of inboxes) {
    if (ONLY_INBOX && ib.inboxId !== ONLY_INBOX) continue;
    if (MAPPED_ONLY && !ib.phoneNumberId) continue;
    if (UNMAPPED_ONLY && ib.phoneNumberId) continue; // lewati Depok/Pondok Kelapa (sudah)
    const accountId = FORCE_ACCOUNT || ib.phoneNumberId; // nomor tujuan di CRM
    for await (const room of paginate((o) =>
      `${BASE}/room/v1/list?limit=50&offset=${o}&inboxId=${ib.inboxId}&sortBy=created_at&sortOrder=asc`)) {
      if (roomCount >= MAX_ROOMS) break;
      const phone = norm(room.contactPhone);
      if (!phone) continue;

      const customer = await prisma.customer.upsert({
        where: { channel_externalId: { channel: "WA_CLOUD", externalId: phone } },
        update: { name: room.name || undefined, lastContactAt: room.lastMessageAt ? new Date(room.lastMessageAt) : undefined },
        create: { channel: "WA_CLOUD", externalId: phone, phone, name: room.name || null, lastContactAt: room.lastMessageAt ? new Date(room.lastMessageAt) : null },
      });

      let conv = await prisma.conversation.findFirst({ where: { customerId: customer.id } });
      if (!conv) {
        conv = await prisma.conversation.create({
          data: {
            customerId: customer.id, channel: "WA_CLOUD", channelAccountId: accountId,
            status: "OPEN", unread: 0,
            lastMessageAt: room.lastMessageAt ? new Date(room.lastMessageAt) : null,
            lastMessageText: room.lastMessageText || null,
          },
        });
      } else if (!conv.channelAccountId && accountId) {
        await prisma.conversation.update({ where: { id: conv.id }, data: { channelAccountId: accountId } });
      }

      // SKIP room yang sudah lengkap (nggak fetch pesan lagi -> hemat kuota API)
      if (room.lastMessageAt) {
        const latest = await prisma.message.findFirst({
          where: { conversationId: conv.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true },
        });
        if (latest && latest.createdAt >= new Date(room.lastMessageAt)) { roomCount++; continue; }
      }

      // dedup existing externalIds di conversation ini
      const existing = new Set(
        (await prisma.message.findMany({ where: { conversationId: conv.id, externalId: { not: null } }, select: { externalId: true } }))
          .map((m) => m.externalId),
      );

      try {
        const toCreate = [];
        for await (const m of paginate((o) => `${BASE}/message/v1/list?roomId=${room.id}&limit=50&offset=${o}`)) {
          const ext = m.externalId || m.id;
          if (existing.has(ext)) { msgSkip++; continue; }
          existing.add(ext);
          const dir = m.sender?.type === "customer" ? "IN" : "OUT";
          // JANGAN buang pesan apa pun (termasuk agent) — fallback penanda
          const text = messageText(m.contents) || "[pesan]";
          toCreate.push({
            conversationId: conv.id, direction: dir, text,
            status: dir === "IN" ? "DELIVERED" : "SENT",
            externalId: ext, createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
          });
          msgNew++;
        }
        if (toCreate.length) await prisma.message.createMany({ data: toCreate });
      } catch (e) {
        console.log(`  room ${room.id} gagal (${e.message}) — lanjut`);
      }
      roomCount++;
      if (roomCount % 25 === 0) console.log(`... ${roomCount} room diproses, ${msgNew} pesan baru`);
    }
  }

  console.log(`SELESAI: ${roomCount} room, ${msgNew} pesan baru, ${msgSkip} dilewati (dedup)`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
