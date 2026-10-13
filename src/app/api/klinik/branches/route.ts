import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  guardKlinik,
  badRequest,
  openingHoursSchema,
  DEFAULT_OPENING_HOURS,
} from "@/lib/klinik";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1, "nama cabang wajib diisi").max(100),
  address: z.string().trim().max(300).nullish(),
  phone: z.string().trim().max(40).nullish(),
  timezone: z.string().trim().max(60).optional(),
  openingHours: openingHoursSchema,
});

export async function GET() {
  const g = await guardKlinik(false);
  if ("error" in g) return g.error;

  const branches = await prisma.branch.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { resources: true } } },
  });
  return NextResponse.json({ branches });
}

export async function POST(req: Request) {
  const g = await guardKlinik(true);
  if ("error" in g) return g.error;

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error);
  const d = parsed.data;

  const last = await prisma.branch.findFirst({ orderBy: { order: "desc" } });

  const branch = await prisma.branch.create({
    data: {
      name: d.name,
      address: d.address ?? null,
      phone: d.phone ?? null,
      timezone: d.timezone || "Asia/Jakarta",
      openingHours: d.openingHours ?? DEFAULT_OPENING_HOURS,
      order: (last?.order ?? -1) + 1,
    },
  });
  return NextResponse.json({ branch });
}
