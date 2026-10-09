import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}

// PATCH /api/webchat/session/[token]/read — visitor membaca pesan OUT (dari agent)
export async function PATCH(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await prisma.webChatSession.findUnique({ where: { token }, select: { conversationId: true } });
  if (!session?.conversationId) return NextResponse.json({ ok: false });

  await prisma.message.updateMany({
    where: { conversationId: session.conversationId, direction: "OUT", status: { not: "READ" } },
    data: { status: "READ" },
  });

  return NextResponse.json({ ok: true });
}
