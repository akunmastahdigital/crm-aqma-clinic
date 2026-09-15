import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runRules } from "@/lib/rule-engine";
import { checkAndMarkClosing } from "@/lib/closing";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const [customer, deals, pipelines, users, journalNotes, customerLeadTags] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      select: {
        id: true, name: true, phone: true, externalId: true, channel: true,
        tags: true, note: true, score: true, consent: true, windowExpiresAt: true,
        assignedToId: true,
        packageTypeId: true, packageVariantId: true,
        packageMonth: true, packageYear: true,
        potentialQty1x: true, potentialQty3x: true, potentialQty6x: true, potentialQty12x: true, potentialValue: true,
        packageType: { select: { id: true, name: true } },
        packageVariant: { select: { id: true, name: true, prices: { select: { sessionPack: true, price: true } } } },
      },
    }),
    prisma.deal.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, title: true, value: true, pipelineId: true, stageId: true,
        stage: { select: { name: true, color: true } },
      },
    }),
    prisma.pipeline.findMany({
      orderBy: [{ isDefault: "desc" }],
      select: { id: true, name: true, stages: { orderBy: { order: "asc" }, select: { id: true, name: true } } },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.salesJournal.findMany({
      where: { customerId: id, notes: { not: null } },
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        notes: true,
        activityType: true,
        user: { select: { name: true } },
      },
    }),
    prisma.leadTagItem.findMany({
      where: { customerId: id },
      select: { tagId: true },
    }),
  ]);
  if (!customer) return NextResponse.json({ error: "not found" }, { status: 404 });
  const activeTagIds = customerLeadTags.map((i) => i.tagId);
  return NextResponse.json({ customer, deals, pipelines, users, journalNotes, activeTagIds });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = (body.name ?? "").toString().trim() || null;
  if ("note" in body) data.note = (body.note ?? "").toString() || null;
  if ("tags" in body && Array.isArray(body.tags))
    data.tags = body.tags.map((t: unknown) => String(t).trim()).filter(Boolean);
  if ("assignedToId" in body) data.assignedToId = body.assignedToId || null;
  if ("packageTypeId" in body) data.packageTypeId = body.packageTypeId || null;
  if ("packageVariantId" in body) data.packageVariantId = body.packageVariantId || null;
  if ("packageMonth" in body) data.packageMonth = body.packageMonth ? Number(body.packageMonth) : null;
  if ("packageYear" in body) data.packageYear = body.packageYear ? Number(body.packageYear) : null;
  if ("potentialQty1x" in body) data.potentialQty1x = body.potentialQty1x != null ? Number(body.potentialQty1x) : null;
  if ("potentialQty3x" in body) data.potentialQty3x = body.potentialQty3x != null ? Number(body.potentialQty3x) : null;
  if ("potentialQty6x" in body) data.potentialQty6x = body.potentialQty6x != null ? Number(body.potentialQty6x) : null;
  if ("potentialQty12x" in body) data.potentialQty12x = body.potentialQty12x != null ? Number(body.potentialQty12x) : null;
  if ("potentialValue" in body) data.potentialValue = body.potentialValue != null ? Number(body.potentialValue) : null;

  const customer = await prisma.customer.update({ where: { id }, data });

  // Sinkronkan penanggung jawab ke percakapan aktif
  if ("assignedToId" in body && body.conversationId) {
    await prisma.conversation.update({
      where: { id: body.conversationId.toString() },
      data: { assignedToId: body.assignedToId || null },
    });
  }

  // Trigger rule engine saat label berubah
  if ("tags" in body && body.conversationId) {
    void runRules({
      customerId: id,
      conversationId: body.conversationId.toString(),
      text: "",
    });
  }

  // Cek apakah label baru memenuhi definisi closing
  if ("tags" in body) {
    void checkAndMarkClosing(id);
  }

  return NextResponse.json({ customer });
}
