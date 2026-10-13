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

const createSchema = z.object({
  name: z.string().trim().min(1, "nama treatment wajib diisi").max(120),
  categoryId: z.string().trim().nullish(),
  durationMinutes: z
    .number()
    .int()
    .min(5, "durasi minimal 5 menit")
    .max(600, "durasi maksimal 600 menit"),
  bufferMinutes: z.number().int().min(0).max(240).optional(),
  price: z.number().int().min(0).nullish(),
  note: z.string().trim().max(500).nullish(),
  requirements: z.array(requirementSchema).max(10).optional(),
});

export async function GET() {
  const g = await guardKlinik(false);
  if ("error" in g) return g.error;

  const treatments = await prisma.treatment.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      category: { select: { id: true, name: true } },
      requirements: true,
    },
  });
  return NextResponse.json({ treatments });
}

export async function POST(req: Request) {
  const g = await guardKlinik(true);
  if ("error" in g) return g.error;

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error);
  const d = parsed.data;

  if (d.categoryId) {
    const cat = await prisma.packageType.findUnique({ where: { id: d.categoryId } });
    if (!cat) return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 400 });
  }

  const last = await prisma.treatment.findFirst({ orderBy: { order: "desc" } });

  const treatment = await prisma.treatment.create({
    data: {
      name: d.name,
      categoryId: d.categoryId || null,
      durationMinutes: d.durationMinutes,
      bufferMinutes: d.bufferMinutes ?? 0,
      price: d.price ?? null,
      note: d.note ?? null,
      order: (last?.order ?? -1) + 1,
      requirements: {
        create: (d.requirements ?? []).map((r) => ({
          resourceType: r.resourceType,
          tag: r.tag?.trim() || null,
          quantity: r.quantity ?? 1,
        })),
      },
    },
    include: {
      category: { select: { id: true, name: true } },
      requirements: true,
    },
  });
  return NextResponse.json({ treatment });
}
