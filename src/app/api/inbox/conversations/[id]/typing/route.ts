import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { broadcastWebChat } from "@/lib/webchat-sse-hub";

export const dynamic = "force-dynamic";

// POST /api/inbox/conversations/[id]/typing — agent sedang mengetik, notify widget
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { id } = await params;
  const conv = await prisma.conversation.findFirst({ where: { id }, select: { channel: true } });
  if (conv?.channel !== "WEBCHAT") return NextResponse.json({ ok: false });

  broadcastWebChat(id, { type: "typing" });
  return NextResponse.json({ ok: true });
}
