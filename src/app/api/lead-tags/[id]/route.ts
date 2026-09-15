import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_crm_settings"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const { name, color } = await req.json() as { name?: string; color?: string };
  const data: Record<string, string> = {};
  if (name?.trim()) data.name = name.trim();
  if (color) data.color = color;

  const tag = await prisma.leadTag.update({ where: { id }, data });
  return NextResponse.json({ tag });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_crm_settings"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.leadTag.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
