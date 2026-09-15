import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// PATCH — toggle active atau update label/token
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const channel = await prisma.wabaChannel.update({
    where: { id },
    data: {
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
      ...(body.label?.trim() ? { label: body.label.trim() } : {}),
      ...(body.displayPhone !== undefined ? { displayPhone: body.displayPhone?.trim() || null } : {}),
      ...(body.accessToken?.trim() ? { accessToken: body.accessToken.trim() } : {}),
    },
  });
  return NextResponse.json({ channel });
}

// DELETE — hapus channel WABA
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_channels"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.wabaChannel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
