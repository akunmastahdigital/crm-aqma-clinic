import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const q           = sp.get("q")?.trim();
  const take        = Math.min(parseInt(sp.get("take") ?? "50"), 200);
  const skip        = parseInt(sp.get("skip") ?? "0");
  const channel     = sp.get("channel") || undefined;
  const tag         = sp.get("tag") || undefined;
  const pipelineId  = sp.get("pipelineId") || undefined;
  const stageId     = sp.get("stageId") || undefined;
  const assignedToId = sp.get("assignedToId") || undefined;
  const leadStatus  = sp.get("leadStatus") || undefined;
  const dateFrom    = sp.get("dateFrom") || undefined;
  const dateTo      = sp.get("dateTo") || undefined;
  const packageTypeId = sp.get("packageTypeId") || undefined;

  const agentFilter: Prisma.CustomerWhereInput =
    session.role === "AGENT" ? { assignedToId: session.uid } : {};

  const and: Prisma.CustomerWhereInput[] = [agentFilter];

  if (q) {
    const digits = q.replace(/\D/g, "");
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: digits || q } },
        { externalId: { contains: digits || q } },
      ],
    });
  }
  if (channel)      and.push({ channel: channel as Prisma.EnumChannelFilter["equals"] });
  if (tag)          and.push({ tags: { has: tag } });
  if (stageId)      and.push({ deals: { some: { stageId } } });
  else if (pipelineId) and.push({ deals: { some: { pipelineId } } });
  if (assignedToId === "__none__") and.push({ assignedToId: null });
  else if (assignedToId) and.push({ assignedToId });
  if (leadStatus === "active")  and.push({ closedAt: null });
  if (leadStatus === "closed")  and.push({ closedAt: { not: null } });
  if (dateFrom) and.push({ createdAt: { gte: new Date(dateFrom + "T00:00:00+07:00") } });
  if (dateTo)   and.push({ createdAt: { lte: new Date(dateTo   + "T23:59:59+07:00") } });
  if (packageTypeId) and.push({ packageTypeId });

  const where: Prisma.CustomerWhereInput = and.length > 1
    ? { AND: and }
    : (and[0] ?? {});

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { lastContactAt: "desc" },
      take,
      skip,
      select: {
        id: true, name: true, phone: true, externalId: true,
        channel: true, tags: true, createdAt: true, closedAt: true,
        windowExpiresAt: true, assignedTo: { select: { name: true } },
        packageTypeId: true, packageVariantId: true, packageMonth: true, packageYear: true,
        potentialQty1x: true, potentialQty3x: true, potentialQty6x: true, potentialQty12x: true, potentialValue: true,
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return NextResponse.json({ customers, total });
}
