import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const WINDOWS = [
  { start: 15 * 60 + 30, end: 16 * 60 + 30 },
  { start: 21 * 60 + 30, end: 22 * 60 + 30 },
];

const LOOKBACK_DAYS = 7; // tampilkan carry-over sampai 7 hari ke belakang

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ needsReminder: false, leads: [] });

  const nowUtc = new Date();
  const jakartaOffset = 7 * 60 * 60 * 1000;
  const nowJkt = new Date(nowUtc.getTime() + jakartaOffset);
  const jktMinutes = nowJkt.getUTCHours() * 60 + nowJkt.getUTCMinutes();

  const inWindow = WINDOWS.some((w) => jktMinutes >= w.start && jktMinutes < w.end);
  if (!inWindow) return NextResponse.json({ needsReminder: false, leads: [] });

  // Start of today (WIB) dan lookback 7 hari
  const startOfToday = new Date(
    Date.UTC(nowJkt.getUTCFullYear(), nowJkt.getUTCMonth(), nowJkt.getUTCDate()) - jakartaOffset
  );
  const startLookback = new Date(startOfToday.getTime() - (LOOKBACK_DAYS - 1) * 24 * 60 * 60 * 1000);

  // Customer yang sudah dijurnal oleh agent ini dalam 7 hari terakhir
  const journaled = await prisma.salesJournal.findMany({
    where: { userId: session.uid, date: { gte: startLookback } },
    select: { customerId: true },
  });
  const journaledIds = new Set(journaled.map((j) => j.customerId));

  // Conversation aktif 7 hari ke belakang yang di-assign ke agent ini
  const convs = await prisma.conversation.findMany({
    where: {
      assignedToId: session.uid,
      lastMessageAt: { gte: startLookback },
      status: { not: "CLOSED" },
    },
    select: {
      customerId: true,
      lastMessageAt: true,
      customer: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { lastMessageAt: "asc" }, // yang paling lama dulu
  });

  // Unik per customer, buang yang sudah dijurnal
  const seen = new Set<string>();
  const leads: { id: string; name: string; lastActiveAt: string }[] = [];
  for (const c of convs) {
    if (seen.has(c.customerId) || journaledIds.has(c.customerId)) continue;
    seen.add(c.customerId);
    leads.push({
      id: c.customerId,
      name: c.customer?.name || c.customer?.phone || "Lead",
      lastActiveAt: (c.lastMessageAt ?? nowUtc).toISOString(),
    });
  }

  return NextResponse.json({ needsReminder: leads.length > 0, leads });
}
