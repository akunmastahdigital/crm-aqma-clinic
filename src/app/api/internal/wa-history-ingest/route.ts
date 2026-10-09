// Import riwayat chat dari WA QR (Baileys messaging-history.set).
// Tidak memicu automation — hanya menyimpan pesan ke DB.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (req.headers.get("x-internal-secret") !== process.env.INTERNAL_SECRET)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const from: string = String(b.from || "").replace(/\D/g, "");
  const text: string = String(b.text || "");
  const externalId: string | null = b.externalId ? String(b.externalId) : null;
  const fromMe: boolean = !!b.fromMe;
  const channelId: string | null = b.channelId ?? null;
  const name: string | null = b.name ?? null;
  const tsMs: number = b.timestamp ? Number(b.timestamp) : Date.now();

  if (!from || !text.trim()) return NextResponse.json({ ok: true, skipped: true });

  // Anti-duplikat: lewati kalau externalId sudah ada
  if (externalId) {
    const dup = await prisma.message.findFirst({ where: { externalId } });
    if (dup) return NextResponse.json({ ok: true, skipped: true });
  }

  const now = new Date(tsMs);

  // Cari/buat Customer
  const customer = await prisma.customer.upsert({
    where: { channel_externalId: { channel: "WA_QR", externalId: from } },
    update: name ? { name } : {},
    create: { channel: "WA_QR", externalId: from, phone: from, name, lastContactAt: now },
  });

  // Cari/buat Conversation (aktif = tanpa closedAt)
  let conv = await prisma.conversation.findFirst({
    where: { customerId: customer.id, ...(channelId ? { channelAccountId: channelId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (!conv) {
    conv = await prisma.conversation.create({
      data: {
        customerId: customer.id,
        channel: "WA_QR",
        channelAccountId: channelId,
        createdAt: now,
        lastMessageAt: now,
        lastMessageText: text.slice(0, 200),
      },
    });
  }

  // Simpan pesan
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      direction: fromMe ? "OUT" : "IN",
      text,
      externalId,
      status: fromMe ? "SENT" : "DELIVERED",
      createdAt: now,
    },
  });

  // Update lastMessageAt conversation kalau timestamp lebih baru
  if (!conv.lastMessageAt || now > conv.lastMessageAt) {
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: now, lastMessageText: text.slice(0, 200) },
    });
  }

  return NextResponse.json({ ok: true });
}
