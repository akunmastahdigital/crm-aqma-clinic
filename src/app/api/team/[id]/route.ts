import { NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";

const ROLES: Role[] = ["OWNER", "SUPERADMIN", "SUPERVISOR", "AGENT", "GUEST"];

async function guard(id: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!can(session.role, "manage_users"))
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };
  // hanya OWNER yang boleh mengutak-atik akun OWNER
  if (target.role === "OWNER" && session.role !== "OWNER")
    return { error: NextResponse.json({ error: "hanya Owner yang bisa mengubah Owner" }, { status: 403 }) };
  return { session, target };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));

  const data: { role?: Role; active?: boolean; name?: string; passwordHash?: string; telegramId?: string | null } = {};
  if (body.role != null) {
    if (!ROLES.includes(body.role))
      return NextResponse.json({ error: "role tidak valid" }, { status: 400 });
    if (body.role === "OWNER" && g.session!.role !== "OWNER")
      return NextResponse.json({ error: "hanya Owner yang bisa mengangkat Owner" }, { status: 403 });
    data.role = body.role;
  }
  if (body.active != null) {
    if (g.target!.id === g.session!.uid && body.active === false)
      return NextResponse.json({ error: "tidak bisa menonaktifkan akun sendiri" }, { status: 400 });
    data.active = !!body.active;
  }
  if (body.name && typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
  }
  if (body.password && typeof body.password === "string" && body.password.length >= 6) {
    data.passwordHash = await hashPassword(body.password);
  }
  if ("telegramId" in body) {
    data.telegramId = body.telegramId ? String(body.telegramId).trim() : null;
  }

  const user = await prisma.user.update({ where: { id }, data });
  return NextResponse.json({ user: { id: user.id, role: user.role, active: user.active, name: user.name, telegramId: user.telegramId } });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(id);
  if (g.error) return g.error;
  if (g.target!.id === g.session!.uid)
    return NextResponse.json({ error: "tidak bisa menghapus akun sendiri" }, { status: 400 });
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
