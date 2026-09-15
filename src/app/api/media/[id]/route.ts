import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await prisma.media.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Pindah media ke folder lain (folderId: null = pindah ke root)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json() as { folderId?: string | null };
  const media = await prisma.media.update({
    where: { id },
    data: { folderId: body.folderId ?? null },
  });
  return NextResponse.json({ media });
}
