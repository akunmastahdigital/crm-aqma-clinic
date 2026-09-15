import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_automation"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (body.shortcut !== undefined) {
    let s = body.shortcut.toString().trim();
    if (!s.startsWith("/")) s = "/" + s;
    s = s.replace(/\s+/g, "").toLowerCase();
    data.shortcut = s;
  }
  if (body.category !== undefined) data.category = body.category ? body.category.toString().trim() : null;
  if (body.title !== undefined) data.title = body.title ? body.title.toString().trim() : null;
  if (body.text !== undefined) data.text = body.text.toString() || null;
  if (body.attachments !== undefined) data.attachments = body.attachments;

  const item = await prisma.quickReply.update({ where: { id }, data });
  return NextResponse.json({ item });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_automation"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.quickReply.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
