import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConversation } from "@/lib/inbox";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const conversation = await getConversation(id, session);
  if (!conversation)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || !can(session.role, "assign_chats"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { assignedToId } = body as { assignedToId?: string | null };
  if (assignedToId !== null && assignedToId !== undefined && typeof assignedToId !== "string")
    return NextResponse.json({ error: "invalid assignedToId" }, { status: 400 });
  const conv = await prisma.conversation.findUnique({ where: { id } });
  if (!conv) return NextResponse.json({ error: "not found" }, { status: 404 });
  const updated = await prisma.conversation.update({
    where: { id },
    data: { assignedToId: assignedToId ?? null },
    include: { assignedTo: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ conversation: updated });
}
