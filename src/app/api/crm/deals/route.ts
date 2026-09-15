import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createDeal, moveDeal } from "@/lib/crm";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const title = (body.title ?? "").toString().trim();
  const stageId = (body.stageId ?? "").toString().trim();
  if (!title || !stageId)
    return NextResponse.json({ error: "judul & stage wajib" }, { status: 400 });
  const value = body.value ? parseInt(body.value.toString().replace(/\D/g, ""), 10) || null : null;
  const customerId = body.customerId || null;

  // Cegah duplikat: 1 pelanggan maksimal 1 kartu per pipeline.
  // Kalau sudah ada, perbarui kartu itu (stage + nilai) daripada bikin baru.
  if (customerId) {
    const stage = await prisma.stage.findUnique({ where: { id: stageId }, select: { pipelineId: true } });
    if (stage) {
      const existing = await prisma.deal.findFirst({
        where: { customerId, pipelineId: stage.pipelineId },
      });
      if (existing) {
        if (existing.stageId !== stageId) await moveDeal(existing.id, stageId);
        const deal = await prisma.deal.update({
          where: { id: existing.id },
          data: { value: value ?? existing.value, title },
        });
        return NextResponse.json({ deal, updated: true });
      }
    }
  }

  const deal = await createDeal({
    title,
    stageId,
    value,
    customerId,
    assignedToId: body.assignedToId || null,
    note: body.note || null,
  });
  return NextResponse.json({ deal });
}
