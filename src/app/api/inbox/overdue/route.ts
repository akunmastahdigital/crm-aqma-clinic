import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBusinessHours, isInsideBusinessHours } from "@/lib/business-hours";

export const dynamic = "force-dynamic";

const MAX_AGE_MS = 60 * 60_000;

async function getOverdueSettings() {
  let s = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  if (!s) s = await prisma.appSettings.create({ data: { id: "singleton" } });
  return {
    thresholdMs: s.overdueThresholdMinutes * 60_000,
    excludeTags: s.overdueExcludeTags,
    excludeFailClose: s.overdueExcludeFailClose,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Hanya tampilkan notif di jam kerja
  const bh = await getBusinessHours();
  if (bh.enabled && !isInsideBusinessHours(bh)) {
    return NextResponse.json({ overdue: [] });
  }

  const { thresholdMs, excludeTags, excludeFailClose } = await getOverdueSettings();

  const now = Date.now();
  const cutoff = new Date(now - thresholdMs);
  const maxAge = new Date(now - MAX_AGE_MS);

  const customerFilter: Record<string, unknown> = {};
  if (excludeTags.length > 0) {
    customerFilter.NOT = { tags: { hasSome: excludeTags } };
  }
  if (excludeFailClose) {
    customerFilter.salesJournals = { none: { isClosingFail: true } };
  }

  const candidates = await prisma.conversation.findMany({
    where: {
      status: { in: ["OPEN", "PENDING"] },
      lastMessageAt: { gte: maxAge, lte: cutoff },
      ...(Object.keys(customerFilter).length > 0 ? { customer: customerFilter } : {}),
    },
    select: {
      id: true,
      lastMessageAt: true,
      customer: { select: { id: true, name: true, phone: true, assignedTo: { select: { name: true } } } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { direction: true, text: true, createdAt: true, authorId: true },
      },
    },
    orderBy: { lastMessageAt: "asc" },
    take: 10,
  });

  const overdue = candidates
    .filter((c) => c.messages[0]?.direction === "IN")
    .map((c) => ({
      conversationId: c.id,
      customerId: c.customer?.id,
      customerName: c.customer?.name ?? c.customer?.phone ?? "Lead",
      agentName: c.customer?.assignedTo?.name ?? null,
      lastMessage: c.messages[0]?.text?.slice(0, 100) ?? "",
      unansweredSince: c.messages[0]?.createdAt ?? c.lastMessageAt,
    }));

  return NextResponse.json({ overdue });
}
