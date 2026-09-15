import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendReply } from "@/lib/inbox";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const text = (body.text ?? "").toString();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  const replyToId = body.replyToId ? body.replyToId.toString() : null;
  if (!text.trim() && attachments.length === 0)
    return NextResponse.json({ error: "kosong" }, { status: 400 });
  const messages = await sendReply(id, text, session, attachments, replyToId);
  return NextResponse.json({ messages });
}
