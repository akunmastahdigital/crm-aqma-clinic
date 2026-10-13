import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardKlinik, badRequest, openingHoursSchema } from "@/lib/klinik";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  branchId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  type: z.enum(["STAFF", "ROOM", "EQUIPMENT"]).optional(),
  userId: z.string().trim().nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  capacity: z.number().int().min(1).max(100).optional(),
  workingHours: openingHoursSchema,
  isActive: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardKlinik(true);
  if ("error" in g) return g.error;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error);

  const current = await prisma.resource.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Sumber daya tidak ditemukan" }, { status: 404 });

  const { workingHours, ...rest } = parsed.data;

  // Kalau tipenya bukan (atau tidak lagi) STAFF, userId tidak relevan.
  const finalType = rest.type ?? current.type;
  if (finalType !== "STAFF") rest.userId = null;

  const resource = await prisma.resource.update({
    where: { id },
    data: {
      ...rest,
      // Field Json tidak menerima null biasa — harus DbNull.
      ...(workingHours === undefined
        ? {}
        : { workingHours: workingHours === null ? Prisma.DbNull : workingHours }),
    },
    include: {
      branch: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ resource });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardKlinik(true);
  if ("error" in g) return g.error;

  const { id } = await params;
  // Belum ada tabel jadwal (Slice B). Saat jadwal sudah ada, hapus di sini
  // harus ditolak bila sumber daya ini masih dipakai booking mana pun.
  await prisma.resource.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
