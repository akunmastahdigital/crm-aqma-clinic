import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { broadcastInbox } from "@/lib/sse-hub";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}

// GET /api/webchat/session/[token]/messages?after=<iso-date>
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sp = new URL(req.url).searchParams;
  const after = sp.get("after");

  const session = await prisma.webChatSession.findUnique({ where: { token }, select: { conversationId: true, identified: true } });
  if (!session?.conversationId) return NextResponse.json({ messages: [] });

  const messages = await prisma.message.findMany({
    where: {
      conversationId: session.conversationId,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: { id: true, direction: true, text: true, mediaUrl: true, mediaType: true, status: true, createdAt: true },
  });

  return NextResponse.json({ messages });
}

// POST /api/webchat/session/[token]/messages
// Body: { text: string }
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const { text } = body as { text?: string };

  if (!text?.trim()) return NextResponse.json({ error: "Pesan tidak boleh kosong" }, { status: 400 });

  const session = await prisma.webChatSession.findUnique({ where: { token } });
  if (!session) return NextResponse.json({ error: "Session tidak valid" }, { status: 404 });
  if (!session.identified || !session.conversationId) {
    return NextResponse.json({ error: "Harap isi data diri terlebih dahulu" }, { status: 403 });
  }

  const msg = await prisma.message.create({
    data: { conversationId: session.conversationId, direction: "IN", text: text.trim(), status: "DELIVERED" },
    select: { id: true, direction: true, text: true, status: true, createdAt: true },
  });

  // Update conversation lastMessage + unread
  await prisma.conversation.update({
    where: { id: session.conversationId },
    data: { lastMessageAt: new Date(), lastMessageText: text.trim(), unread: { increment: 1 } },
  });
  await prisma.webChatSession.update({ where: { token }, data: { lastActiveAt: new Date() } });

  // Notify CRM inbox (SSE ke agents)
  broadcastInbox(session.conversationId, "incoming");

  return NextResponse.json({ message: msg });
}
