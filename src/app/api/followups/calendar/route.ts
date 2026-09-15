import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const TZ_OFFSET = 7 * 60 * 60 * 1000; // WIB = UTC+7

function toWibDateStr(date: Date): string {
  const wib = new Date(date.getTime() + TZ_OFFSET);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const d = String(wib.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const month = Number(sp.get("month") ?? new Date().getUTCMonth() + 1);
  const year  = Number(sp.get("year")  ?? new Date().getUTCFullYear());
  const assignedToId = sp.get("assignedToId") || undefined;

  // Batas awal dan akhir bulan (UTC, cover WIB shift)
  const start = new Date(Date.UTC(year, month - 1, 1) - TZ_OFFSET);
  const end   = new Date(Date.UTC(year, month, 1)     - TZ_OFFSET + 86_400_000);

  const where: Record<string, unknown> = {
    scheduledAt: { gte: start, lt: end },
  };

  if (session.role === "AGENT") {
    where.OR = [{ assignedToId: session.uid }, { assignedToId: null }];
  } else if (assignedToId) {
    where.assignedToId = assignedToId;
  }

  const items = await prisma.followUp.findMany({
    where,
    orderBy: { scheduledAt: "asc" },
    include: {
      customer: { select: { id: true, name: true, externalId: true } },
      assignedTo: { select: { name: true } },
    },
  });

  // Group per tanggal WIB
  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    const key = toWibDateStr(item.scheduledAt);
    (grouped[key] = grouped[key] ?? []).push(item);
  }

  // Fetch agents list untuk dropdown filter (non-agent role)
  const agents = session.role !== "AGENT"
    ? await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return NextResponse.json({ grouped, agents });
}
