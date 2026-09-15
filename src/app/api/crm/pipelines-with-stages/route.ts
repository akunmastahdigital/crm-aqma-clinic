import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pipelines = await prisma.pipeline.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      stages: { orderBy: { order: "asc" }, select: { id: true, name: true, color: true, order: true } },
    },
  });

  return NextResponse.json({ pipelines });
}
