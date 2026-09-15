import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { ensureDefaultPipeline } from "@/lib/crm";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_crm_settings"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim();
  if (!name) return NextResponse.json({ error: "nama wajib" }, { status: 400 });

  let pipelineId = (body.pipelineId ?? "").toString().trim();
  if (!pipelineId) pipelineId = (await ensureDefaultPipeline()).id;
  const count = await prisma.stage.count({ where: { pipelineId } });
  const stage = await prisma.stage.create({
    data: {
      pipelineId,
      name,
      color: body.color ?? "#6b7280",
      order: count,
    },
  });
  return NextResponse.json({ stage });
}
