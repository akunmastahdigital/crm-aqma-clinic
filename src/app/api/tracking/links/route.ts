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
      waQrChannel: { select: { id: true, label: true, phone: true } },
    },
  });

  // Normalise: expose single `channel` field to client regardless of type
  const normalized = links.map(l => ({
    ...l,
    channel: l.channel
      ? { id: l.channel.id, label: l.channel.label, displayPhone: l.channel.displayPhone }
      : l.waQrChannel
      ? { id: l.waQrChannel.id, label: l.waQrChannel.label, displayPhone: l.waQrChannel.phone ?? null }
      : null,
    channelId: l.channelId ?? l.waQrChannelId ?? null,
    waQrChannel: undefined,
  }));

  return NextResponse.json({ links: normalized });
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

  // Cek apakah channelId milik WA Cloud atau WA QR
  const wabaCh = await prisma.wabaChannel.findFirst({ where: { OR: [{ id: channelId }, { phoneNumberId: channelId }] } });
  if (wabaCh) {
    const link = await prisma.trackingLink.create({
      data: { slug, name, greetingTemplate, codePosition: codePosition ?? "after", channelId: wabaCh.id, waQrChannelId: null, pageViewEvent: pageViewEvent ?? null, clickEvent: clickEvent ?? null },
      include: { channel: { select: { id: true, label: true, displayPhone: true } } },
    });
    return NextResponse.json({ link });
  }

  const qrCh = await prisma.waQrChannel.findUnique({ where: { id: channelId } });
  if (qrCh) {
    const link = await prisma.trackingLink.create({
      data: { slug, name, greetingTemplate, codePosition: codePosition ?? "after", channelId: null, waQrChannelId: qrCh.id, pageViewEvent: pageViewEvent ?? null, clickEvent: clickEvent ?? null },
      include: { waQrChannel: { select: { id: true, label: true, phone: true } } },
    });
    return NextResponse.json({ link });
  }

  return NextResponse.json({ error: "Channel tidak ditemukan" }, { status: 400 });
}
