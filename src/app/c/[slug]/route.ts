import { NextRequest, NextResponse } from "next/server";
import { runSnippetRules } from "@/lib/rule-engine";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return "T-" + code;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const sp = req.nextUrl.searchParams;

  const link = await prisma.trackingLink.findUnique({
    where: { slug, isActive: true },
    include: { channel: { select: { displayPhone: true, phoneNumberId: true } } },
    // clickEvent & pageViewEvent included via prisma auto-select
  });

  if (!link) return new NextResponse("Not found", { status: 404 });

  // Cek cookie — per slug+adId agar creative berbeda dapat session sendiri
  const adId = sp.get("ad_id") ?? "";
  const cookieKey = adId ? `tc_${slug}_${adId}` : `tc_${slug}`;
  const existingCode = req.cookies.get(cookieKey)?.value;

  let code: string;
  let isNewCode = false;

  if (existingCode && /^T-[A-Z0-9]{5}$/.test(existingCode)) {
    code = existingCode;
  } else {
    // Generate kode baru yang unik
    code = genCode();
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.clickSession.findUnique({ where: { code } });
      if (!exists) break;
      code = genCode();
    }
    isNewCode = true;
  }

  // Rekam klik baru (tetap per klik untuk analitik)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip") ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  const referer = req.headers.get("referer") ?? null;

  await prisma.clickSession.create({
    data: {
      linkId: link.id,
      code,
      fbclid: sp.get("fbclid") ?? null,
      fbp: sp.get("fbp") ?? null,
      utmSource: sp.get("utm_source") ?? null,
      utmMedium: sp.get("utm_medium") ?? null,
      utmCampaign: sp.get("utm_campaign") ?? null,
      utmTerm: sp.get("utm_term") ?? null,
      utmContent: sp.get("utm_content") ?? null,
      campaignId: sp.get("campaign_id") ?? null,
      adsetId: sp.get("adset_id") ?? null,
      adId: sp.get("ad_id") ?? null,
      campaignName: sp.get("campaign_name") ?? null,
      adsetName: sp.get("adset_name") ?? null,
      adName: sp.get("ad_name") ?? null,
      placement: sp.get("ad_meta") ?? sp.get("placement") ?? null,
      siteSourceName: sp.get("site_source_name") ?? null,
      adAccountId: sp.get("ad_account_id") ?? null,
      ip,
      userAgent: ua,
      referer,
    },
  }).catch(() => {});

  // Fire on_link_click rules dari Rule Engine (async, non-blocking)
  void runSnippetRules("on_link_click", slug, {
    fbclid: sp.get("fbclid") ?? null,
    campaignId: sp.get("campaign_id") ?? null,
    adsetId: sp.get("adset_id") ?? null,
    adId: sp.get("ad_id") ?? null,
    utmSource: sp.get("utm_source") ?? null,
    utmMedium: sp.get("utm_medium") ?? null,
    utmCampaign: sp.get("utm_campaign") ?? null,
    clientIpAddress: ip,
    clientUserAgent: ua,
  });

  const greeting =
    link.codePosition === "before"
      ? `[${code}] ${link.greetingTemplate}`
      : `${link.greetingTemplate} [${code}]`;

  const waNum = (link.channel?.displayPhone ?? link.channel?.phoneNumberId ?? "")
    .replace(/\D/g, "");
  const waUrl = `https://wa.me/${waNum}?text=${encodeURIComponent(greeting)}`;

  const res = NextResponse.redirect(waUrl, 302);

  // Simpan kode di cookie browser (30 hari) — biar klik berikutnya dapat kode sama
  if (isNewCode) {
    res.cookies.set(cookieKey, code, {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: false,
      sameSite: "lax",
      path: "/",
    });
  }

  return res;
}
