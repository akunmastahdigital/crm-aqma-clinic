import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const links = await prisma.trackingLink.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { clickSessions: true } },
      channel: { select: { id: true, label: true, displayPhone: true } },
    },
  });
  return NextResponse.json({ links });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { slug, name, greetingTemplate, codePosition, channelId, pageViewEvent, clickEvent } = body;

  if (!slug || !name || !greetingTemplate || !channelId) {
    return NextResponse.json({ error: "Field tidak lengkap" }, { status: 400 });
  }

  const exists = await prisma.trackingLink.findUnique({ where: { slug } });
  if (exists) return NextResponse.json({ error: "Slug sudah dipakai" }, { status: 409 });

  // channelId dari frontend = phoneNumberId; lookup UUID yang sebenarnya
  const ch = await prisma.wabaChannel.findFirst({ where: { OR: [{ id: channelId }, { phoneNumberId: channelId }] } });
  if (!ch) return NextResponse.json({ error: "Channel tidak ditemukan" }, { status: 400 });

  const link = await prisma.trackingLink.create({
    data: { slug, name, greetingTemplate, codePosition: codePosition ?? "after", channelId: ch.id, pageViewEvent: pageViewEvent ?? null, clickEvent: clickEvent ?? null },
    include: { channel: { select: { id: true, label: true, displayPhone: true } } },
  });
  return NextResponse.json({ link });
}
