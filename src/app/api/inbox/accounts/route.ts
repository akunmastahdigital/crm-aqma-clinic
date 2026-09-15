import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Semua channel aktif untuk filter inbox (WABA, QR, Instagram, Messenger)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [waba, qr, meta] = await Promise.all([
    prisma.wabaChannel.findMany({
      where: { active: true },
      select: { phoneNumberId: true, label: true, displayPhone: true },
      orderBy: { label: "asc" },
    }),
    prisma.waQrChannel.findMany({
      where: { active: true },
      select: { id: true, label: true, phone: true },
      orderBy: { label: "asc" },
    }),
    prisma.metaChannel.findMany({
      where: { active: true },
      select: { id: true, label: true, type: true },
      orderBy: { label: "asc" },
    }),
  ]);

  const accounts = [
    ...waba.map((c) => ({ id: c.phoneNumberId, label: c.label, sub: c.displayPhone ?? null, type: "WA_CLOUD" as const })),
    ...qr.map((c) => ({ id: c.id, label: c.label, sub: c.phone ?? null, type: "WA_QR" as const })),
    ...meta.map((c) => ({ id: c.id, label: c.label, sub: null, type: c.type as "INSTAGRAM" | "MESSENGER" })),
  ];

  return NextResponse.json({ accounts });
}
