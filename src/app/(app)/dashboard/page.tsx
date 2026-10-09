import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ROLE_LABEL } from "@/lib/rbac";
import { MessageCircle, Users, Radio, Bot, CalendarClock, AlertCircle, Activity, Trophy, TrendingUp, TrendingDown, Minus, ArrowRight, UserPlus, RefreshCw, BadgeCheck, Settings2 } from "lucide-react";
import Link from "next/link";
import { TrendChart } from "./trend-chart";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const todayStart = new Date(todayStr + "T00:00:00+07:00");
  const todayEnd = new Date(todayStr + "T23:59:59+07:00");
  const agentFilter = session?.role === "AGENT" ? { userId: session.uid } : {};

  // Bulan ini & bulan lalu (WIB)
  const jakartaNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const monthStart = new Date(jakartaNow.getFullYear(), jakartaNow.getMonth(), 1);
  const lastMonthStart = new Date(jakartaNow.getFullYear(), jakartaNow.getMonth() - 1, 1);
  const lastMonthEnd = new Date(jakartaNow.getFullYear(), jakartaNow.getMonth(), 0, 23, 59, 59);

  const [msgs30, totalCustomers, activeChats, aiReplies, fuToday, overdue, actByTypeRaw,
    closingMonth, closingLastMonth, dpMonth, dpLastMonth] = await Promise.all([
    prisma.message.count({ where: { direction: "OUT", createdAt: { gte: thirtyDaysAgo } } }),
    prisma.customer.count(session?.role === "AGENT" ? { where: { assignedToId: session!.uid } } : undefined),
    prisma.conversation.count({ where: { status: "OPEN" } }),
    prisma.message.count({ where: { direction: "OUT", authorId: null, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.salesJournal.count({ where: { ...agentFilter, scheduledAt: { gte: todayStart, lte: todayEnd }, status: "PENDING" } }),
    prisma.salesJournal.count({ where: { ...agentFilter, scheduledAt: { lt: now }, status: "PENDING" } }),
    prisma.salesJournal.groupBy({ by: ["activityType"], where: { ...agentFilter, date: { gte: todayStart, lte: todayEnd } }, _count: { _all: true } }),
    // Closing bulan ini & lalu
    prisma.customer.count({ where: { ...(session?.role === "AGENT" ? { assignedToId: session!.uid } : {}), closedAt: { gte: monthStart } } }),
    prisma.customer.count({ where: { ...(session?.role === "AGENT" ? { assignedToId: session!.uid } : {}), closedAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
    // Revenue DP (Purchase CAPI) bulan ini & lalu — CapiEvent pakai sentAt bukan createdAt
    prisma.capiEvent.aggregate({ where: { eventName: "Purchase", sentAt: { gte: monthStart } }, _sum: { value: true } }),
    prisma.capiEvent.aggregate({ where: { eventName: "Purchase", sentAt: { gte: lastMonthStart, lte: lastMonthEnd } }, _sum: { value: true } }),
  ]);

  const actByType: Record<string, number> = {};
  for (const r of actByTypeRaw) { actByType[r.activityType] = r._count._all; }
  const actTotal = Object.values(actByType).reduce((s, v) => s + v, 0);

  // Tren 7 hari — lead baru & pesan masuk per hari (WIB)
  const [tren7Leads, tren7Msgs] = await Promise.all([
    prisma.$queryRaw<Array<{ day: string; count: number }>>`
      SELECT TO_CHAR("createdAt" AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM customers
      WHERE "createdAt" >= NOW() - INTERVAL '7 days'
      GROUP BY day ORDER BY day
    `,
    prisma.$queryRaw<Array<{ day: string; count: number }>>`
      SELECT TO_CHAR("createdAt" AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM messages
      WHERE "createdAt" >= NOW() - INTERVAL '7 days' AND direction = 'IN'
      GROUP BY day ORDER BY day
    `,
  ]);

  // Bangun array 7 hari (hari ini mundur 6 hari)
  const tren7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86_400_000);
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  });
  const leadsMap = Object.fromEntries(tren7Leads.map((r) => [r.day, r.count]));
  const msgsMap  = Object.fromEntries(tren7Msgs.map((r) => [r.day, r.count]));
  const trendData = tren7Days.map((day) => ({ day, leads: leadsMap[day] ?? 0, msgs: msgsMap[day] ?? 0 }));

  // Top agent hari ini — hanya untuk ADMIN/SUPERVISOR
  let topAgents: Array<{ name: string; act: number; closing: number; fu: number }> = [];
  if (session?.role !== "AGENT") {
    const [actByAgent, closingByAgent, fuDoneByAgent] = await Promise.all([
      prisma.salesJournal.groupBy({ by: ["userId"], where: { date: { gte: todayStart, lte: todayEnd } }, _count: { _all: true }, orderBy: { _count: { userId: "desc" } }, take: 10 }),
      prisma.salesJournal.groupBy({ by: ["userId"], where: { activityType: "Closing", date: { gte: todayStart, lte: todayEnd } }, _count: { _all: true } }),
      prisma.salesJournal.groupBy({ by: ["userId"], where: { scheduledAt: { gte: todayStart, lte: todayEnd }, status: "DONE" }, _count: { _all: true } }),
    ]);
    const allUids = [...new Set(actByAgent.map((r) => r.userId))];
    const users = await prisma.user.findMany({ where: { id: { in: allUids } }, select: { id: true, name: true } });
    const nameMap = Object.fromEntries(users.map((u) => [u.id, u.name]));
    const closingMap = Object.fromEntries(closingByAgent.map((r) => [r.userId, r._count._all]));
    const fuDoneMap = Object.fromEntries(fuDoneByAgent.map((r) => [r.userId, r._count._all]));
    topAgents = actByAgent.map((r) => ({
      name: nameMap[r.userId] ?? r.userId,
      act: r._count._all,
      closing: closingMap[r.userId] ?? 0,
      fu: fuDoneMap[r.userId] ?? 0,
    })).sort((a, b) => b.act - a.act).slice(0, 5);
  }

  const dpMonthVal = dpMonth._sum.value ?? 0;
  const dpLastMonthVal = dpLastMonth._sum.value ?? 0;

  function closingDiff() {
    if (closingLastMonth === 0) return null;
    const pct = Math.round(((closingMonth - closingLastMonth) / closingLastMonth) * 100);
    return pct;
  }
  function dpDiff() {
    if (dpLastMonthVal === 0) return null;
    const pct = Math.round(((dpMonthVal - dpLastMonthVal) / dpLastMonthVal) * 100);
    return pct;
  }
  function fmtRupiah(v: number) {
    if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1)}M`;
    if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)}jt`;
    return `Rp ${v.toLocaleString("id-ID")}`;
  }

  const TOP_STATS = [
    { label: "Pesan (30 hari)", value: msgs30.toLocaleString("id-ID"), icon: MessageCircle },
    { label: "Total Pasien & Lead", value: totalCustomers.toLocaleString("id-ID"), icon: Users },
    { label: "Chat Aktif", value: activeChats.toLocaleString("id-ID"), icon: Radio },
    { label: "Balasan AI (30 hari)", value: aiReplies.toLocaleString("id-ID"), icon: Bot },
  ];

  const cDiff = closingDiff();
  const dDiff = dpDiff();
  const monthLabel = jakartaNow.toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader
        title="Dasbor"
        description={`Halo, ${session?.name ?? ""} — ${session ? ROLE_LABEL[session.role] : ""}`}
      />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {TOP_STATS.map((s) => (
            <Card key={s.label} className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft">
                  <s.icon className="h-[18px] w-[18px] text-primary" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-bold tracking-tight">{s.value}</div>
            </Card>
          ))}
        </div>

        {/* Closing & Revenue bulan ini */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Closing & Omzet — {monthLabel}</h2>
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-5 border-accent/40 bg-accent-soft/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-success">
                  <Trophy className="h-4 w-4" />
                  <span className="text-xs font-medium">Pasien Closing</span>
                </div>
                {cDiff !== null && (
                  <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${cDiff >= 0 ? "bg-accent-soft text-success" : "bg-red-100 text-red-600"}`}>
                    {cDiff >= 0 ? <TrendingUp className="h-3 w-3" /> : cDiff < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                    {cDiff >= 0 ? "+" : ""}{cDiff}% vs bln lalu
                  </span>
                )}
              </div>
              <div className="mt-3 text-3xl font-bold tracking-tight text-primary-dark">{closingMonth}</div>
              <p className="mt-0.5 text-xs text-success">pasien closing bulan ini</p>
              {closingLastMonth > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Bulan lalu: {closingLastMonth} closing</p>
              )}
            </Card>
            <Card className="p-5 border-accent/40 bg-accent-soft/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-success">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium">Total DP / Omzet</span>
                </div>
                {dDiff !== null && (
                  <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${dDiff >= 0 ? "bg-accent-soft text-success" : "bg-red-100 text-red-600"}`}>
                    {dDiff >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {dDiff >= 0 ? "+" : ""}{dDiff}% vs bln lalu
                  </span>
                )}
              </div>
              <div className="mt-3 text-3xl font-bold tracking-tight text-primary-dark">{fmtRupiah(dpMonthVal)}</div>
              <p className="mt-0.5 text-xs text-success">total nilai DP yang dicatat</p>
              {dpLastMonthVal > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Bulan lalu: {fmtRupiah(dpLastMonthVal)}</p>
              )}
            </Card>
          </div>
        </div>

        {/* Grafik tren 7 hari */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tren 7 Hari Terakhir</h2>
          <Card className="p-5">
            <TrendChart data={trendData} />
          </Card>
        </div>

        {/* Top Agent hari ini — hanya ADMIN/SUPERVISOR */}
        {session?.role !== "AGENT" && topAgents.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Performa Tim — Hari Ini</h2>
            <Card className="divide-y">
              {topAgents.map((agent, i) => (
                <div key={agent.name} className="flex items-center gap-3 px-5 py-3">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold
                    ${i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-slate-100 text-slate-600" : i === 2 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground"}`}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium">{agent.name}</span>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {agent.closing > 0 && (
                      <span className="flex items-center gap-1 text-success font-semibold">
                        <Trophy className="h-3 w-3" /> {agent.closing} closing
                      </span>
                    )}
                    {agent.fu > 0 && (
                      <span className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" /> {agent.fu} FU selesai
                      </span>
                    )}
                    <span className="flex items-center gap-1 font-semibold text-foreground">
                      <Activity className="h-3 w-3" /> {agent.act} aktivitas
                    </span>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Jurnal Sales — Hari Ini</h2>
            <Link href="/jurnal" className="flex items-center gap-1 text-xs text-primary hover:underline font-medium">
              Lihat Jurnal <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                <span className="text-xs font-medium">Follow Up Hari Ini</span>
              </div>
              <div className="mt-2 text-2xl font-bold">{fuToday}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">jadwal pending hari ini</p>
            </Card>
            <Card className={`p-4 ${overdue > 0 ? "border-red-300 bg-red-50" : ""}`}>
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className={`h-4 w-4 ${overdue > 0 ? "text-red-500" : ""}`} />
                <span className="text-xs font-medium">Overdue</span>
              </div>
              <div className={`mt-2 text-2xl font-bold ${overdue > 0 ? "text-red-500" : ""}`}>{overdue}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">follow up terlewat</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-medium">Total Aktivitas</span>
              </div>
              <div className="mt-2 text-2xl font-bold">{actTotal}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">entri jurnal hari ini</p>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-medium">Breakdown Aktivitas</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-blue-600"><UserPlus className="h-3 w-3" /> Lead Baru</span>
                  <span className="font-bold text-blue-700">{actByType["Lead Baru"] ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-amber-600"><RefreshCw className="h-3 w-3" /> Follow Up</span>
                  <span className="font-bold text-amber-700">{actByType["Follow Up"] ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-success"><BadgeCheck className="h-3 w-3" /> Closing</span>
                  <span className="font-bold text-success">{actByType["Closing"] ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-slate-500"><Settings2 className="h-3 w-3" /> Lainnya</span>
                  <span className="font-bold text-slate-600">{(actByType["After Sales"] ?? 0) + (actByType["Admin"] ?? 0)}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
