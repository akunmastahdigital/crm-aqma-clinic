import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardKlinik, badRequest } from "@/lib/klinik";

export const dynamic = "force-dynamic";

const requirementSchema = z.object({
  resourceType: z.enum(["STAFF", "ROOM", "EQUIPMENT"]),
  tag: z.string().trim().max(40).nullish(),
  quantity: z.number().int().min(1).max(20).optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  categoryId: z.string().trim().nullish(),
  durationMinutes: z.number().int().min(5).max(600).optional(),
  bufferMinutes: z.number().int().min(0).max(240).optional(),
  price: z.number().int().min(0).nullish(),
  note: z.string().trim().max(500).nullish(),
  isActive: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  // Kalau dikirim, daftar kebutuhan diganti seluruhnya
  requirements: z.array(requirementSchema).max(10).optional(),
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
  const { requirements, ...rest } = parsed.data;

  const exists = await prisma.treatment.findUnique({ where: { id } });
  if (!exists) return NextResponse.json({ error: "Treatment tidak ditemukan" }, { status: 404 });

  if (rest.categoryId) {
    const cat = await prisma.packageType.findUnique({ where: { id: rest.categoryId } });
    if (!cat) return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 400 });
  }

  // Ganti daftar kebutuhan dalam satu transaksi, supaya tidak pernah ada
  // keadaan di mana kebutuhan lama sudah terhapus tapi yang baru belum masuk.
  const treatment = await prisma.$transaction(async (tx) => {
    if (requirements) {
      await tx.treatmentRequirement.deleteMany({ where: { treatmentId: id } });
      if (requirements.length) {
        await tx.treatmentRequirement.createMany({
          data: requirements.map((r) => ({
            treatmentId: id,
            resourceType: r.resourceType,
            tag: r.tag?.trim() || null,
            quantity: r.quantity ?? 1,
          })),
        });
      }
    }
    return tx.treatment.update({
      where: { id },
      data: { ...rest, categoryId: rest.categoryId === undefined ? undefined : rest.categoryId || null },
      include: {
        category: { select: { id: true, name: true } },
        requirements: true,
      },
    });
  });

  return NextResponse.json({ treatment });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardKlinik(true);
  if ("error" in g) return g.error;

  const { id } = await params;

  // Paket penjualan menunjuk ke treatment ini. Kalau dihapus, tautannya
  // jadi kosong dan paket kehilangan acuan durasinya. Tolak dan sarankan
  // menonaktifkan — menonaktifkan menyembunyikan dari pilihan baru tanpa
  // merusak data lama.
  const used = await prisma.packageVariant.count({ where: { treatmentId: id } });
  if (used > 0) {
    return NextResponse.json(
      {
        error: `Treatment ini dipakai ${used} paket penjualan. Nonaktifkan saja agar data paket tetap utuh.`,
      },
      { status: 409 },
    );
  }

  await prisma.treatment.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
