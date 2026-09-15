import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_templates"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  // Pindahkan semua media di folder ini ke root sebelum hapus folder
  await prisma.media.updateMany({ where: { folderId: id }, data: { folderId: null } });
  await prisma.mediaFolder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_templates"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const { name } = await req.json() as { name: string };
  if (!name?.trim()) return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 });
  const folder = await prisma.mediaFolder.update({ where: { id }, data: { name: name.trim() } });
  return NextResponse.json({ folder });
}
