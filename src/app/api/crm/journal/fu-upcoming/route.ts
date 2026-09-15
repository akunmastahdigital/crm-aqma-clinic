import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [enabledRow, minutesRow] = await Promise.all([
    prisma.crmSetting.findUnique({ where: { key: "fu_reminder_enabled" } }),
    prisma.crmSetting.findUnique({ where: { key: "fu_reminder_minutes" } }),
  ]);

  const enabled = enabledRow ? JSON.parse(enabledRow.value) !== false : true;
  if (!enabled) return NextResponse.json({ items: [] });

  const minutes = minutesRow ? (parseInt(JSON.parse(minutesRow.value)) || 30) : 30;

  const now = new Date();
  const future = new Date(now.getTime() + minutes * 60_000);

  const journals = await prisma.salesJournal.findMany({
    where: {
      userId: session.uid,
      scheduledAt: { gte: now, lte: future },
      status: "PENDING",
      isClosingFail: false,
    },
    include: {
      customer: {
        select: {
          name: true,
          externalId: true,
          conversations: {
            orderBy: { lastMessageAt: "desc" },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const items = journals.map((j) => ({
    id: j.id,
    scheduledAt: j.scheduledAt,
    nextAction: j.nextAction,
    customerName: j.customer?.name ?? j.customer?.externalId ?? "Unknown",
    conversationId: j.customer?.conversations[0]?.id ?? null,
  }));

  return NextResponse.json({ items });
}
