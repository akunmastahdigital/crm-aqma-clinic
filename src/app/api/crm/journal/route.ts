import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkAndMarkClosing } from "@/lib/closing";
import { sendCapiEvent } from "@/lib/meta-capi";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const take = Math.min(parseInt(sp.get("take") ?? "50"), 200);
  const skip = parseInt(sp.get("skip") ?? "0");
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");
  const userId = sp.get("userId");
  const label = sp.get("label");
  const status = sp.get("status");
  const customerId = sp.get("customerId");
  const activityType = sp.get("activityType");
  const q = sp.get("q")?.trim();

  const where: Record<string, unknown> = {};
  if (session.role === "AGENT") where.userId = session.uid;
  else if (userId) where.userId = userId;
  if (customerId) where.customerId = customerId;
  if (label) where.label = label;
  if (status) where.status = status;
  if (activityType) where.activityType = activityType;
  if (q) {
    const digits = q.replace(/\D/g, "");
    where.customer = {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 4 ? [{ externalId: { contains: digits } }] : []),
        ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
      ],
    };
  }
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) (where.date as Record<string,unknown>).gte = new Date(dateFrom + "T00:00:00+07:00");
    if (dateTo) (where.date as Record<string,unknown>).lte = new Date(dateTo + "T23:59:59+07:00");
  }

  const [items, total] = await Promise.all([
    prisma.salesJournal.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take,
      skip,
      include: {
        customer: { select: { id: true, name: true, phone: true, externalId: true } },
        user: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
      },
    }),
    prisma.salesJournal.count({ where }),
  ]);

  // Widget counts
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const todayStart = new Date(todayStr + "T00:00:00+07:00");
  const todayEnd   = new Date(todayStr + "T23:59:59+07:00");
  const now = new Date();
  const agentFilter = session.role === "AGENT" ? { userId: session.uid } : {};

  // Widget date range (terpisah dari filter list)
  const widgetFrom = sp.get("widgetFrom");
  const widgetTo   = sp.get("widgetTo");
  const wStart = widgetFrom ? new Date(widgetFrom + "T00:00:00+07:00") : todayStart;
  const wEnd   = widgetTo   ? new Date(widgetTo   + "T23:59:59+07:00") : todayEnd;

  const [fuToday, overdue, actByTypeRaw, fuTodayByAgent, overdueByAgent, actByAgent] = await Promise.all([
    prisma.salesJournal.count({ where: { ...agentFilter, scheduledAt: { gte: todayStart, lte: todayEnd }, status: "PENDING" } }),
    prisma.salesJournal.count({ where: { ...agentFilter, scheduledAt: { lt: now }, status: "PENDING" } }),
    prisma.salesJournal.groupBy({ by: ["activityType"], where: { ...agentFilter, date: { gte: wStart, lte: wEnd } }, _count: { _all: true } }),
    session.role !== "AGENT" ? prisma.salesJournal.groupBy({ by: ["userId"], where: { scheduledAt: { gte: todayStart, lte: todayEnd }, status: "PENDING" }, _count: { _all: true } }) : Promise.resolve([]),
    session.role !== "AGENT" ? prisma.salesJournal.groupBy({ by: ["userId"], where: { scheduledAt: { lt: now }, status: "PENDING" }, _count: { _all: true } }) : Promise.resolve([]),
    session.role !== "AGENT" ? prisma.salesJournal.groupBy({ by: ["userId"], where: { date: { gte: wStart, lte: wEnd } }, _count: { _all: true } }) : Promise.resolve([]),
  ]);

  const actByType: Record<string, number> = {};
  for (const r of actByTypeRaw as Array<{ activityType: string; _count: { _all: number } }>) {
    actByType[r.activityType] = r._count._all;
  }
  const actTotal = Object.values(actByType).reduce((s, v) => s + v, 0);

  let agentBreakdown: Array<{ userId: string; name: string; fuToday: number; overdue: number; actToday: number }> = [];
  if (session.role !== "AGENT") {
    const allUserIds = new Set([
      ...fuTodayByAgent.map((r: { userId: string }) => r.userId),
      ...overdueByAgent.map((r: { userId: string }) => r.userId),
      ...(actByAgent as Array<{ userId: string }>).map(r => r.userId),
    ]);
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(allUserIds) } }, select: { id: true, name: true } });
    const nameMap = Object.fromEntries(users.map(u => [u.id, u.name]));
    const fuMap = Object.fromEntries(fuTodayByAgent.map((r: { userId: string; _count: { _all: number } }) => [r.userId, r._count._all]));
    const odMap = Object.fromEntries(overdueByAgent.map((r: { userId: string; _count: { _all: number } }) => [r.userId, r._count._all]));
    const acMap = Object.fromEntries((actByAgent as Array<{ userId: string; _count: { _all: number } }>).map(r => [r.userId, r._count._all]));
    agentBreakdown = Array.from(allUserIds).map(uid => ({
      userId: uid,
      name: nameMap[uid] ?? uid,
      fuToday: (fuMap as Record<string, number>)[uid] ?? 0,
      overdue: (odMap as Record<string, number>)[uid] ?? 0,
      actToday: (acMap as Record<string, number>)[uid] ?? 0,
    })).sort((a, b) => b.actToday - a.actToday);
  }

  return NextResponse.json({ items, total, take, skip, widgets: { fuToday, overdue, actTotal, actByType }, agentBreakdown });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { customerId, date, activityType, followUpType, followUpResponse, label,
    stageId, isClosingFail, cancelReason, notes, nextAction, scheduledAt, status, dpValue } = body;

  if (!customerId || !activityType) {
    return NextResponse.json({ error: "customerId dan activityType wajib diisi" }, { status: 400 });
  }

  const entry = await prisma.salesJournal.create({
    data: {
      customerId,
      userId: session.uid,
      date: date ? new Date(date) : new Date(),
      activityType,
      followUpType: followUpType || null,
      followUpResponse: followUpResponse || null,
      label: label || null,
      stageId: stageId || null,
      isClosingFail: isClosingFail ?? false,
      cancelReason: cancelReason || null,
      notes: notes || null,
      nextAction: nextAction || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: status || "PENDING",
    },
    include: {
      customer: { select: { id: true, name: true, phone: true, externalId: true } },
      user: { select: { id: true, name: true } },
      stage: { select: { id: true, name: true } },
    },
  });

  // Update customer label (replace tags sepenuhnya dengan label baru)
  if (label) {
    await prisma.customer.update({ where: { id: customerId }, data: { tags: [label], leadStatus: label } });
    void checkAndMarkClosing(customerId);

    // Auto-kirim Purchase CAPI jika ada nilai DP
    if (typeof dpValue === "number" && dpValue > 0) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { phone: true, email: true, name: true },
      });
      const session = await prisma.clickSession.findFirst({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        select: { fbclid: true, fbp: true, ip: true, userAgent: true },
      });
      void sendCapiEvent({
        eventName: "Purchase",
        eventId: "journal-dp-" + entry.id,
        customerId,
        phone: customer?.phone ?? undefined,
        email: customer?.email ?? undefined,
        name: customer?.name ?? undefined,
        fbclid: session?.fbclid ?? undefined,
        fbp: session?.fbp ?? undefined,
        value: dpValue,
        currency: "IDR",
        clientIpAddress: session?.ip ?? undefined,
        clientUserAgent: session?.userAgent ?? undefined,
      });
    }
  }

  // Update deal stage jika stageId diisi
  if (stageId) {
    const stg = await prisma.stage.findUnique({ where: { id: stageId }, select: { pipelineId: true } });
    if (stg) {
      const existingDeal = await prisma.deal.findFirst({ where: { customerId, pipelineId: stg.pipelineId } });
      if (existingDeal) {
        await prisma.deal.update({ where: { id: existingDeal.id }, data: { stageId } });
      } else {
        await prisma.deal.create({ data: { customerId, pipelineId: stg.pipelineId, stageId, title: "Deal" } });
      }
    }
  }

  // Buat follow_up jika ada jadwal (skip kalau sudah ada untuk customer+jadwal sama)
  if (scheduledAt && status !== "DONE") {
    const scheduledDate = new Date(scheduledAt);
    const existingFu = await prisma.followUp.findFirst({
      where: {
        customerId,
        assignedToId: session.uid,
        scheduledAt: scheduledDate,
        status: "PENDING",
      },
    });
    if (!existingFu) {
      await prisma.followUp.create({
        data: { customerId, conversationId: null, scheduledAt: scheduledDate, note: nextAction || null, assignedToId: session.uid },
      });
    }
  }

  return NextResponse.json({ entry });
}
