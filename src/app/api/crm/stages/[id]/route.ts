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
  const data: { name?: string; color?: string } = {};
  if (body.name != null) data.name = body.name.toString().trim();
  if (body.color != null) data.color = body.color.toString();
  const stage = await prisma.stage.update({ where: { id }, data });
  return NextResponse.json({ stage });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard();
  if (g.error) return g.error;
  const { id } = await params;
  const deals = await prisma.deal.count({ where: { stageId: id } });
  if (deals > 0)
    return NextResponse.json(
      { error: `Stage masih punya ${deals} deal, pindahkan dulu` },
      { status: 400 },
    );
  await prisma.stage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
