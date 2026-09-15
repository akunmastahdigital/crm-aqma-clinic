import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function parseDevice(ua: string | null): string {
  if (!ua) return "—";
  if (/facebookexternalhit/i.test(ua)) return "FB Crawler";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS/i.test(ua)) return "Mac";
  return "Desktop";
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const page = parseInt(sp.get("page") ?? "1");
  const limit = 50;
  const skip = (page - 1) * limit;
  const filter = sp.get("filter") ?? "all";
  const linkId = sp.get("linkId") ?? "";

  const source = sp.get("source") ?? ""; // "ctwa" | "lpwa" | ""

  // Pakai AND array supaya bisa OR userAgent null tanpa konflik kondisi lain
  const andConditions: Record<string, unknown>[] = [
    // Exclude FB crawler, tapi SERTAKAN userAgent null (CTWA sessions)
    {
      OR: [
        { userAgent: null },
        { userAgent: { not: { contains: "facebookexternalhit" } } },
      ],
    },
  ];
  if (filter === "matched") andConditions.push({ customerId: { not: null } });
  if (filter === "unmatched") andConditions.push({ customerId: null });
  if (linkId) andConditions.push({ linkId });
  if (source === "ctwa") andConditions.push({ code: { startsWith: "C-" } });
  if (source === "lpwa") andConditions.push({ code: { startsWith: "T-" } });

  const where = { AND: andConditions };

  const [total, sessions] = await Promise.all([
    prisma.clickSession.count({ where }),
    prisma.clickSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        customer: { select: { id: true, name: true, phone: true, tags: true } },
        link: { select: { name: true, slug: true } },
      },
    }),
  ]);

  // Ambil event log per customer (batch)
  const customerIds = sessions.map(s => s.customerId).filter(Boolean) as string[];
  const allEvents = customerIds.length > 0
    ? await prisma.capiEvent.findMany({
        where: { customerId: { in: customerIds } },
        orderBy: { sentAt: "desc" },
        select: { customerId: true, eventName: true, value: true, status: true, sentAt: true },
      })
    : [];

  // Group events by customerId
  const eventsByCustomer: Record<string, typeof allEvents> = {};
  for (const e of allEvents) {
    if (!e.customerId) continue;
    if (!eventsByCustomer[e.customerId]) eventsByCustomer[e.customerId] = [];
    eventsByCustomer[e.customerId].push(e);
  }

  const leads = sessions.map(s => {
    const events = s.customerId ? (eventsByCustomer[s.customerId] ?? []) : [];
    return {
      id: s.id,
      code: s.code,
      isCTWA: s.code.startsWith("C-"),
      createdAt: s.createdAt,
      matchedAt: s.matchedAt,
      linkName: s.link?.name ?? "—",
      linkSlug: s.link?.slug ?? "—",
      customerName: s.customer?.name ?? null,
      customerPhone: s.customer?.phone ?? null,
      customerId: s.customerId,
      customerTags: s.customer?.tags ?? [],
      campaignName: s.campaignName,
      campaignId: s.campaignId,
      adsetName: s.adsetName,
      adsetId: s.adsetId,
      adName: s.adName,
      adId: s.adId,
      placement: s.placement,
      siteSourceName: s.siteSourceName,
      utmSource: s.utmSource,
      utmMedium: s.utmMedium,
      utmCampaign: s.utmCampaign,
      fbclid: s.fbclid ? s.fbclid.slice(0, 16) + "..." : null,
      ip: s.ip,
      device: parseDevice(s.userAgent),
      referer: s.referer,
      lastEvent: events[0]?.eventName ?? null,
      events: events.slice(0, 10).map(e => ({
        eventName: e.eventName,
        value: e.value,
        status: e.status,
        sentAt: e.sentAt,
      })),
    };
  });

  return NextResponse.json({ leads, total, page, pages: Math.ceil(total / limit) });
}
