import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_crm_settings"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const dir = body.dir === "up" ? "up" : "down";

  const stage = await prisma.stage.findUnique({ where: { id } });
  if (!stage) return NextResponse.json({ error: "not found" }, { status: 404 });

  const neighbor = await prisma.stage.findFirst({
    where: {
      pipelineId: stage.pipelineId,
      order: dir === "up" ? { lt: stage.order } : { gt: stage.order },
    },
    orderBy: { order: dir === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return NextResponse.json({ ok: true }); // sudah di ujung

  await prisma.$transaction([
    prisma.stage.update({ where: { id: stage.id }, data: { order: neighbor.order } }),
    prisma.stage.update({ where: { id: neighbor.id }, data: { order: stage.order } }),
  ]);
  return NextResponse.json({ ok: true });
}
