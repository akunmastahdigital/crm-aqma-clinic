import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { createBroadcast } from "@/lib/broadcast";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// Bangun WHERE clause dari semua filter
function buildWhere(filters: {
  tag?: string;
  minatTagId?: string;
  pipelineId?: string;
  stageId?: string;
  assignedToId?: string;
  leadStatus?: string;
}): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = { channel: "WA_CLOUD" };

  if (filters.tag)                           where.tags         = { has: filters.tag };
  if (filters.minatTagId === "__none__")     where.leadTagItems = { none: {} };
  else if (filters.minatTagId)              where.leadTagItems = { some: { tagId: filters.minatTagId } };
  if (filters.assignedToId)                 where.assignedToId = filters.assignedToId;

  // Jika stage dipilih → filter by stageId; jika hanya pipeline → filter by pipelineId
  if (filters.stageId)          where.deals = { some: { stageId: filters.stageId } };
  else if (filters.pipelineId)  where.deals = { some: { pipelineId: filters.pipelineId } };

  if (filters.leadStatus === "active") where.closedAt = null;
  if (filters.leadStatus === "closed") where.closedAt = { not: null };
  if (filters.leadStatus === "fail")   where.salesJournals = { some: { isClosingFail: true } };

  return where;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const month = sp.get("month"); // format: "2026-09"
  const jobWhere = month
    ? { createdAt: { gte: new Date(`${month}-01`), lt: new Date(new Date(`${month}-01`).setMonth(new Date(`${month}-01`).getMonth() + 1)) } }
    : {};

  const [jobs, channels, templates, waCustomers, minatTags, pipelines, agents] =
    await Promise.all([
      prisma.broadcastJob.findMany({ where: jobWhere, orderBy: { createdAt: "desc" }, take: month ? 200 : 20 }),
      prisma.wabaChannel.findMany({
        where: { active: true },
        select: { phoneNumberId: true, label: true, wabaId: true },
      }),
      prisma.template.findMany({
        where: { status: "APPROVED" },
        select: { name: true, language: true, wabaId: true, category: true },
        orderBy: { name: "asc" },
      }),
      prisma.customer.findMany({ where: { channel: "WA_CLOUD" }, select: { tags: true } }),

      // Tanda Minat dengan jumlah customer WA yang punya tag tersebut
      prisma.leadTag.findMany({
        select: {
          id: true,
          name: true,
          color: true,
          _count: {
            select: { items: true },
          },
        },
        orderBy: { name: "asc" },
      }),

      // Pipeline + Stage
      prisma.pipeline.findMany({
        select: {
          id: true,
          name: true,
          stages: {
            select: { id: true, name: true, order: true },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { name: "asc" },
      }),

      // Agent yang bisa di-assign
      prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      }),
    ]);

  const tagCount: Record<string, number> = {};
  for (const c of waCustomers) for (const t of c.tags) tagCount[t] = (tagCount[t] ?? 0) + 1;
  const tags = Object.entries(tagCount).map(([tag, count]) => ({ tag, count }));

  return NextResponse.json({
    jobs,
    channels,
    templates,
    tags,
    totalWa: waCustomers.length,
    minatTags: minatTags.map((m) => ({ id: m.id, name: m.name, color: m.color, count: m._count.items })),
    pipelines,
    agents,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "broadcast"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const channelAccountId = (body.channelAccountId ?? "").toString();
  const templateName     = (body.templateName     ?? "").toString();
  const templateLang     = (body.templateLang     ?? "id").toString();

  if (!channelAccountId || !templateName)
    return NextResponse.json({ error: "nomor & template wajib" }, { status: 400 });

  const filters = {
    tag:          body.tag          ? String(body.tag)          : undefined,
    minatTagId:   body.minatTagId   ? String(body.minatTagId)   : undefined,
    pipelineId:   body.pipelineId   ? String(body.pipelineId)   : undefined,
    stageId:      body.stageId      ? String(body.stageId)      : undefined,
    assignedToId: body.assignedToId ? String(body.assignedToId) : undefined,
    leadStatus:   body.leadStatus   ? String(body.leadStatus)   : undefined,
  };

  const customers = await prisma.customer.findMany({
    where: buildWhere(filters),
    select: { id: true },
  });

  if (customers.length === 0)
    return NextResponse.json({ error: "tidak ada penerima dengan filter ini" }, { status: 400 });

  try {
    const job = await createBroadcast({
      channelAccountId,
      templateName,
      templateLang,
      customerIds: customers.map((c) => c.id),
      createdById: session.uid,
    });
    return NextResponse.json({ job: { id: job.id, total: job.total } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gagal" },
      { status: 500 },
    );
  }
}
