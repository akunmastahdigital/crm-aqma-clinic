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
  const q = sp.get("q")?.trim();

  const where: Record<string, unknown> = {};
  if (session.role === "AGENT") where.userId = session.uid;
  else if (userId) where.userId = userId;
  if (customerId) where.customerId = customerId;
  if (label) where.label = label;
  if (status) where.status = status;
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
  const todayStart = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) + "T00:00:00+07:00");
  const todayEnd = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) + "T23:59:59+07:00");
  const now = new Date();
  const agentFilter = session.role === "AGENT" ? { userId: session.uid } : {};

  const [fuToday, overdue, actToday] = await Promise.all([
    prisma.salesJournal.count({ where: { ...agentFilter, scheduledAt: { gte: todayStart, lte: todayEnd }, status: "PENDING" } }),
    prisma.salesJournal.count({ where: { ...agentFilter, scheduledAt: { lt: now }, status: "PENDING" } }),
    prisma.salesJournal.count({ where: { ...agentFilter, createdAt: { gte: todayStart } } }),
  ]);

  return NextResponse.json({ items, total, take, skip, widgets: { fuToday, overdue, actToday } });
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
