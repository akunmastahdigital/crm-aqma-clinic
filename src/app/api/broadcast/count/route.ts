import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function buildWhere(p: URLSearchParams): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = { channel: "WA_CLOUD" };
  const tag          = p.get("tag");
  const minatTagId   = p.get("minatTagId");
  const pipelineId   = p.get("pipelineId");
  const stageId      = p.get("stageId");
  const assignedToId = p.get("assignedToId");
  const leadStatus   = p.get("leadStatus");

  if (tag)                          where.tags         = { has: tag };
  if (minatTagId === "__none__")    where.leadTagItems = { none: {} };
  else if (minatTagId)             where.leadTagItems = { some: { tagId: minatTagId } };
  if (assignedToId)                where.assignedToId = assignedToId;

  if (stageId)          where.deals = { some: { stageId } };
  else if (pipelineId)  where.deals = { some: { pipelineId } };

  if (leadStatus === "active") where.closedAt = null;
  if (leadStatus === "closed") where.closedAt = { not: null };
  if (leadStatus === "fail")   where.salesJournals = { some: { isClosingFail: true } };

  return where;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const count = await prisma.customer.count({ where: buildWhere(params) });
  return NextResponse.json({ count });
}
