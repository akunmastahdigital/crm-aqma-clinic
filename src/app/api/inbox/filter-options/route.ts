import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [customers, pipelines, minatTags] = await Promise.all([
    prisma.customer.findMany({ select: { tags: true } }),
    prisma.pipeline.findMany({
      include: { stages: { orderBy: { order: "asc" }, select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.leadTag.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const allTags = [...new Set(customers.flatMap((c) => c.tags))].sort();

  return NextResponse.json({
    tags: allTags,
    pipelines: pipelines.map((p) => ({ id: p.id, name: p.name, stages: p.stages })),
    minatTags,
  });
}
