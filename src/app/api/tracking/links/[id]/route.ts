import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const link = await prisma.trackingLink.update({
    where: { id },
    data: {
      name: body.name,
      greetingTemplate: body.greetingTemplate,
      codePosition: body.codePosition,
      channelId: body.channelId,
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
