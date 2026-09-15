import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const slugsParam = req.nextUrl.searchParams.get("slugs") ?? "";
  const slugs = slugsParam.split(",").map(s => s.trim()).filter(Boolean).slice(0, 20);
  if (!slugs.length) return NextResponse.json({ configs: [] }, { headers: CORS });

  const links = await prisma.trackingLink.findMany({
    where: { slug: { in: slugs }, isActive: true },
    select: { slug: true, pageViewEvent: true, clickEvent: true },
  });

  return NextResponse.json({ configs: links }, { headers: CORS });
}
