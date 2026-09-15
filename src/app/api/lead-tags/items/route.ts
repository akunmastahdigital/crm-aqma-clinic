import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Tambah tag ke customer
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { tagId, customerId } = await req.json() as { tagId?: string; customerId?: string };
  if (!tagId || !customerId)
    return NextResponse.json({ error: "tagId dan customerId wajib" }, { status: 400 });

  const item = await prisma.leadTagItem.upsert({
    where: { tagId_customerId: { tagId, customerId } },
    create: { tagId, customerId },
    update: {},
  });
  return NextResponse.json({ item });
}

// Hapus tag dari customer
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { tagId, customerId } = await req.json() as { tagId?: string; customerId?: string };
  if (!tagId || !customerId)
    return NextResponse.json({ error: "tagId dan customerId wajib" }, { status: 400 });

  await prisma.leadTagItem.deleteMany({ where: { tagId, customerId } });
  return NextResponse.json({ ok: true });
}
