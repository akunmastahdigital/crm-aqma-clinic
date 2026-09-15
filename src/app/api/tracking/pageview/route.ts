import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runSnippetRules } from "@/lib/rule-engine";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const slug: string = body.slug ?? "";
    if (!slug) return NextResponse.json({ error: "slug wajib" }, { status: 400, headers: CORS });

    const link = await prisma.trackingLink.findUnique({
      where: { slug, isActive: true },
      select: { id: true },
    });
    if (!link) return NextResponse.json({ ok: false, reason: "link not found" }, { headers: CORS });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("x-real-ip") ?? null;
    const ua = req.headers.get("user-agent") ?? null;
    void runSnippetRules("on_page_view", slug, {
      fbclid: body.fbclid ?? null,
      fbp: body.fbp ?? null,
      campaignId: body.campaignId ?? null,
      adsetId: body.adsetId ?? null,
      adId: body.adId ?? null,
      utmSource: body.utmSource ?? null,
      utmMedium: body.utmMedium ?? null,
      utmCampaign: body.utmCampaign ?? null,
      clientIpAddress: ip,
      clientUserAgent: ua,
    });

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch {
    return NextResponse.json({ error: "server error" }, { status: 500, headers: CORS });
  }
}
