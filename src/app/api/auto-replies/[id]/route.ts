import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

async function guard() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!can(session.role, "manage_automation"))
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { session };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const item = await prisma.autoReply.update({
    where: { id },
    data: { active: !!body.active },
  });
  return NextResponse.json({ item });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;
  await prisma.autoReply.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
