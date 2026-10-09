import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  // Resolve channelId ke jenis channel yang tepat
  let resolvedChannelId: string | null = null;
  let resolvedWaQrChannelId: string | null = null;
  if (body.channelId) {
    const wabaCh = await prisma.wabaChannel.findFirst({ where: { OR: [{ id: body.channelId }, { phoneNumberId: body.channelId }] } });
    if (wabaCh) {
      resolvedChannelId = wabaCh.id;
    } else {
      const qrCh = await prisma.waQrChannel.findUnique({ where: { id: body.channelId } });
      if (qrCh) resolvedWaQrChannelId = qrCh.id;
    }
  }

  const link = await prisma.trackingLink.update({
    where: { id },
    data: {
      name: body.name,
      greetingTemplate: body.greetingTemplate,
      codePosition: body.codePosition,
      channelId: resolvedChannelId,
      waQrChannelId: resolvedWaQrChannelId,
      isActive: body.isActive,
      pageViewEvent: body.pageViewEvent ?? null,
      clickEvent: body.clickEvent ?? null,
    },
  });
  return NextResponse.json({ link });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.trackingLink.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
