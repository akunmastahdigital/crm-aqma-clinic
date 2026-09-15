import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

const TIER_LABEL: Record<string, string> = {
  TIER_50: "50 / hari",
  TIER_250: "250 / hari",
  TIER_1K: "1.000 / hari",
  TIER_10K: "10.000 / hari",
  TIER_100K: "100.000 / hari",
  TIER_UNLIMITED: "Unlimited",
};

const TIER_VALUE: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: 999999,
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const channels = await prisma.wabaChannel.findMany({
    where: { active: true },
    select: { phoneNumberId: true, label: true, displayPhone: true, accessToken: true },
    orderBy: { label: "asc" },
  });

  const results = await Promise.all(
    channels.map(async (ch) => {
      try {
        const res = await fetch(
          `${GRAPH}/${ch.phoneNumberId}?fields=messaging_limit_tier,quality_rating,verified_name`,
          { headers: { Authorization: `Bearer ${ch.accessToken}` } },
        );
        const data = await res.json().catch(() => ({}));
        const tier = (data.messaging_limit_tier as string | undefined) ?? "TIER_250";
        const tierValue = TIER_VALUE[tier] ?? 250;
        return {
          phoneNumberId: ch.phoneNumberId,
          label: ch.label,
          displayPhone: ch.displayPhone,
          tier,
          tierLabel: TIER_LABEL[tier] ?? tier,
          tierValue,
          qualityRating: (data.quality_rating as string | undefined) ?? "UNKNOWN",
          callingReady: tierValue >= 2000,
          error: null as string | null,
        };
      } catch (e) {
        return {
          phoneNumberId: ch.phoneNumberId,
          label: ch.label,
          displayPhone: ch.displayPhone,
          tier: "UNKNOWN",
          tierLabel: "-",
          tierValue: 0,
          qualityRating: "UNKNOWN",
          callingReady: false,
          error: e instanceof Error ? e.message : "Gagal memuat data",
        };
      }
    }),
  );

  return NextResponse.json({ health: results });
}
