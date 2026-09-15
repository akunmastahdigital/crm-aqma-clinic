import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const where: Prisma.FollowUpWhereInput = { status: "PENDING" };
  if (session.role === "AGENT") {
    where.OR = [{ assignedToId: session.uid }, { assignedToId: null }];
  }

  const items = await prisma.followUp.findMany({
    where,
    orderBy: { scheduledAt: "asc" },
    include: {
      customer: { select: { name: true, externalId: true } },
      assignedTo: { select: { name: true } },
    },
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (!scheduledAt || isNaN(scheduledAt.getTime()))
    return NextResponse.json({ error: "jadwal tidak valid" }, { status: 400 });

  let customerId = body.customerId ? body.customerId.toString() : "";
  const conversationId = body.conversationId ? body.conversationId.toString() : null;

  if (!customerId && conversationId) {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (conv) customerId = conv.customerId;
  }
  if (!customerId)
    return NextResponse.json({ error: "pelanggan wajib" }, { status: 400 });

  const item = await prisma.followUp.create({
    data: {
      customerId,
      conversationId,
      scheduledAt,
      note: body.note ? body.note.toString() : null,
      assignedToId: body.assignedToId || session.uid,
    },
  });
  return NextResponse.json({ item });
}
