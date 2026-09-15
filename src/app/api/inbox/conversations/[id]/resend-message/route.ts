import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deliverOutbound } from "@/lib/delivery";

export const dynamic = "force-dynamic";

// POST /api/inbox/conversations/[id]/resend-message
// Body: { messageId: string }
// Kirim ulang pesan FAILED (media/teks).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id: conversationId } = await params;
  const body = await req.json().catch(() => ({}));
  const messageId = body.messageId?.toString();
  if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });

  const msg = await prisma.message.findFirst({
    where: { id: messageId, conversationId, direction: "OUT", status: "FAILED" },
  });
  if (!msg) return NextResponse.json({ error: "Pesan tidak ditemukan atau bukan status FAILED" }, { status: 404 });

  // Reset ke SENT agar bisa dilacak ulang via webhook
  await prisma.message.update({
    where: { id: messageId },
    data: { status: "SENT", externalId: null },
  });

  const attachments = msg.mediaUrl
    ? [{ url: msg.mediaUrl, type: msg.mediaType ?? "document", name: msg.text ?? undefined }]
    : [];

  await deliverOutbound(conversationId, {
    text: msg.mediaUrl ? undefined : (msg.text ?? undefined),
    attachments,
    messageIds: [messageId],
  });

  return NextResponse.json({ ok: true });
}
