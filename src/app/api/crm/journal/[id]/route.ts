import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkAndMarkClosing } from "@/lib/closing";
import { sendCapiEvent } from "@/lib/meta-capi";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { activityType, followUpType, followUpResponse, label, stageId,
    isClosingFail, cancelReason, notes, nextAction, scheduledAt, status, date, dpValue } = body;

  const entry = await prisma.salesJournal.update({
    where: { id },
    data: {
      ...(activityType !== undefined && { activityType }),
      ...(followUpType !== undefined && { followUpType: followUpType || null }),
      ...(followUpResponse !== undefined && { followUpResponse: followUpResponse || null }),
      ...(label !== undefined && { label: label || null }),
      ...(stageId !== undefined && { stageId: stageId || null }),
      ...(isClosingFail !== undefined && { isClosingFail }),
      ...(cancelReason !== undefined && { cancelReason: cancelReason || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(nextAction !== undefined && { nextAction: nextAction || null }),
      ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
      ...(status !== undefined && { status }),
      ...(date !== undefined && { date: new Date(date) }),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true, externalId: true } },
      user: { select: { id: true, name: true } },
      stage: { select: { id: true, name: true } },
    },
  });

  // Sync label ke customer jika label diubah
  if (label !== undefined && label) {
    await prisma.customer.update({ where: { id: entry.customerId }, data: { tags: [label], leadStatus: label } });
    void checkAndMarkClosing(entry.customerId);

    // Auto-kirim Purchase CAPI jika ada nilai DP
    if (typeof dpValue === "number" && dpValue > 0) {
      const customer = await prisma.customer.findUnique({
        where: { id: entry.customerId },
        select: { phone: true, email: true, name: true },
      });
      const cs = await prisma.clickSession.findFirst({
        where: { customerId: entry.customerId },
        orderBy: { createdAt: "desc" },
        select: { fbclid: true, fbp: true, ip: true, userAgent: true },
      });
      void sendCapiEvent({
        eventName: "Purchase",
        eventId: "journal-dp-" + entry.id,
        customerId: entry.customerId,
        phone: customer?.phone ?? undefined,
        email: customer?.email ?? undefined,
        name: customer?.name ?? undefined,
        fbclid: cs?.fbclid ?? undefined,
        fbp: cs?.fbp ?? undefined,
        value: dpValue,
        currency: "IDR",
        clientIpAddress: cs?.ip ?? undefined,
        clientUserAgent: cs?.userAgent ?? undefined,
      });
    }
  }

  // Sync stage ke deal jika stageId diubah
  if (stageId !== undefined && stageId) {
    const stg = await prisma.stage.findUnique({ where: { id: stageId }, select: { pipelineId: true } });
    if (stg) {
      const existingDeal = await prisma.deal.findFirst({ where: { customerId: entry.customerId, pipelineId: stg.pipelineId } });
      if (existingDeal) {
        await prisma.deal.update({ where: { id: existingDeal.id }, data: { stageId } });
      } else {
        await prisma.deal.create({ data: { customerId: entry.customerId, pipelineId: stg.pipelineId, stageId, title: "Deal" } });
      }
    }
  }

  return NextResponse.json({ entry });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.salesJournal.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
