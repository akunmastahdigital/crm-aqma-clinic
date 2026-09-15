import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listPipelines, ensureDefaultPipeline } from "@/lib/crm";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const pipelineId = new URL(req.url).searchParams.get("pipelineId") || undefined;

  const def = await ensureDefaultPipeline();
  const id = pipelineId || def.id;

  const dealWhere = session.role === "AGENT" ? { assignedToId: session.uid } : {};

  const pipeline = await prisma.pipeline.findUnique({
    where: { id },
    include: {
      stages: {
        orderBy: { order: "asc" as const },
        include: {
          deals: {
            where: dealWhere,
            orderBy: { order: "asc" as const },
            include: {
              customer: { select: { name: true, externalId: true, tags: true, assignedTo: { select: { name: true } } } },
              assignedTo: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const [pipelines, customers, users] = await Promise.all([
    listPipelines(),
    session.role === "AGENT"
      ? prisma.customer.findMany({
          where: { assignedToId: session.uid },
          select: { id: true, name: true, externalId: true },
          orderBy: { lastContactAt: "desc" },
          take: 200,
        })
      : prisma.customer.findMany({
          select: { id: true, name: true, externalId: true },
          orderBy: { lastContactAt: "desc" },
          take: 200,
        }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({ pipeline: pipeline ?? null, pipelines, customers, users });
}
