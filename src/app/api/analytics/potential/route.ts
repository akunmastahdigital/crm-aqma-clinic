import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

const IS_AGENT_ROLE = (role: string) => role === "AGENT" || role === "GUEST";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const packageTypeId  = sp.get("packageTypeId") || undefined;
  const month          = sp.get("month") ? Number(sp.get("month")) : undefined;
  const year           = sp.get("year")  ? Number(sp.get("year"))  : undefined;
  const assignedToId   = IS_AGENT_ROLE(session.role)
    ? session.uid                          // AGENT: force filter to self
    : (sp.get("assignedToId") || undefined); // OWNER/ADMIN: respect param

  const where: Record<string, unknown> = { potentialValue: { gt: 0 } };
  if (packageTypeId) where.packageTypeId  = packageTypeId;
  if (month)         where.packageMonth   = month;
  if (year)          where.packageYear    = year;
  if (assignedToId)  where.assignedToId   = assignedToId;

  const readyWhere: Record<string, unknown> = {
    tags: { has: "Ready" },
    OR: [{ potentialValue: null }, { potentialValue: 0 }],
  };
  if (assignedToId) readyWhere.assignedToId = assignedToId;

  const [leads, packageTypes, readyWithoutPotential, agents] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: {
        id: true, name: true, externalId: true,
        packageType:    { select: { id: true, name: true } },
        packageVariant: { select: { name: true } },
        packageMonth: true, packageYear: true,
        potentialQty1x: true, potentialQty3x: true,
        potentialQty6x: true, potentialQty12x: true,
        potentialValue: true,
        assignedTo: { select: { name: true } },
      },
      orderBy: [{ packageYear: "asc" }, { packageMonth: "asc" }, { name: "asc" }],
    }),
    prisma.packageType.findMany({
      select: { id: true, name: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    prisma.customer.findMany({
      where: readyWhere,
      select: {
        id: true, name: true, externalId: true,
        tags: true,
        assignedTo: { select: { name: true } },
      },
      orderBy: { lastContactAt: "desc" },
    }),
    // Only fetch agents list for non-agent roles
    IS_AGENT_ROLE(session.role)
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { active: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
  ]);

  const totalLeads  = leads.length;
  const totalPaket = leads.reduce((s, l) => s + (l.potentialQty1x ?? 0) + (l.potentialQty3x ?? 0) + (l.potentialQty6x ?? 0) + (l.potentialQty12x ?? 0), 0);
  const totalNilai  = leads.reduce((s, l) => s + (l.potentialValue ?? 0), 0);

  // Group by package
  const pkgMap = new Map<string, {
    key: string; name: string;
    totalLeads: number; totalPaket: number; totalNilai: number;
    leads: typeof leads;
  }>();
  for (const l of leads) {
    const key  = l.packageType?.id ?? "__none__";
    const name = l.packageType?.name ?? "(Belum ada paket)";
    if (!pkgMap.has(key)) pkgMap.set(key, { key, name, totalLeads: 0, totalPaket: 0, totalNilai: 0, leads: [] });
    const g = pkgMap.get(key)!;
    g.totalLeads++;
    g.totalPaket += (l.potentialQty1x ?? 0) + (l.potentialQty3x ?? 0) + (l.potentialQty6x ?? 0) + (l.potentialQty12x ?? 0);
    g.totalNilai  += l.potentialValue ?? 0;
    g.leads.push(l);
  }

  // Group by month-year
  const monthMap = new Map<string, {
    key: string; month: number; year: number; label: string;
    totalLeads: number; totalPaket: number; totalNilai: number;
    leads: typeof leads;
  }>();
  for (const l of leads) {
    if (!l.packageMonth || !l.packageYear) {
      const key = "__none__";
      if (!monthMap.has(key)) monthMap.set(key, { key, month: 0, year: 9999, label: "Belum ditentukan", totalLeads: 0, totalPaket: 0, totalNilai: 0, leads: [] });
      const g = monthMap.get(key)!;
      g.totalLeads++; g.totalPaket += (l.potentialQty1x ?? 0) + (l.potentialQty3x ?? 0) + (l.potentialQty6x ?? 0) + (l.potentialQty12x ?? 0); g.totalNilai += l.potentialValue ?? 0; g.leads.push(l);
      continue;
    }
    const key   = `${l.packageYear}-${String(l.packageMonth).padStart(2, "0")}`;
    const label = `${MONTHS_ID[l.packageMonth - 1]} ${l.packageYear}`;
    if (!monthMap.has(key)) monthMap.set(key, { key, month: l.packageMonth, year: l.packageYear, label, totalLeads: 0, totalPaket: 0, totalNilai: 0, leads: [] });
    const g = monthMap.get(key)!;
    g.totalLeads++; g.totalPaket += (l.potentialQty1x ?? 0) + (l.potentialQty3x ?? 0) + (l.potentialQty6x ?? 0) + (l.potentialQty12x ?? 0); g.totalNilai += l.potentialValue ?? 0; g.leads.push(l);
  }

  return NextResponse.json({
    summary: { totalLeads, totalPaket, totalNilai },
    byPackage: [...pkgMap.values()],
    byMonth: [...monthMap.values()].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month),
    packageTypes,
    agents,
    readyWithoutPotential,
  });
}
