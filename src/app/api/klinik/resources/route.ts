import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardKlinik, badRequest, openingHoursSchema } from "@/lib/klinik";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  branchId: z.string().trim().min(1, "cabang wajib dipilih"),
  name: z.string().trim().min(1, "nama wajib diisi").max(100),
  type: z.enum(["STAFF", "ROOM", "EQUIPMENT"]),
  userId: z.string().trim().nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  capacity: z.number().int().min(1, "kapasitas minimal 1").max(100).optional(),
  workingHours: openingHoursSchema,
});

export async function GET(req: Request) {
  const g = await guardKlinik(false);
  if ("error" in g) return g.error;

  const url = new URL(req.url);
  const branchId = url.searchParams.get("branchId");
  const type = url.searchParams.get("type");

  const resources = await prisma.resource.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      ...(type === "STAFF" || type === "ROOM" || type === "EQUIPMENT" ? { type } : {}),
    },
    orderBy: [{ type: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    include: {
      branch: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ resources });
}

export async function POST(req: Request) {
  const g = await guardKlinik(true);
  if ("error" in g) return g.error;

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error);
  const d = parsed.data;

  const branch = await prisma.branch.findUnique({ where: { id: d.branchId } });
  if (!branch) return NextResponse.json({ error: "Cabang tidak ditemukan" }, { status: 400 });

  // userId hanya masuk akal untuk tipe STAFF
  const userId = d.type === "STAFF" && d.userId ? d.userId : null;
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 400 });
  }

  const last = await prisma.resource.findFirst({
    where: { branchId: d.branchId, type: d.type },
    orderBy: { order: "desc" },
  });

  const resource = await prisma.resource.create({
    data: {
      branchId: d.branchId,
      name: d.name,
      type: d.type,
      userId,
      tags: d.tags ?? [],
      capacity: d.capacity ?? 1,
      workingHours: d.workingHours ?? undefined,
      order: (last?.order ?? -1) + 1,
    },
    include: {
      branch: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ resource });
}
