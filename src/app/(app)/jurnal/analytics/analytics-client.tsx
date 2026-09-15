"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ArrowLeft, TrendingUp, Users, XCircle, BarChart2, Grid2x2, AlertCircle, Clock, UserCheck, Timer, AlertTriangle, Sparkles, Tag, CalendarX, ArrowUpRight, ArrowDownRight, Minus, ChevronDown, ChevronRight, MessageSquare, Star } from "lucide-react";
import { HeatmapChart } from "@/components/heatmap-chart";
import Link from "next/link";

// ─── Comparison Widget ────────────────────────────────────────────────────────

type DeltaVal = { pct: number | null; dir: "up" | "down" | "same" };
type FailRow  = { reason: string; curCount: number; prevCount: number; diff: number };
type CompData = {
  cur: { totalLeads: number; closings: number; fails: number; activity: number; messages: number; closingRate: number };
  prev: { totalLeads: number; closings: number; fails: number; activity: number; messages: number; closingRate: number };
  curRange: { start: string; end: string };
  prevRange: { start: string; end: string };
  delta: { leads: DeltaVal; closingRate: DeltaVal; closings: DeltaVal; activity: DeltaVal; messages: DeltaVal };
  metricCauses: Record<string, string[]>;
  failBreakdown: FailRow[];
};

type PeriodKey = "day" | "week" | "month";

const PERIOD_LABELS: Record<PeriodKey, { tab: string; cur: string; prev: string }> = {
  day:   { tab: "Hari",   cur: "Hari Ini",           prev: "vs Kemarin" },
  week:  { tab: "7 Hari", cur: "7 Hari Terakhir",    prev: "vs 7 Hari Sebelumnya" },
  month: { tab: "30 Hari",cur: "30 Hari Terakhir",   prev: "vs 30 Hari Sebelumnya" },
};

function DeltaBadge({ d, higherIsBetter = true }: { d: DeltaVal; higherIsBetter?: boolean }) {
  if (d.dir === "same" || d.pct === null) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        <Minus className="h-3 w-3" />
        Sama
      </span>
    );
  }
  const isGood = higherIsBetter ? d.dir === "up" : d.dir === "down";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
        isGood ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
      }`}
    >
      {d.dir === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {d.pct}%
    </span>
  );
}

function FailBreakdownTable({ rows, dFails }: { rows: FailRow[]; dFails: number }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.curCount), 1);
  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-white overflow-hidden">
      <div className="px-3 py-2 bg-red-50 border-b border-red-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-red-700">
          Breakdown Alasan Gagal Closing {dFails > 0 ? `(+${dFails} dari periode lalu)` : ""}
        </span>
        <span className="text-xs text-muted-foreground">{rows.reduce((s, r) => s + r.curCount, 0)} total</span>
      </div>
      <div className="divide-y divide-red-50">
        {rows.map((r) => (
          <div key={r.reason} className="px-3 py-2">
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="text-xs font-medium text-gray-800 truncate flex-1">{r.reason}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-bold text-red-700">{r.curCount}×</span>
                {r.diff !== 0 && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    r.diff > 0 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
                  }`}>
                    {r.diff > 0 ? `+${r.diff}` : r.diff}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">sblm: {r.prevCount}</span>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-red-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-red-400 transition-all"
                style={{ width: `${Math.round((r.curCount / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparisonWidget() {
  const [period, setPeriod] = useState<PeriodKey>("day");
  const [data, setData] = useState<Record<PeriodKey, CompData | null>>({ day: null, week: null, month: null });
  const [loading, setLoading] = useState<PeriodKey | null>("day");

  const load = useCallback(async (p: PeriodKey) => {
    if (data[p]) return;
    setLoading(p);
    try {
      const res = await fetch(`/api/analytics/comparison?period=${p}`);
      const json = await res.json();
      setData((prev) => ({ ...prev, [p]: json }));
    } finally {
      setLoading(null);
    }
  }, [data]);

  useEffect(() => { void load("day"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTab = (p: PeriodKey) => {
    setPeriod(p);
    void load(p);
  };

  const d = data[period];
  const isLoading = loading === period;
  const labels = PERIOD_LABELS[period];

  const metrics = d ? [
    { key: "leads",       label: "Total Lead",      cur: d.cur.totalLeads, prev: d.prev.totalLeads, delta: d.delta.leads, icon: "👥", higherIsBetter: true },
    { key: "closingRate", label: "Closing Rate",    cur: `${d.cur.closingRate.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`, prev: `${d.prev.closingRate.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`, delta: d.delta.closingRate, icon: "📈", higherIsBetter: true },
    { key: "closings",    label: "Closing",         cur: d.cur.closings, prev: d.prev.closings, delta: d.delta.closings, icon: "✅", higherIsBetter: true },
    { key: "activity",    label: "Aktivitas Jurnal",cur: d.cur.activity, prev: d.prev.activity, delta: d.delta.activity, icon: "📝", higherIsBetter: true },
    { key: "messages",    label: "Pesan Masuk",     cur: d.cur.messages, prev: d.prev.messages, delta: d.delta.messages, icon: "💬", higherIsBetter: true },
  ] : [];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Perbandingan Periode</h3>
        </div>
        <div className="flex gap-1">
          {(["day", "week", "month"] as PeriodKey[]).map((p) => (
            <button
              key={p}
              onClick={() => handleTab(p)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors border ${
                period === p
                  ? "bg-primary text-white border-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {PERIOD_LABELS[p].tab}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {isLoading && (
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
            Memuat perbandingan...
          </div>
        )}

        {!isLoading && d && (
          <>
            {/* Subtitle + tanggal range agar tidak membingungkan */}
            <div className="mb-4">
              <p className="text-sm font-semibold text-foreground">
                {labels.cur} <span className="font-normal text-muted-foreground">{labels.prev}</span>
              </p>
              {d.curRange && d.prevRange && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Periode ini: <span className="font-medium">{new Date(d.curRange.start).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – {new Date(d.curRange.end).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                  {" · "}
                  Periode lalu: <span className="font-medium">{new Date(d.prevRange.start).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – {new Date(d.prevRange.end).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                </p>
              )}
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="text-lg mb-1">{m.icon}</div>
                  <div className="text-xs text-muted-foreground mb-1">{m.label}</div>
                  <div className="text-xl font-bold mb-1">{m.cur}</div>
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">Sblm: {m.prev}</span>
                    <DeltaBadge d={m.delta} higherIsBetter={m.higherIsBetter} />
                  </div>
                </div>
              ))}
            </div>

            {/* Per-metric causes */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {metrics.map((m) => {
                const causes = d.metricCauses[m.key] ?? [];
                if (causes.length === 0) return null;
                const isUp   = m.delta.dir === "up";
                const isDown = m.delta.dir === "down";
                const showFailBreakdown =
                  m.key === "closingRate" &&
                  d.failBreakdown.length > 0 &&
                  d.cur.fails > 0;
                const dFails = d.cur.fails - d.prev.fails;
                const borderColor = isUp ? "border-green-200" : isDown ? "border-red-200" : "border-gray-200";
                const bgColor     = isUp ? "bg-green-50/60"   : isDown ? "bg-red-50/60"   : "bg-gray-50/60";
                const titleColor  = isUp ? "text-green-800"   : isDown ? "text-red-700"   : "text-gray-700";
                const dotColor    = isUp ? "text-green-600"   : isDown ? "text-red-500"   : "text-gray-400";
                const bodyColor   = isUp ? "text-green-900"   : isDown ? "text-red-900"   : "text-gray-700";
                const dirLabel    = isUp ? "Naik"             : isDown ? "Turun"          : "Sama";
                return (
                  <div key={m.key} className={`rounded-xl border ${borderColor} ${bgColor} px-4 py-3`}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm">{m.icon}</span>
                      <p className={`text-xs font-semibold ${titleColor}`}>
                        {m.label} {dirLabel} — Kenapa?
                      </p>
                    </div>
                    <ul className="space-y-1.5">
                      {causes.map((c, i) => (
                        <li key={i} className={`text-xs ${bodyColor} flex items-start gap-1.5`}>
                          <span className={`mt-0.5 shrink-0 font-bold ${dotColor}`}>•</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                    {showFailBreakdown && (
                      <FailBreakdownTable rows={d.failBreakdown} dFails={dFails} />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

type Summary = { totalLeads: number; totalEntries: number; closingCustomers: number; failCustomers: number; closingRate: number; inProgress: number };
type PicRow = { userId: string; name: string; totalEntries: number; totalLeads: number; closing: number; fail: number; rate: number };
type ActivityItem = { type: string; count: number };
type FuItem = { fuType: string; total: number; responses: { response: string; count: number }[] };
type FailItem = { reason: string; count: number };
type TtcPicRow = { userId: string; name: string; count: number; avgMinutes: number };
type TimeToClose = {
  count: number;
  avgMinutes: number | null;
  minMinutes: number | null;
  maxMinutes: number | null;
  brackets: { lessThan1Day: number; oneToThreeDays: number; threeToSevenDays: number; moreThanSevenDays: number };
  perPic: TtcPicRow[];
};

type HandlerRow = { userId: string; name: string; primaryClosing: number; secondaryClosing: number; totalClosing: number };
type UnjournalRow = { userId: string; name: string; count: number; leads: { id: string; name: string; lastActiveAt: string }[] };
type UntaggedRow = { userId: string; name: string; count: number; leads: { id: string; name: string; createdAt: string }[] };
type NoFUPlanRow = { userId: string; name: string; count: number; leads: { id: string; name: string }[] };
type FrtAgentRow = { userId: string; name: string; count: number; avgMinutes: number; minMinutes: number };
type ArtAgentRow = { userId: string; name: string; sampleCount: number; avgMinutes: number };
type ResponseTime = {
  frt: { count: number; avgMinutes: number | null; brackets: { under5: number; fiveTo30: number; thirtyTo120: number; over120: number }; perAgent: FrtAgentRow[] };
  art: { perAgent: ArtAgentRow[] };
};

type MinatItem = { tagId: string; name: string; color: string; count: number };

type Analytics = {
  period: { from: string; to: string };
  summary: Summary;
  picTable: PicRow[];
  activityBreakdown: ActivityItem[];
  fuEffectiveness: FuItem[];
  failAnalysis: FailItem[];
  totalFail: number;
  timeToClose: TimeToClose;
  handlerClosing: HandlerRow[];
  responseTime?: ResponseTime;
  unjournaled?: UnjournalRow[];
  minat?: MinatItem[];
  untaggedLeads?: UntaggedRow[];
  noFollowUpPlan?: { noAnyPlan: NoFUPlanRow[]; noLatestPlan: NoFUPlanRow[] };
};

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} mnt`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} jam`;
  const days = Math.floor(minutes / (60 * 24));
  const hrs = Math.round((minutes % (60 * 24)) / 60);
  return hrs > 0 ? `${days} hr ${hrs} jam` : `${days} hari`;
}

const TODAY = new Date().toISOString().split("T")[0];
const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 86_400_000).toISOString().split("T")[0];

function fmtLeadDate(isoStr: string): string {
  const jktOff = 7 * 60 * 60 * 1000;
  const nowJkt = new Date(Date.now() + jktOff);
  const thenJkt = new Date(new Date(isoStr).getTime() + jktOff);
  const nowDay = Date.UTC(nowJkt.getUTCFullYear(), nowJkt.getUTCMonth(), nowJkt.getUTCDate());
  const thenDay = Date.UTC(thenJkt.getUTCFullYear(), thenJkt.getUTCMonth(), thenJkt.getUTCDate());
  const diff = Math.round((nowDay - thenDay) / 86_400_000);
  if (diff === 0) return "hari ini";
  if (diff === 1) return "kemarin";
  const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${thenJkt.getUTCDate()} ${months[thenJkt.getUTCMonth()]}`;
}

// ─── Potential Closing Section ───────────────────────────────────────────────

const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR + i);

type PotentialLead = {
  id: string; name: string; externalId: string;
  packageType: { id: string; name: string } | null;
  packageVariant: { name: string } | null;
  packageMonth: number | null; packageYear: number | null;
  potentialQty1x: number | null; potentialQty3x: number | null;
  potentialQty6x: number | null; potentialQty12x: number | null;
  potentialValue: number | null;
  assignedTo: { name: string } | null;
};
type ReadyLead = { id: string; name: string; externalId: string; tags: string[]; assignedTo: { name: string } | null };
type PkgGroup  = { key: string; name: string; totalLeads: number; totalPaket: number; totalNilai: number; leads: PotentialLead[] };
type MonthGroup = { key: string; month: number; year: number; label: string; totalLeads: number; totalPaket: number; totalNilai: number; leads: PotentialLead[] };
type PotentialData = {
  summary: { totalLeads: number; totalPaket: number; totalNilai: number };
  byPackage: PkgGroup[];
  byMonth: MonthGroup[];
  packageTypes: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  readyWithoutPotential: ReadyLead[];
};

function fmtRp(v: number) {
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1)}M`;
  if (v >= 1_000_000)     return `Rp ${(v / 1_000_000).toFixed(0)} jt`;
  return `Rp ${v.toLocaleString("id-ID")}`;
}

function LeadTable({ leads }: { leads: PotentialLead[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-2 px-3 text-left font-medium">Nama Lead</th>
            <th className="py-2 px-3 text-left font-medium">Varian</th>
            <th className="py-2 px-3 text-left font-medium">Bulan</th>
            <th className="py-2 px-3 text-center font-medium">Q</th>
            <th className="py-2 px-3 text-center font-medium">T</th>
            <th className="py-2 px-3 text-center font-medium">D</th>
            <th className="py-2 px-3 text-center font-medium">I</th>
            <th className="py-2 px-3 text-right font-medium">Paket</th>
            <th className="py-2 px-3 text-right font-medium">Nilai</th>
            <th className="py-2 px-3 text-left font-medium">Agent</th>
            <th className="py-2 px-3 text-center font-medium">Inbox</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const paket = (l.potentialQty1x ?? 0) + (l.potentialQty3x ?? 0) + (l.potentialQty6x ?? 0) + (l.potentialQty12x ?? 0);
            const bulan = l.packageMonth && l.packageYear ? `${MONTHS_ID[l.packageMonth - 1].slice(0, 3)} ${l.packageYear}` : "-";
            return (
              <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-2 px-3 font-medium">{l.name ?? "-"}</td>
                <td className="py-2 px-3 text-muted-foreground">{l.packageVariant?.name ?? "-"}</td>
                <td className="py-2 px-3 text-muted-foreground">{bulan}</td>
                <td className="py-2 px-3 text-center">{l.potentialQty1x ?? 0}</td>
                <td className="py-2 px-3 text-center">{l.potentialQty3x ?? 0}</td>
                <td className="py-2 px-3 text-center">{l.potentialQty6x ?? 0}</td>
                <td className="py-2 px-3 text-center">{l.potentialQty12x ?? 0}</td>
                <td className="py-2 px-3 text-right font-medium">{paket}</td>
                <td className="py-2 px-3 text-right font-semibold text-emerald-700">{l.potentialValue ? fmtRp(l.potentialValue) : "-"}</td>
                <td className="py-2 px-3 text-muted-foreground text-xs">{l.assignedTo?.name ?? "-"}</td>
                <td className="py-2 px-3 text-center">
                  <Link href={`/inbox?customer=${l.id}`} className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary">
                    <MessageSquare className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AccordionGroup({ title, totalLeads, totalPaket, totalNilai, leads }: { title: string; totalLeads: number; totalPaket: number; totalNilai: number; leads: PotentialLead[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="font-semibold">{title}</span>
          <span className="text-xs text-muted-foreground">{totalLeads} lead</span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-muted-foreground">{totalPaket} paket</span>
          <span className="font-semibold text-emerald-700">{fmtRp(totalNilai)}</span>
        </div>
      </button>
      {open && (
        <div className="bg-background">
          <LeadTable leads={leads} />
        </div>
      )}
    </div>
  );
}

function PotentialSection({ role }: { role: string }) {
  const showAgentFilter = role !== "AGENT" && role !== "GUEST";

  const [pkgFilter, setPkgFilter]       = useState("");
  const [monthFilter, setMonthFilter]   = useState("");
  const [yearFilter, setYearFilter]     = useState("");
  const [agentFilter, setAgentFilter]   = useState("");
  const [viewMode, setViewMode]         = useState<"package" | "month">("package");
  const [data, setData]                 = useState<PotentialData | null>(null);
  const [loading, setLoading]           = useState(true);
  const [showReady, setShowReady]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (pkgFilter)   params.set("packageTypeId", pkgFilter);
    if (monthFilter) params.set("month", monthFilter);
    if (yearFilter)  params.set("year", yearFilter);
    if (agentFilter) params.set("assignedToId", agentFilter);
    const res = await fetch(`/api/analytics/potential?${params.toString()}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [pkgFilter, monthFilter, yearFilter, agentFilter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Star className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-bold">Potensi Closing</h2>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Filter:</span>
          <select
            value={pkgFilter}
            onChange={(e) => setPkgFilter(e.target.value)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm bg-background"
          >
            <option value="">Semua Paket</option>
            {data?.packageTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>{pt.name}</option>
            ))}
          </select>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm bg-background"
          >
            <option value="">Semua Bulan</option>
            {MONTHS_ID.map((m, i) => (
              <option key={i + 1} value={String(i + 1)}>{m}</option>
            ))}
          </select>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm bg-background"
          >
            <option value="">Semua Tahun</option>
            {YEARS.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
          {showAgentFilter && (
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm bg-background"
            >
              <option value="">Semua Agent</option>
              {(data?.agents ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Memuat..." : "Terapkan"}
          </button>
        </div>
      </Card>

      {loading && (
        <Card className="p-8 text-center text-muted-foreground text-sm">Memuat data potensi...</Card>
      )}

      {!loading && data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Lead Potensial</span>
              <span className="text-3xl font-bold text-primary">{data.summary.totalLeads}</span>
              <span className="text-xs text-muted-foreground">lead dengan isian potensial</span>
            </Card>
            <Card className="p-5 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Paket Potensial</span>
              <span className="text-3xl font-bold text-blue-600">{data.summary.totalPaket}</span>
              <span className="text-xs text-muted-foreground">orang (Q + T + D + I)</span>
            </Card>
            <Card className="p-5 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Nilai Potensial</span>
              <span className="text-3xl font-bold text-emerald-600">{fmtRp(data.summary.totalNilai)}</span>
              <span className="text-xs text-muted-foreground">estimasi nilai closing</span>
            </Card>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("package")}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${viewMode === "package" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              Per Paket
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${viewMode === "month" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              Per Bulan
            </button>
          </div>

          {/* Accordion groups */}
          {viewMode === "package" && (
            <div className="space-y-2">
              {data.byPackage.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground text-sm">Tidak ada data.</Card>
              ) : data.byPackage.map((g) => (
                <AccordionGroup
                  key={g.key}
                  title={g.name}
                  totalLeads={g.totalLeads}
                  totalPaket={g.totalPaket}
                  totalNilai={g.totalNilai}
                  leads={g.leads}
                />
              ))}
            </div>
          )}

          {viewMode === "month" && (
            <div className="space-y-2">
              {data.byMonth.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground text-sm">Tidak ada data.</Card>
              ) : data.byMonth.map((g) => (
                <AccordionGroup
                  key={g.key}
                  title={g.label}
                  totalLeads={g.totalLeads}
                  totalPaket={g.totalPaket}
                  totalNilai={g.totalNilai}
                  leads={g.leads}
                />
              ))}
            </div>
          )}

          {/* Ready tanpa potensial */}
          <Card className="p-4 space-y-3">
            <button
              onClick={() => setShowReady((v) => !v)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="font-semibold text-sm">Lead Ready tanpa isian potensial</span>
                <span className="rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5 font-medium">{data.readyWithoutPotential.length}</span>
              </div>
              {showReady ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showReady && (
              data.readyWithoutPotential.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">Semua lead Ready sudah terisi potensial.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="py-2 px-3 text-left font-medium">Nama Lead</th>
                        <th className="py-2 px-3 text-left font-medium">Agent</th>
                        <th className="py-2 px-3 text-center font-medium">Inbox</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.readyWithoutPotential.map((l) => (
                        <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 px-3 font-medium">{l.name ?? "-"}</td>
                          <td className="py-2 px-3 text-muted-foreground text-xs">{l.assignedTo?.name ?? "-"}</td>
                          <td className="py-2 px-3 text-center">
                            <Link href={`/inbox?customer=${l.id}`} className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary">
                              <MessageSquare className="h-4 w-4" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export function AnalyticsClient({ role }: { role: string }) {
  const [from, setFrom] = useState(THIRTY_DAYS_AGO);
  const [to, setTo] = useState(TODAY);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/crm/journal/analytics?from=${from}&to=${to}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const maxActivity = data ? Math.max(...data.activityBreakdown.map((a) => a.count), 1) : 1;
  const maxFail = data ? Math.max(...data.failAnalysis.map((f) => f.count), 1) : 1;

  return (
    <>
      <PageHeader
        title="Analitik Jurnal Sales"
        description="Closing rate, aktivitas, efektivitas follow up, dan analisa gagal"
        action={
          <Link href="/jurnal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Jurnal
          </Link>
        }
      />
      <div className="p-6 space-y-6">
        {/* Heatmap jam sibuk — tidak butuh filter periode */}
        <HeatmapChart />

        {/* Perbandingan periode — auto-load, tidak butuh filter */}
        <ComparisonWidget />

        {/* Period filter */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Periode:</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
            />
            <span className="text-muted-foreground">s/d</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
            />
            <button
              onClick={load}
              disabled={loading}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Memuat..." : "Tampilkan"}
            </button>
          </div>
        </Card>

        {data && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card className="p-5">
                <div className="flex items-center justify-between text-muted-foreground mb-2">
                  <span className="text-xs font-medium">Total Lead</span>
                  <Users className="h-4 w-4" />
                </div>
                <div className="text-3xl font-bold">{data.summary.totalLeads}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">{data.summary.totalEntries} entri jurnal</p>
              </Card>
              <Card className="p-5 border-green-200 bg-green-50/50">
                <div className="flex items-center justify-between text-muted-foreground mb-2">
                  <span className="text-xs font-medium">Closing Rate</span>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <div className="text-3xl font-bold text-green-600">{data.summary.closingRate.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                <p className="mt-0.5 text-xs text-muted-foreground">{data.summary.closingCustomers} dari {data.summary.totalLeads} lead</p>
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between text-muted-foreground mb-2">
                  <span className="text-xs font-medium">Closing</span>
                  <BarChart2 className="h-4 w-4" />
                </div>
                <div className="text-3xl font-bold">{data.summary.closingCustomers}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">pelanggan berhasil closing</p>
              </Card>
              <Card className={`p-5 ${data.summary.failCustomers > 0 ? "border-red-200 bg-red-50/50" : ""}`}>
                <div className="flex items-center justify-between text-muted-foreground mb-2">
                  <span className="text-xs font-medium">Gagal Closing</span>
                  <XCircle className={`h-4 w-4 ${data.summary.failCustomers > 0 ? "text-red-500" : ""}`} />
                </div>
                <div className={`text-3xl font-bold ${data.summary.failCustomers > 0 ? "text-red-500" : ""}`}>{data.summary.failCustomers}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">pelanggan gagal closing</p>
              </Card>
            </div>

            {/* Time to Close */}
            <Card className="p-5 border-blue-200 bg-blue-50/30">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                Waktu Closing (Time to Close)
                <span className="ml-auto text-xs font-normal text-muted-foreground">{data.timeToClose.count} lead closing</span>
              </h3>
              {data.timeToClose.count === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada lead yang closing di periode ini.</p>
              ) : (
                <div className="space-y-4">
                  {/* Stat row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-white border border-blue-100 p-3 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Rata-rata</div>
                      <div className="text-xl font-bold text-blue-600">{data.timeToClose.avgMinutes != null ? fmtDuration(data.timeToClose.avgMinutes) : "-"}</div>
                    </div>
                    <div className="rounded-xl bg-white border border-blue-100 p-3 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Tercepat</div>
                      <div className="text-xl font-bold text-green-600">{data.timeToClose.minMinutes != null ? fmtDuration(data.timeToClose.minMinutes) : "-"}</div>
                    </div>
                    <div className="rounded-xl bg-white border border-blue-100 p-3 text-center">
                      <div className="text-xs text-muted-foreground mb-1">Terlama</div>
                      <div className="text-xl font-bold text-orange-500">{data.timeToClose.maxMinutes != null ? fmtDuration(data.timeToClose.maxMinutes) : "-"}</div>
                    </div>
                  </div>

                  {/* Bracket distribution */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Distribusi waktu:</p>
                    <div className="space-y-1.5">
                      {[
                        { label: "< 1 hari", value: data.timeToClose.brackets.lessThan1Day },
                        { label: "1 – 3 hari", value: data.timeToClose.brackets.oneToThreeDays },
                        { label: "3 – 7 hari", value: data.timeToClose.brackets.threeToSevenDays },
                        { label: "> 7 hari", value: data.timeToClose.brackets.moreThanSevenDays },
                      ].map((b) => (
                        <div key={b.label} className="flex items-center gap-3">
                          <div className="w-20 shrink-0 text-xs text-muted-foreground">{b.label}</div>
                          <div className="flex-1 h-4 rounded-full bg-blue-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500/70 transition-all"
                              style={{ width: data.timeToClose.count > 0 ? `${Math.round((b.value / data.timeToClose.count) * 100)}%` : "0%" }}
                            />
                          </div>
                          <div className="w-8 text-right text-xs font-medium">{b.value}</div>
                          <div className="w-8 text-right text-xs text-muted-foreground">
                            {data.timeToClose.count > 0 ? Math.round((b.value / data.timeToClose.count) * 100) : 0}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Per-PIC */}
                  {data.timeToClose.perPic.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Per Sales (rata-rata):</p>
                      <div className="space-y-1.5">
                        {data.timeToClose.perPic.map((p) => (
                          <div key={p.userId} className="flex items-center gap-3">
                            <div className="w-32 shrink-0 text-sm truncate">{p.name}</div>
                            <div className="text-sm font-medium text-blue-600">{fmtDuration(p.avgMinutes)}</div>
                            <div className="text-xs text-muted-foreground">({p.count} lead)</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Per-PIC table */}
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-primary" />
                  Performa per Sales (PIC)
                </h3>
              </div>
              {data.picTable.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">Belum ada data.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3">Nama</th>
                        <th className="px-4 py-3 text-right">Entri</th>
                        <th className="px-4 py-3 text-right">Lead</th>
                        <th className="px-4 py-3 text-right">Closing</th>
                        <th className="px-4 py-3 text-right">Gagal</th>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3">Grafik</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.picTable.map((p) => (
                        <tr key={p.userId} className="border-b border-border last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium">{p.name}</td>
                          <td className="px-4 py-3 text-right">{p.totalEntries}</td>
                          <td className="px-4 py-3 text-right">{p.totalLeads}</td>
                          <td className="px-4 py-3 text-right text-green-600 font-medium">{p.closing}</td>
                          <td className="px-4 py-3 text-right text-red-500">{p.fail}</td>
                          <td className="px-4 py-3 text-right font-bold">{p.rate.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</td>
                          <td className="px-4 py-3 w-32">
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-green-500" style={{ width: `${p.rate}%` }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Handler Closing — kredit berdasarkan siapa yang aktif handle */}
            <Card className="overflow-hidden border-green-200">
              <div className="px-5 py-4 border-b border-border bg-green-50/40">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-green-600" />
                  Kredit Closing per Agent (Primary &amp; Secondary)
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Berdasarkan siapa yang aktif handle percakapan, bukan siapa yang nulis jurnal
                </p>
              </div>
              {!data.handlerClosing || data.handlerClosing.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">
                  Belum ada data handler — mulai aktif dari percakapan yang sudah berjalan.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3">Agent</th>
                        <th className="px-4 py-3 text-center">Primary</th>
                        <th className="px-4 py-3 text-center">Secondary</th>
                        <th className="px-4 py-3 text-center">Total Kredit</th>
                        <th className="px-4 py-3">Grafik</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.handlerClosing.map((h, i) => {
                        const maxTotal = data.handlerClosing[0]?.totalClosing ?? 1;
                        return (
                          <tr key={h.userId} className="border-b border-border last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-3 font-medium">
                              {i === 0 && <span className="mr-1.5 text-yellow-500">🏆</span>}
                              {h.name}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                {h.primaryClosing}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                {h.secondaryClosing}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-green-700">{h.totalClosing}</td>
                            <td className="px-4 py-3 w-32">
                              <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-green-500"
                                  style={{ width: `${Math.round((h.totalClosing / maxTotal) * 100)}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Response Time — FRT + ART */}
            {data.responseTime && (
              <Card className="p-5 border-violet-200 bg-violet-50/30">
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <Timer className="h-4 w-4 text-violet-600" />
                  Response Time (Waktu Balas)
                </h3>

                {/* FRT section */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                      FRT — First Response Time (bisnis)
                    </span>
                    <span className="text-xs text-muted-foreground">{data.responseTime.frt.count} percakapan</span>
                  </div>
                  {data.responseTime.frt.count === 0 ? (
                    <p className="text-sm text-muted-foreground">Belum ada data FRT di periode ini.</p>
                  ) : (
                    <div className="space-y-3">
                      {/* Overall avg */}
                      <div className="inline-flex items-center gap-2 rounded-xl bg-violet-100 px-4 py-2">
                        <span className="text-xs text-violet-700">Rata-rata keseluruhan:</span>
                        <span className="text-lg font-bold text-violet-700">
                          {data.responseTime.frt.avgMinutes != null ? fmtDuration(data.responseTime.frt.avgMinutes) : "-"}
                        </span>
                      </div>
                      {/* Brackets */}
                      <div className="space-y-1.5">
                        {[
                          { label: "< 5 mnt", value: data.responseTime.frt.brackets.under5, color: "bg-green-500" },
                          { label: "5 – 30 mnt", value: data.responseTime.frt.brackets.fiveTo30, color: "bg-yellow-400" },
                          { label: "30 mnt – 2 jam", value: data.responseTime.frt.brackets.thirtyTo120, color: "bg-orange-400" },
                          { label: "> 2 jam", value: data.responseTime.frt.brackets.over120, color: "bg-red-400" },
                        ].map((b) => (
                          <div key={b.label} className="flex items-center gap-3">
                            <div className="w-28 shrink-0 text-xs text-muted-foreground">{b.label}</div>
                            <div className="flex-1 h-3.5 rounded-full bg-violet-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${b.color}`}
                                style={{ width: data.responseTime!.frt.count > 0 ? `${Math.round((b.value / data.responseTime!.frt.count) * 100)}%` : "0%" }}
                              />
                            </div>
                            <div className="w-7 text-right text-xs font-medium">{b.value}</div>
                          </div>
                        ))}
                      </div>
                      {/* Per-agent FRT */}
                      {data.responseTime.frt.perAgent.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1.5 font-medium">Per Agent (Primary):</p>
                          <div className="space-y-1.5">
                            {data.responseTime.frt.perAgent.map((a, i) => (
                              <div key={a.userId} className="flex items-center gap-3">
                                <div className="w-28 shrink-0 text-sm truncate">
                                  {i === 0 && <span className="mr-1 text-yellow-500">🏆</span>}
                                  {a.name}
                                </div>
                                <div className="text-sm font-semibold text-violet-700">{fmtDuration(a.avgMinutes)}</div>
                                <div className="text-xs text-muted-foreground">avg · tercepat {fmtDuration(a.minMinutes)} · {a.count} conv</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <hr className="border-violet-100 mb-5" />

                {/* ART section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                      ART — Average Reply Time (per balasan)
                    </span>
                  </div>
                  {data.responseTime.art.perAgent.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Belum ada data ART di periode ini.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {data.responseTime.art.perAgent.map((a, i) => {
                        const maxAvg = data.responseTime!.art.perAgent[0]?.avgMinutes ?? 1;
                        return (
                          <div key={a.userId} className="flex items-center gap-3">
                            <div className="w-28 shrink-0 text-sm truncate">
                              {i === 0 && <span className="mr-1 text-yellow-500">🏆</span>}
                              {a.name}
                            </div>
                            <div className="flex-1 h-3.5 rounded-full bg-violet-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-violet-400 transition-all"
                                style={{ width: maxAvg > 0 ? `${Math.round((a.avgMinutes / maxAvg) * 100)}%` : "0%" }}
                              />
                            </div>
                            <div className="w-16 text-right text-sm font-semibold text-violet-700">{fmtDuration(a.avgMinutes)}</div>
                            <div className="w-16 text-right text-xs text-muted-foreground">{a.sampleCount} balasan</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Lead Belum Dijurnal */}
            {data.unjournaled && data.unjournaled.length > 0 && (
              <Card className="overflow-hidden border-red-200">
                <div className="px-5 py-4 border-b border-border bg-red-50/50">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Lead Belum Dijurnal per Agent
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Lead yang punya percakapan aktif di periode ini tapi belum ada jurnal dari agent yang handle
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {data.unjournaled.map((row) => {
                    const isExpanded = expandedAgents[row.userId] ?? false;
                    const PREVIEW = 12;
                    const visibleLeads = isExpanded ? row.leads : row.leads.slice(0, PREVIEW);
                    const hiddenCount = row.leads.length - PREVIEW;
                    return (
                      <div key={row.userId} className="px-5 py-4">
                        <div className="flex items-center gap-3 mb-2.5">
                          <span className="font-medium text-sm">{row.name}</span>
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                            {row.count} lead
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {visibleLeads.map((lead) => {
                            const dateLabel = fmtLeadDate(lead.lastActiveAt);
                            const isOld = dateLabel !== "hari ini";
                            return (
                              <a
                                key={lead.id}
                                href={`/inbox?customer=${lead.id}`}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                                  isOld
                                    ? "bg-red-50 border-red-300 text-red-800 hover:bg-red-100"
                                    : "bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100"
                                }`}
                              >
                                <span className="font-medium">{lead.name}</span>
                                <span className={`rounded px-1 py-0 text-[10px] font-semibold ${isOld ? "bg-red-200 text-red-700" : "bg-orange-200 text-orange-700"}`}>
                                  {dateLabel}
                                </span>
                              </a>
                            );
                          })}
                          {!isExpanded && hiddenCount > 0 && (
                            <button
                              onClick={() => setExpandedAgents((prev) => ({ ...prev, [row.userId]: true }))}
                              className="inline-flex items-center rounded-full border border-dashed border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors"
                            >
                              +{hiddenCount} lainnya — klik untuk lihat semua
                            </button>
                          )}
                          {isExpanded && row.leads.length > PREVIEW && (
                            <button
                              onClick={() => setExpandedAgents((prev) => ({ ...prev, [row.userId]: false }))}
                              className="inline-flex items-center rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
                            >
                              Sembunyikan
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Tanda Minat */}
            {data.minat !== undefined && (
              <Card className="p-5">
                <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  Tanda Minat Lead
                  {data.minat.length > 0 && (
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      {data.minat.reduce((s, m) => s + m.count, 0)} penandaan · {data.minat.length} jenis minat
                    </span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">Jumlah lead yang ditandai per kategori minat produk dalam periode ini</p>
                {data.minat.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada lead yang ditandai di periode ini. Tandai minat lead lewat panel Detail Pelanggan di Inbox, atau tambah jenis minat di menu Tanda Minat (Konfigurasi).</p>
                ) : (() => {
                  const maxCount = data.minat[0]?.count ?? 1;
                  return (
                    <div className="space-y-2.5">
                      {data.minat.map((m) => (
                        <div key={m.tagId} className="flex items-center gap-3">
                          <div className="w-40 shrink-0 text-sm truncate flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                            {m.name}
                          </div>
                          <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${Math.round((m.count / maxCount) * 100)}%`, backgroundColor: m.color + "90" }}
                            />
                          </div>
                          <div className="w-16 shrink-0 text-right">
                            <span className="text-sm font-semibold">{m.count}</span>
                            <span className="text-xs text-muted-foreground ml-1">lead</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </Card>
            )}

            {/* Lead Belum Ditandai Tanda Minat — semua lead aktif, per agent */}
            {data.untaggedLeads && data.untaggedLeads.length > 0 && (
              <Card className="overflow-hidden border-orange-200">
                <div className="px-5 py-4 border-b border-border bg-orange-50/50">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Tag className="h-4 w-4 text-orange-500" />
                    Lead Belum Ditandai Tanda Minat per Agent
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Semua lead aktif (belum closing) yang belum pernah diberi tanda minat produk
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {data.untaggedLeads.map((row) => {
                    const isExpanded = expandedAgents[`ut_${row.userId}`] ?? false;
                    const PREVIEW = 12;
                    const visible = isExpanded ? row.leads : row.leads.slice(0, PREVIEW);
                    const hidden = row.leads.length - PREVIEW;
                    return (
                      <div key={row.userId} className="px-5 py-4">
                        <div className="flex items-center gap-3 mb-2.5">
                          <span className="font-medium text-sm">{row.name}</span>
                          <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                            {row.count} lead
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {visible.map((lead) => (
                            <a
                              key={lead.id}
                              href={`/inbox?customer=${lead.id}`}
                              className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs text-orange-800 hover:bg-orange-100 transition-colors"
                            >
                              {lead.name}
                            </a>
                          ))}
                          {!isExpanded && hidden > 0 && (
                            <button
                              onClick={() => setExpandedAgents((p) => ({ ...p, [`ut_${row.userId}`]: true }))}
                              className="inline-flex items-center rounded-full border border-dashed border-orange-300 px-3 py-1 text-xs text-orange-600 hover:bg-orange-50 transition-colors"
                            >
                              +{hidden} lainnya
                            </button>
                          )}
                          {isExpanded && row.leads.length > PREVIEW && (
                            <button
                              onClick={() => setExpandedAgents((p) => ({ ...p, [`ut_${row.userId}`]: false }))}
                              className="inline-flex items-center rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
                            >
                              Sembunyikan
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Lead Tanpa Rencana Tindak Lanjut — semua lead aktif, per agent */}
            {data.noFollowUpPlan && (
              data.noFollowUpPlan.noAnyPlan.length > 0 || data.noFollowUpPlan.noLatestPlan.length > 0
            ) && (
              <Card className="overflow-hidden border-yellow-200">
                <div className="px-5 py-4 border-b border-border bg-yellow-50/50">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <CalendarX className="h-4 w-4 text-yellow-600" />
                    Lead Tanpa Rencana Tindak Lanjut per Agent
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Semua lead aktif (kecuali yang sudah DP / Closing / Gagal / Drop)
                  </p>
                </div>

                {/* Sub A: belum pernah ada rencana sama sekali */}
                {data.noFollowUpPlan.noAnyPlan.length > 0 && (
                  <div className="border-b border-border">
                    <div className="bg-yellow-50/30 px-5 py-2.5">
                      <span className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">
                        A — Belum pernah ada rencana tindak lanjut sama sekali
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">(tidak ada / tidak pernah isi field "Next Action" &amp; tanggal)</span>
                    </div>
                    <div className="divide-y divide-border">
                      {data.noFollowUpPlan.noAnyPlan.map((row) => {
                        const isExpanded = expandedAgents[`nap_${row.userId}`] ?? false;
                        const PREVIEW = 12;
                        const visible = isExpanded ? row.leads : row.leads.slice(0, PREVIEW);
                        const hidden = row.leads.length - PREVIEW;
                        return (
                          <div key={row.userId} className="px-5 py-4">
                            <div className="flex items-center gap-3 mb-2.5">
                              <span className="font-medium text-sm">{row.name}</span>
                              <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">
                                {row.count} lead
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {visible.map((lead) => (
                                <a
                                  key={lead.id}
                                  href={`/inbox?customer=${lead.id}`}
                                  className="inline-flex items-center rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-xs text-yellow-800 hover:bg-yellow-100 transition-colors"
                                >
                                  {lead.name}
                                </a>
                              ))}
                              {!isExpanded && hidden > 0 && (
                                <button
                                  onClick={() => setExpandedAgents((p) => ({ ...p, [`nap_${row.userId}`]: true }))}
                                  className="inline-flex items-center rounded-full border border-dashed border-yellow-300 px-3 py-1 text-xs text-yellow-600 hover:bg-yellow-50 transition-colors"
                                >
                                  +{hidden} lainnya
                                </button>
                              )}
                              {isExpanded && row.leads.length > PREVIEW && (
                                <button
                                  onClick={() => setExpandedAgents((p) => ({ ...p, [`nap_${row.userId}`]: false }))}
                                  className="inline-flex items-center rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
                                >
                                  Sembunyikan
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sub B: jurnal terakhir tidak ada rencana */}
                {data.noFollowUpPlan.noLatestPlan.length > 0 && (
                  <div>
                    <div className="bg-orange-50/30 px-5 py-2.5">
                      <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                        B — Jurnal terakhir tidak ada rencana tindak lanjut
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">(kontak terakhir tidak diikuti rencana berikutnya)</span>
                    </div>
                    <div className="divide-y divide-border">
                      {data.noFollowUpPlan.noLatestPlan.map((row) => {
                        const isExpanded = expandedAgents[`nlp_${row.userId}`] ?? false;
                        const PREVIEW = 12;
                        const visible = isExpanded ? row.leads : row.leads.slice(0, PREVIEW);
                        const hidden = row.leads.length - PREVIEW;
                        return (
                          <div key={row.userId} className="px-5 py-4">
                            <div className="flex items-center gap-3 mb-2.5">
                              <span className="font-medium text-sm">{row.name}</span>
                              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
                                {row.count} lead
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {visible.map((lead) => (
                                <a
                                  key={lead.id}
                                  href={`/inbox?customer=${lead.id}`}
                                  className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs text-orange-800 hover:bg-orange-100 transition-colors"
                                >
                                  {lead.name}
                                </a>
                              ))}
                              {!isExpanded && hidden > 0 && (
                                <button
                                  onClick={() => setExpandedAgents((p) => ({ ...p, [`nlp_${row.userId}`]: true }))}
                                  className="inline-flex items-center rounded-full border border-dashed border-orange-300 px-3 py-1 text-xs text-orange-600 hover:bg-orange-50 transition-colors"
                                >
                                  +{hidden} lainnya
                                </button>
                              )}
                              {isExpanded && row.leads.length > PREVIEW && (
                                <button
                                  onClick={() => setExpandedAgents((p) => ({ ...p, [`nlp_${row.userId}`]: false }))}
                                  className="inline-flex items-center rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
                                >
                                  Sembunyikan
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Aktivitas breakdown */}
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <Grid2x2 className="h-4 w-4 text-primary" />
                Aktivitas Sales
              </h3>
              {data.activityBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada data.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.activityBreakdown.map((a) => (
                    <div key={a.type} className="flex items-center gap-3">
                      <div className="w-36 shrink-0 text-sm truncate">{a.type}</div>
                      <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/70 transition-all"
                          style={{ width: `${Math.round((a.count / maxActivity) * 100)}%` }}
                        />
                      </div>
                      <div className="w-10 shrink-0 text-right text-sm font-medium">{a.count}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* FU Effectiveness */}
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Efektivitas Follow Up (Jenis FU × Respon)
              </h3>
              {data.fuEffectiveness.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada data follow up.</p>
              ) : (
                <div className="space-y-4">
                  {data.fuEffectiveness.map((fu) => (
                    <div key={fu.fuType}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium">{fu.fuType}</span>
                        <span className="text-xs text-muted-foreground">{fu.total} total</span>
                      </div>
                      <div className="space-y-1 pl-3 border-l-2 border-primary/20">
                        {fu.responses.map((r) => (
                          <div key={r.response} className="flex items-center gap-2">
                            <div className="flex-1 text-xs text-muted-foreground truncate">{r.response}</div>
                            <div className="w-24 h-3 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary/50"
                                style={{ width: `${Math.round((r.count / fu.total) * 100)}%` }}
                              />
                            </div>
                            <div className="w-8 text-right text-xs font-medium">{r.count}</div>
                            <div className="w-8 text-right text-xs text-muted-foreground">
                              {Math.round((r.count / fu.total) * 100)}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Fail analysis + status breakdown (point 3) */}
            <Card className="p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                Analisa Gagal Closing
                {data.totalFail > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground font-normal">{data.totalFail} total gagal</span>
                )}
              </h3>

              {/* Status breakdown — total lead dalam periode */}
              {data.summary.totalLeads > 0 && (
                <div className="mb-5">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Status lead dalam periode ini:</p>
                  {/* Stacked bar */}
                  <div className="flex h-6 w-full overflow-hidden rounded-full">
                    {data.summary.closingCustomers > 0 && (
                      <div
                        className="h-full bg-green-500 flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ width: `${Math.round((data.summary.closingCustomers / data.summary.totalLeads) * 100)}%` }}
                        title={`Closing: ${data.summary.closingCustomers}`}
                      >
                        {Math.round((data.summary.closingCustomers / data.summary.totalLeads) * 100) > 8 ? `${data.summary.closingCustomers}` : ""}
                      </div>
                    )}
                    {data.summary.failCustomers > 0 && (
                      <div
                        className="h-full bg-red-400 flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ width: `${Math.round((data.summary.failCustomers / data.summary.totalLeads) * 100)}%` }}
                        title={`Gagal: ${data.summary.failCustomers}`}
                      >
                        {Math.round((data.summary.failCustomers / data.summary.totalLeads) * 100) > 8 ? `${data.summary.failCustomers}` : ""}
                      </div>
                    )}
                    {(data.summary.inProgress ?? 0) > 0 && (
                      <div
                        className="h-full bg-blue-300 flex items-center justify-center text-[10px] font-bold text-blue-900"
                        style={{ width: `${Math.round(((data.summary.inProgress ?? 0) / data.summary.totalLeads) * 100)}%` }}
                        title={`Progres: ${data.summary.inProgress}`}
                      >
                        {Math.round(((data.summary.inProgress ?? 0) / data.summary.totalLeads) * 100) > 8 ? `${data.summary.inProgress}` : ""}
                      </div>
                    )}
                  </div>
                  {/* Legend */}
                  <div className="mt-2 flex flex-wrap gap-3">
                    {[
                      { label: "Closing", count: data.summary.closingCustomers, color: "bg-green-500", text: "text-green-700" },
                      { label: "Gagal Closing", count: data.summary.failCustomers, color: "bg-red-400", text: "text-red-600" },
                      { label: "Masih Berprogres", count: data.summary.inProgress ?? 0, color: "bg-blue-300", text: "text-blue-700" },
                    ].map((s) => (
                      <div key={s.label} className="flex items-center gap-1.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${s.color} shrink-0`} />
                        <span className="text-xs text-muted-foreground">{s.label}</span>
                        <span className={`text-xs font-semibold ${s.text}`}>{s.count}</span>
                        <span className="text-xs text-muted-foreground">
                          ({data.summary.totalLeads > 0 ? Math.round((s.count / data.summary.totalLeads) * 100) : 0}%)
                        </span>
                      </div>
                    ))}
                  </div>
                  <hr className="my-4 border-border" />
                </div>
              )}

              {/* Alasan gagal */}
              {data.failAnalysis.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada data gagal closing.</p>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Alasan gagal closing:</p>
                  {data.failAnalysis.map((f) => (
                    <div key={f.reason} className="flex items-center gap-3">
                      <div className="w-48 shrink-0 text-sm truncate">{f.reason}</div>
                      <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-400 transition-all"
                          style={{ width: `${Math.round((f.count / maxFail) * 100)}%` }}
                        />
                      </div>
                      <div className="w-10 shrink-0 text-right text-sm font-medium">{f.count}</div>
                      <div className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                        {data.totalFail > 0 ? Math.round((f.count / data.totalFail) * 100) : 0}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        {!data && !loading && (
          <Card className="p-12 text-center text-muted-foreground">Pilih periode dan tekan Tampilkan.</Card>
        )}

        <div className="border-t pt-6">
          <PotentialSection role={role} />
        </div>
      </div>
    </>
  );
}
