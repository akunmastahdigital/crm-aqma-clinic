import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Hitung batas waktu berdasarkan period dan timezone WIB
function periodRange(period: string): { start: Date; end: Date; multiplier: number } {
  const tz = "Asia/Jakarta";
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: tz });

  if (period === "week") {
    const day = new Date(todayStr + "T00:00:00+07:00").getDay(); // 0=Minggu
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(todayStr + "T00:00:00+07:00");
    mon.setDate(mon.getDate() + diffToMon);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    return { start: mon, end: sun, multiplier: 5 };
  }

  if (period === "month") {
    const [y, m] = todayStr.split("-").map(Number);
    const start = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+07:00`);
    const end = new Date(y, m, 0); // last day of month
    end.setHours(23, 59, 59, 999);
    return { start, end, multiplier: 22 };
  }

  // default: hari ini
  const start = new Date(todayStr + "T00:00:00+07:00");
  const end = new Date(todayStr + "T23:59:59+07:00");
  return { start, end, multiplier: 1 };
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const period = new URL(req.url).searchParams.get("period") ?? "day";
  const { start, end, multiplier } = periodRange(period);

  // Tentukan scope: agent hanya lihat diri sendiri
  const isAgent = session.role === "AGENT";
  const userWhere = isAgent
    ? { id: session.uid, active: true }
    : { active: true, role: { in: ["AGENT", "SUPERVISOR"] as const } };

  const [users, targets] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.agentTarget.findMany(),
  ]);

  const targetMap = new Map(targets.map((t) => [t.userId, t]));
  const userIds = users.map((u) => u.id);

  // Ambil semua progress dalam satu batch
  const [fuDone, journals, closings, newLeads, responses] = await Promise.all([
    // FU selesai — jurnal dengan status DONE dan scheduledAt dalam periode
    prisma.salesJournal.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: "DONE", scheduledAt: { gte: start, lte: end } },
      _count: { id: true },
    }),
    // Total aktivitas — semua jurnal yang dibuat dalam periode
    prisma.salesJournal.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, createdAt: { gte: start, lte: end } },
      _count: { id: true },
    }),
    // Closing — customer yang closedAt dalam periode dan assigned ke agent
    prisma.customer.groupBy({
      by: ["assignedToId"],
      where: { assignedToId: { in: userIds }, closedAt: { gte: start, lte: end } },
      _count: { id: true },
    }),
    // Lead baru — customer dibuat dalam periode dan assigned ke agent
    prisma.customer.groupBy({
      by: ["assignedToId"],
      where: { assignedToId: { in: userIds }, createdAt: { gte: start, lte: end } },
      _count: { id: true },
    }),
    // Avg response time (FRT) per agent — conversation yang firstResponseAt dalam periode
    prisma.conversation.groupBy({
      by: ["assignedToId"],
      where: {
        assignedToId: { in: userIds },
        firstResponseAt: { gte: start, lte: end },
        firstResponseMinutes: { not: null },
      },
      _avg: { firstResponseMinutes: true },
      _count: { firstResponseMinutes: true },
    }),
  ]);

  const fuMap = new Map(fuDone.map((r) => [r.userId, r._count.id]));
  const actMap = new Map(journals.map((r) => [r.userId, r._count.id]));
  const closeMap = new Map(closings.map((r) => [r.assignedToId!, r._count.id]));
  const leadMap = new Map(newLeads.map((r) => [r.assignedToId!, r._count.id]));
  const frtMap = new Map(responses.map((r) => [r.assignedToId!, {
    avg: Math.round(r._avg.firstResponseMinutes ?? 0),
    count: r._count.firstResponseMinutes,
  }]));

  const rows = users.map((u) => {
    const t = targetMap.get(u.id);
    const tgt = {
      fuDaily: t?.fuDaily ?? 10,
      closingDaily: t?.closingDaily ?? 5,
      activityDaily: t?.activityDaily ?? 10,
      newLeadDaily: t?.newLeadDaily ?? 5,
    };
    return {
      userId: u.id,
      name: u.name,
      role: u.role,
      target: {
        fu: tgt.fuDaily * multiplier,
        closing: tgt.closingDaily * multiplier,
        activity: tgt.activityDaily * multiplier,
        newLead: tgt.newLeadDaily * multiplier,
        // simpan daily untuk edit
        fuDaily: tgt.fuDaily,
        closingDaily: tgt.closingDaily,
        activityDaily: tgt.activityDaily,
        newLeadDaily: tgt.newLeadDaily,
      },
      actual: {
        fu: fuMap.get(u.id) ?? 0,
        closing: closeMap.get(u.id) ?? 0,
        activity: actMap.get(u.id) ?? 0,
        newLead: leadMap.get(u.id) ?? 0,
        avgResponseMinutes: frtMap.get(u.id)?.avg ?? null,
        responseCount: frtMap.get(u.id)?.count ?? 0,
      },
    };
  });

  return NextResponse.json({ rows, period, start, end });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session.role, "manage_users"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { userId, fuDaily, closingDaily, activityDaily, newLeadDaily } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId wajib" }, { status: 400 });

  const target = await prisma.agentTarget.upsert({
    where: { userId },
    update: {
      fuDaily: fuDaily ?? 10,
      closingDaily: closingDaily ?? 5,
      activityDaily: activityDaily ?? 10,
      newLeadDaily: newLeadDaily ?? 5,
    },
    create: {
      userId,
      fuDaily: fuDaily ?? 10,
      closingDaily: closingDaily ?? 5,
      activityDaily: activityDaily ?? 10,
      newLeadDaily: newLeadDaily ?? 5,
    },
  });

  return NextResponse.json({ target });
}
