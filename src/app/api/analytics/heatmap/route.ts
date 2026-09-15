import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const days = Math.min(parseInt(sp.get("days") ?? "30"), 365);
  const since = new Date(Date.now() - days * 86_400_000);

  // Gunakan raw query agar bisa EXTRACT dengan timezone WIB
  const rows = await prisma.$queryRaw<{ dow: number; hour: number; cnt: bigint }[]>`
    SELECT
      EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'Asia/Jakarta')::int AS dow,
      EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'Asia/Jakarta')::int AS hour,
      COUNT(*) AS cnt
    FROM messages
    WHERE direction = 'IN'
      AND "createdAt" >= ${since}
    GROUP BY dow, hour
    ORDER BY dow, hour
  `;

  // BigInt → number
  const data = rows.map((r) => ({
    dow: r.dow,   // 0=Minggu, 1=Senin, ..., 6=Sabtu
    hour: r.hour,
    count: Number(r.cnt),
  }));

  return NextResponse.json({ data, days });
}
