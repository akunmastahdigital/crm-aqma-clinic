import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const where: Prisma.SalesJournalWhereInput = {
    scheduledAt: { not: null },
    status: { in: ["PENDING", "RESCHEDULE"] },
  };
  if (session.role === "AGENT") where.userId = session.uid;

  const journals = await prisma.salesJournal.findMany({
    where,
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      scheduledAt: true,
      nextAction: true,
      activityType: true,
      followUpType: true,
      label: true,
      status: true,
      userId: true,
      user: { select: { name: true } },
      customer: {
        select: {
          id: true,
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
  });

  const items = journals.map((j) => ({
    id: j.id,
    scheduledAt: j.scheduledAt,
    note: j.nextAction ?? j.followUpType ?? null,
    activityType: j.activityType,
    label: j.label,
    status: j.status,
    customer: {
      name: j.customer.name,
      externalId: j.customer.externalId,
    },
    conversationId: j.customer.conversations[0]?.id ?? null,
    assignedTo: { name: j.user.name },
  }));

  return NextResponse.json({ items });
}
