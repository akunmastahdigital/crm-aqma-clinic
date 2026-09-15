import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SESSION_PACKS = ["1x", "3x", "6x", "12x"];

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!["OWNER", "SUPERADMIN", "SUPERVISOR"].includes(session.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id: packageVariantId } = await params;
  const body = await req.json().catch(() => ({}));

  // body: { "1x": 350000, "3x": 950000, "6x": 1800000, "12x": 3400000 }
  const upserts = SESSION_PACKS.map((sessionPack) => {
    const price = body[sessionPack] != null ? Number(body[sessionPack]) : 0;
    return prisma.packagePrice.upsert({
      where: { packageVariantId_sessionPack: { packageVariantId, sessionPack } },
      update: { price },
      create: { packageVariantId, sessionPack, price },
    });
  });

  const prices = await prisma.$transaction(upserts);
  return NextResponse.json({ prices });
}
