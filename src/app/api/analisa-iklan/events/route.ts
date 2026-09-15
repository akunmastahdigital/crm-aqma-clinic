import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const eventName = sp.get("event") || undefined;
  const dateFrom  = sp.get("dateFrom") || undefined;
  const dateTo    = sp.get("dateTo")   || undefined;
  const campaign  = sp.get("campaign") || undefined;
  const source    = sp.get("source")   || undefined;
  const take      = Math.min(parseInt(sp.get("take") ?? "100"), 500);
  const skip      = parseInt(sp.get("skip") ?? "0");

  const where: Record<string, unknown> = { status: "sent" };
  if (eventName)  where.eventName  = eventName;
  if (dateFrom || dateTo) {
    where.sentAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo   ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
    };
  }

  const events = await prisma.capiEvent.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take,
    skip,
    select: {
      id:        true,
      eventName: true,
      value:     true,
      currency:  true,
      sentAt:    true,
      campaignId: true,
      adId:      true,
      customerId: true,
      customer: {
        select: {
          id:      true,
          name:    true,
          phone:   true,
          channel: true,
          clickSessions: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              utmSource:    true,
              utmMedium:    true,
              utmCampaign:  true,
              campaignName: true,
              adsetName:    true,
              adName:       true,
              siteSourceName: true,
              fbclid:       true,
              createdAt:    true,
            },
          },
        },
      },
    },
  });

  // filter campaign/source setelah join (lebih simpel daripada rawQuery)
  const filtered = events.filter((e) => {
    const cs = e.customer?.clickSessions[0];
    if (campaign && cs?.campaignName !== campaign) return false;
    if (source   && cs?.utmSource    !== source)   return false;
    return true;
  });

  // daftar event types yang ada (untuk dropdown filter)
  const eventTypes = await prisma.capiEvent.findMany({
    where: { status: "sent" },
    distinct: ["eventName"],
    select: { eventName: true },
    orderBy: { eventName: "asc" },
  });

  // daftar campaign names (dari click sessions yang ter-match)
  const campaigns = await prisma.clickSession.findMany({
    where:    { campaignName: { not: null }, customerId: { not: null } },
    distinct: ["campaignName"],
    select:   { campaignName: true },
    orderBy:  { campaignName: "asc" },
  });

  // daftar utm sources
  const sources = await prisma.clickSession.findMany({
    where:    { utmSource: { not: null }, customerId: { not: null } },
    distinct: ["utmSource"],
    select:   { utmSource: true },
    orderBy:  { utmSource: "asc" },
  });

  // hitung total value untuk summary
  const totalValue = filtered.reduce((sum, e) => sum + (e.value ?? 0), 0);

  return NextResponse.json({
    events: filtered,
    total:  filtered.length,
    totalValue,
    eventTypes: eventTypes.map((e) => e.eventName),
    campaigns:  campaigns.map((c) => c.campaignName).filter(Boolean),
    sources:    sources.map((s) => s.utmSource).filter(Boolean),
  });
}
