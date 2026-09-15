import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") ?? "30", 10);
  const groupBy = url.searchParams.get("groupBy") ?? "campaign"; // campaign | adset | ad

  const since = new Date(Date.now() - days * 86_400_000);

  const [clicks, capiEvents] = await Promise.all([
    prisma.clickSession.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        campaignId: true,
        campaignName: true,
        adsetId: true,
        adsetName: true,
        adId: true,
        adName: true,
        customerId: true,
        matchedAt: true,
        linkId: true,
        createdAt: true,
        link: { select: { name: true } },
      },
    }),
    prisma.capiEvent.findMany({
      where: { sentAt: { gte: since } },
      select: {
        id: true,
        eventName: true,
        campaignId: true,
        adsetId: true,
        adId: true,
        value: true,
        status: true,
        sentAt: true,
        customerId: true,
      },
    }),
  ]);

  type Row = {
    key: string;
    label: string;
    clicks: number;
    matched: number;
    leads: number;
    purchases: number;
    revenue: number;
  };
  const map = new Map<string, Row>();

  function getKey(c: { campaignId?: string | null; adsetId?: string | null; adId?: string | null; campaignName?: string | null; adsetName?: string | null; adName?: string | null }): [string, string] {
    if (groupBy === "ad") {
      const k = c.adId ?? "unknown";
      return [k, c.adName ?? c.adId ?? "(tanpa nama ad)"];
    }
    if (groupBy === "adset") {
      const k = c.adsetId ?? "unknown";
      return [k, c.adsetName ?? c.adsetId ?? "(tanpa nama adset)"];
    }
    const k = c.campaignId ?? "unknown";
    return [k, c.campaignName ?? c.campaignId ?? "(tanpa campaign)"];
  }

  for (const c of clicks) {
    const [key, label] = getKey(c);
    if (!map.has(key)) map.set(key, { key, label, clicks: 0, matched: 0, leads: 0, purchases: 0, revenue: 0 });
    const row = map.get(key)!;
    row.clicks++;
    if (c.customerId || c.matchedAt) row.matched++;
  }

  for (const e of capiEvents) {
    if (e.status !== "sent") continue;
    const [key, label] = getKey(e);
    if (!map.has(key)) map.set(key, { key, label, clicks: 0, matched: 0, leads: 0, purchases: 0, revenue: 0 });
    const row = map.get(key)!;
    if (e.eventName === "Lead") row.leads++;
    if (e.eventName === "Purchase") {
      row.purchases++;
      row.revenue += e.value ?? 0;
    }
  }

  const rows = [...map.values()].sort((a, b) => b.clicks - a.clicks);

  const summary = rows.reduce(
    (s, r) => ({
      clicks: s.clicks + r.clicks,
      matched: s.matched + r.matched,
      leads: s.leads + r.leads,
      purchases: s.purchases + r.purchases,
      revenue: s.revenue + r.revenue,
    }),
    { clicks: 0, matched: 0, leads: 0, purchases: 0, revenue: 0 },
  );

  // Daily trend (last 14 days for chart)
  const trendDays = Math.min(days, 14);
  const trendSince = new Date(Date.now() - trendDays * 86_400_000);
  const recentClicks = clicks.filter(c => new Date(c.createdAt ?? 0) >= trendSince);

  const trend: Record<string, { date: string; clicks: number; matched: number; leads: number }> = {};
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    trend[key] = { date: key, clicks: 0, matched: 0, leads: 0 };
  }
  for (const c of recentClicks) {
    const key = new Date(c.createdAt ?? 0).toISOString().slice(0, 10);
    if (trend[key]) {
      trend[key].clicks++;
      if (c.customerId || c.matchedAt) trend[key].matched++;
    }
  }
  for (const e of capiEvents.filter(e => e.eventName === "Lead" && e.status === "sent" && new Date(e.sentAt ?? 0) >= trendSince)) {
    const key = new Date(e.sentAt ?? 0).toISOString().slice(0, 10);
    if (trend[key]) trend[key].leads++;
  }

  return NextResponse.json({ summary, rows, trend: Object.values(trend) });
}
