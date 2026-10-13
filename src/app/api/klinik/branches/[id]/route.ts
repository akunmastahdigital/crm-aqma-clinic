import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardKlinik, badRequest, openingHoursSchema } from "@/lib/klinik";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  address: z.string().trim().max(300).nullish(),
  phone: z.string().trim().max(40).nullish(),
  timezone: z.string().trim().max(60).optional(),
  openingHours: openingHoursSchema,
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

  const exists = await prisma.branch.findUnique({ where: { id } });
  if (!exists) return NextResponse.json({ error: "Cabang tidak ditemukan" }, { status: 404 });

  const { openingHours, ...rest } = parsed.data;

  const branch = await prisma.branch.update({
    where: { id },
    data: {
      ...rest,
      // Field Json di Prisma tidak menerima null biasa — harus DbNull.
      // undefined = tidak diubah, DbNull = dikosongkan.
      ...(openingHours === undefined
        ? {}
        : { openingHours: openingHours === null ? Prisma.DbNull : openingHours }),
    },
  });
  return NextResponse.json({ branch });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardKlinik(true);
  if ("error" in g) return g.error;

  const { id } = await params;

  // Menghapus cabang ikut menghapus seluruh sumber dayanya (cascade).
  // Jadi kalau masih ada isinya, tolak — minta dinonaktifkan saja.
  // Lebih baik menolak daripada diam-diam menghapus data orang.
  const count = await prisma.resource.count({ where: { branchId: id } });
  if (count > 0) {
    return NextResponse.json(
      {
        error: `Cabang ini masih punya ${count} sumber daya. Pindahkan atau hapus dulu, atau nonaktifkan cabangnya.`,
      },
      { status: 409 },
    );
  }

  await prisma.branch.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
