import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

async function guard() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!can(session.role, "manage_crm_settings"))
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
  const name = (body.name ?? "").toString().trim();
  if (!name) return NextResponse.json({ error: "nama wajib" }, { status: 400 });
  const pipeline = await prisma.pipeline.update({ where: { id }, data: { name } });
  return NextResponse.json({ pipeline });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;
  const total = await prisma.pipeline.count();
  if (total <= 1)
    return NextResponse.json({ error: "Minimal harus ada 1 pipeline" }, { status: 400 });
  const deals = await prisma.deal.count({ where: { pipelineId: id } });
  if (deals > 0)
    return NextResponse.json(
      { error: `Pipeline masih punya ${deals} deal` },
      { status: 400 },
    );
  const target = await prisma.pipeline.findUnique({ where: { id } });
  await prisma.pipeline.delete({ where: { id } });
  // kalau yang dihapus adalah default, tunjuk default baru
  if (target?.isDefault) {
    const next = await prisma.pipeline.findFirst({ orderBy: { createdAt: "asc" } });
    if (next) await prisma.pipeline.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  return NextResponse.json({ ok: true });
}
