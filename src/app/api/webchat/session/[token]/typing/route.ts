import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { broadcastWebChat } from "@/lib/webchat-sse-hub";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/webchat/session/[token]/typing — agent sedang mengetik, notify widget
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { token } = await params;
  const wcs = await prisma.webChatSession.findUnique({ where: { token }, select: { conversationId: true } });
  if (!wcs?.conversationId) return NextResponse.json({ ok: false });

  broadcastWebChat(wcs.conversationId, { type: "typing" });
  return NextResponse.json({ ok: true });
}
