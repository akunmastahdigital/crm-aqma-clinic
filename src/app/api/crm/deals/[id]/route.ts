import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { moveDeal } from "@/lib/crm";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // pindah stage (dipakai board & dropdown lead)
  const toStageId = (body.toStageId ?? "").toString().trim();
  if (toStageId) {
    const deal = await moveDeal(id, toStageId);
    return NextResponse.json({ deal });
  }

  // edit judul / nilai (Potensi Income)
  const data: Record<string, unknown> = {};
  if ("title" in body) {
    const t = (body.title ?? "").toString().trim();
    if (t) data.title = t;
  }
  if ("value" in body) {
    const raw = (body.value ?? "").toString().replace(/\D/g, "");
    data.value = raw ? parseInt(raw, 10) : null;
  }
  if ("note" in body) data.note = (body.note ?? "").toString() || null;

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "tidak ada perubahan" }, { status: 400 });

  const deal = await prisma.deal.update({ where: { id }, data });
  return NextResponse.json({ deal });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.deal.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
