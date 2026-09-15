import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ROLE_LABEL } from "@/lib/rbac";
import { MessageCircle, Users, Radio, Bot, CalendarClock, AlertCircle, Activity } from "lucide-react";
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

  const [msgs30, totalCustomers, activeChats, aiReplies, fuToday, overdue, actToday] = await Promise.all([
    prisma.message.count({ where: { direction: "OUT", createdAt: { gte: thirtyDaysAgo } } }),
    prisma.customer.count(session?.role === "AGENT" ? { where: { assignedToId: session!.uid } } : undefined),
    prisma.conversation.count({ where: { status: "OPEN" } }),
    prisma.message.count({ where: { direction: "OUT", authorId: null, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.salesJournal.count({ where: { ...agentFilter, scheduledAt: { gte: todayStart, lte: todayEnd }, status: "PENDING" } }),
    prisma.salesJournal.count({ where: { ...agentFilter, scheduledAt: { lt: now }, status: "PENDING" } }),
    prisma.salesJournal.count({ where: { ...agentFilter, createdAt: { gte: todayStart } } }),
  ]);

  const TOP_STATS = [
    { label: "Pesan (30 hari)", value: msgs30.toLocaleString("id-ID"), icon: MessageCircle },
    { label: "Total Pelanggan", value: totalCustomers.toLocaleString("id-ID"), icon: Users },
    { label: "Chat Aktif", value: activeChats.toLocaleString("id-ID"), icon: Radio },
    { label: "Balasan AI (30 hari)", value: aiReplies.toLocaleString("id-ID"), icon: Bot },
  ];

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

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Jurnal Sales — Hari Ini</h2>
          <div className="grid grid-cols-3 gap-4">
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
                <span className="text-xs font-medium">Aktivitas Hari Ini</span>
              </div>
              <div className="mt-2 text-2xl font-bold">{actToday}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">entri jurnal dibuat</p>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
