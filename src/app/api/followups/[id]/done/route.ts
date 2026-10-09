import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role === "GUEST") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const fu = await prisma.followUp.update({
    where: { id },
    data: { status: "DONE", doneAt: new Date() },
  });

  // Sync ke SalesJournal: tandai journal yg cocok (customerId + scheduledAt ±1 mnt) sebagai DONE juga
  const t = fu.scheduledAt;
  await prisma.salesJournal.updateMany({
    where: {
      customerId: fu.customerId,
      status: { in: ["PENDING", "RESCHEDULE"] },
      scheduledAt: { gte: new Date(t.getTime() - 60000), lte: new Date(t.getTime() + 60000) },
    },
    data: { status: "DONE" },
  });

  return NextResponse.json({ ok: true });
}
