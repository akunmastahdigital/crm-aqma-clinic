import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const take = Math.min(parseInt(url.searchParams.get("take") ?? "50"), 200);
  const events = await prisma.capiEvent.findMany({
    orderBy: { sentAt: "desc" },
    take,
    include: { customer: { select: { name: true, phone: true } } },
  });
  return NextResponse.json({ events });
}
