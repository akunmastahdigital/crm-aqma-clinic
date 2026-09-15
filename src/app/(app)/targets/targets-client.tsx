"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Pencil, X, Check, TrendingUp, Users, CalendarCheck, Activity, UserPlus, Trophy, Clock, Medal } from "lucide-react";

type Period = "day" | "week" | "month";
type TabView = "target" | "leaderboard";

type Row = {
  userId: string;
  name: string;
  role: string;
  target: {
    fu: number; closing: number; activity: number; newLead: number;
    fuDaily: number; closingDaily: number; activityDaily: number; newLeadDaily: number;
  };
  actual: {
    fu: number; closing: number; activity: number; newLead: number;
    avgResponseMinutes: number | null; responseCount: number;
  };
};

const PERIOD_LABEL: Record<Period, string> = {
  day: "Hari Ini",
  week: "Minggu Ini",
  month: "Bulan Ini",
};

function pct(actual: number, target: number) {
  if (target === 0) return 100;
  return Math.round((actual / target) * 100);
}

function ProgressBar({ actual, target }: { actual: number; target: number }) {
  const p = Math.min(pct(actual, target), 100);
  const color = p >= 100 ? "bg-emerald-500" : p >= 60 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${p >= 100 ? "text-emerald-600" : p >= 60 ? "text-amber-600" : "text-red-500"}`}>
        {actual}<span className="font-normal text-muted-foreground">/{target}</span>
      </span>
    </div>
  );
}

function StatusDot({ actual, target }: { actual: number; target: number }) {
  const p = pct(actual, target);
  if (p >= 100) return <span className="text-base">🏆</span>;
  if (p >= 60) return <span className="text-base">🟡</span>;
  return <span className="text-base">🔴</span>;
}

type EditState = {
  userId: string;
  fuDaily: number;
  closingDaily: number;
  activityDaily: number;
  newLeadDaily: number;
};

export function TargetsClient({ role }: { role: string }) {
  const [period, setPeriod] = useState<Period>("day");
  const [tabView, setTabView] = useState<TabView>("target");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = role === "OWNER" || role === "SUPERADMIN" || role === "SUPERVISOR";

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/crm/targets?period=${p}`);
      if (r.ok) setRows((await r.json()).rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(period); }, [period, load]);

  function startEdit(row: Row) {
    setEditing({
      userId: row.userId,
      fuDaily: row.target.fuDaily,
      closingDaily: row.target.closingDaily,
      activityDaily: row.target.activityDaily,
      newLeadDaily: row.target.newLeadDaily,
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    await fetch("/api/crm/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setSaving(false);
    setEditing(null);
    void load(period);
  }

  // Summary card totals
  const totals = rows.reduce(
    (acc, r) => ({
      fu: acc.fu + r.actual.fu,
      closing: acc.closing + r.actual.closing,
      activity: acc.activity + r.actual.activity,
      newLead: acc.newLead + r.actual.newLead,
      fuTgt: acc.fuTgt + r.target.fu,
      closingTgt: acc.closingTgt + r.target.closing,
      actTgt: acc.actTgt + r.target.activity,
      leadTgt: acc.leadTgt + r.target.newLead,
    }),
    { fu: 0, closing: 0, activity: 0, newLead: 0, fuTgt: 0, closingTgt: 0, actTgt: 0, leadTgt: 0 }
  );

  return (
    <>
      <PageHeader
        title="Target Tim"
        description="Pantau capaian target harian, mingguan, dan bulanan per agent"
      />

      {/* Tab switcher */}
      <div className="border-b border-border bg-white px-6">
        <div className="flex gap-1">
          {([["target", "🎯 Target"], ["leaderboard", "🏆 Leaderboard"]] as [TabView, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setTabView(v)}
              className={
                "border-b-2 px-4 py-3 text-sm font-medium transition-colors " +
                (tabView === v
                  ? "border-primary text-primary-dark"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Period selector */}
        <div className="flex items-center gap-2">
          {(["day", "week", "month"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors border " +
                (period === p
                  ? "bg-primary text-white border-primary"
                  : "border-border text-muted-foreground hover:bg-muted")
              }
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
          {loading && <span className="ml-2 text-xs text-muted-foreground animate-pulse">Memuat...</span>}
        </div>

        {tabView === "leaderboard" && <LeaderboardView rows={rows} period={period} loading={loading} />}

        {tabView === "target" && <>
        {/* Summary cards */}
        {rows.length > 1 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Lead Baru", icon: UserPlus, actual: totals.newLead, target: totals.leadTgt, color: "text-violet-600 bg-violet-50" },
              { label: "FU Selesai", icon: CalendarCheck, actual: totals.fu, target: totals.fuTgt, color: "text-blue-600 bg-blue-50" },
              { label: "Aktivitas", icon: Activity, actual: totals.activity, target: totals.actTgt, color: "text-amber-600 bg-amber-50" },
              { label: "Closing", icon: TrendingUp, actual: totals.closing, target: totals.closingTgt, color: "text-emerald-600 bg-emerald-50" },
            ].map(({ label, icon: Icon, actual, target, color }) => (
              <div key={label} className="rounded-xl border border-border bg-white p-4 shadow-sm">
                <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold tabular-nums">{actual}<span className="text-sm font-normal text-muted-foreground">/{target}</span></p>
                <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct(actual, target) >= 100 ? "bg-emerald-500" : pct(actual, target) >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                    style={{ width: `${Math.min(pct(actual, target), 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Agent</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <span className="flex items-center gap-1"><UserPlus className="h-3.5 w-3.5" /> Lead Baru</span>
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <span className="flex items-center gap-1"><CalendarCheck className="h-3.5 w-3.5" /> FU Selesai</span>
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> Aktivitas</span>
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Closing</span>
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    <Users className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    Belum ada data agent
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const isEditing = editing?.userId === row.userId;
                const allMet = ["fu", "closing", "activity", "newLead"].every(
                  (k) => pct(row.actual[k as keyof typeof row.actual], row.target[k as keyof typeof row.target]) >= 100
                );
                return (
                  <tr key={row.userId} className={`border-b border-border last:border-0 ${allMet ? "bg-emerald-50/40" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.role}</div>
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          value={editing.newLeadDaily}
                          onChange={(e) => setEditing({ ...editing, newLeadDaily: parseInt(e.target.value) || 0 })}
                          className="w-16 rounded border border-input px-2 py-1 text-sm"
                        />
                      ) : (
                        <ProgressBar actual={row.actual.newLead} target={row.target.newLead} />
                      )}
                      {isEditing && <div className="mt-0.5 text-xs text-muted-foreground">per hari</div>}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          value={editing.fuDaily}
                          onChange={(e) => setEditing({ ...editing, fuDaily: parseInt(e.target.value) || 0 })}
                          className="w-16 rounded border border-input px-2 py-1 text-sm"
                        />
                      ) : (
                        <ProgressBar actual={row.actual.fu} target={row.target.fu} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          value={editing.activityDaily}
                          onChange={(e) => setEditing({ ...editing, activityDaily: parseInt(e.target.value) || 0 })}
                          className="w-16 rounded border border-input px-2 py-1 text-sm"
                        />
                      ) : (
                        <ProgressBar actual={row.actual.activity} target={row.target.activity} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          value={editing.closingDaily}
                          onChange={(e) => setEditing({ ...editing, closingDaily: parseInt(e.target.value) || 0 })}
                          className="w-16 rounded border border-input px-2 py-1 text-sm"
                        />
                      ) : (
                        <ProgressBar actual={row.actual.closing} target={row.target.closing} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-0.5">
                        <StatusDot actual={row.actual.newLead} target={row.target.newLead} />
                        <StatusDot actual={row.actual.fu} target={row.target.fu} />
                        <StatusDot actual={row.actual.activity} target={row.target.activity} />
                        <StatusDot actual={row.actual.closing} target={row.target.closing} />
                      </div>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(row)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                            title="Edit target"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <p className="text-xs text-muted-foreground">
            💡 Target diatur dalam satuan <strong>harian</strong>. Tampilan mingguan otomatis ×5, bulanan ×22 (hari kerja).
            Klik ikon pensil untuk mengubah target per agent.
          </p>
        )}
        </>}
      </div>
    </>
  );
}

// ── Leaderboard ────────────────────────────────────────────────────────────
const PERIOD_LABEL_LB: Record<Period, string> = { day: "hari ini", week: "minggu ini", month: "bulan ini" };

function fmtMinutes(m: number | null): string {
  if (m === null) return "—";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}j ${m % 60}m`;
}

function medalEmoji(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function score(r: Row): number {
  return (r.actual.closing * 3) + (r.actual.newLead * 2) + (r.actual.fu * 1) + (r.actual.activity * 0.5);
}

function LeaderboardView({ rows, period, loading }: { rows: Row[]; period: Period; loading: boolean }) {
  const ranked = [...rows]
    .map((r) => ({ ...r, score: score(r) }))
    .sort((a, b) => b.score - a.score);

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">Memuat...</div>;

  if (ranked.length === 0) return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      <Trophy className="mx-auto mb-2 h-8 w-8 opacity-30" />
      Belum ada data agent
    </div>
  );

  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <div className="space-y-5">
      {/* Podium top 3 */}
      {top3.length > 0 && (
        <div className="flex items-end justify-center gap-4 pt-2 pb-4">
          {[top3[1], top3[0], top3[2]].filter(Boolean).map((r, i) => {
            const isFirst = r!.score === top3[0].score && top3.indexOf(r!) === 0;
            const podiumOrder = isFirst ? 1 : (i === 0 ? 2 : 3);
            const heights = { 1: "h-32", 2: "h-24", 3: "h-20" };
            const bgColors = { 1: "from-amber-400 to-amber-300", 2: "from-slate-400 to-slate-300", 3: "from-amber-700 to-amber-600" };
            const rank = ranked.indexOf(r!) + 1;
            return (
              <div key={r!.userId} className="flex flex-col items-center gap-2 w-28">
                <div className="text-2xl">{medalEmoji(rank)}</div>
                <div className="text-sm font-semibold text-center leading-tight">{r!.name}</div>
                <div className="text-xs text-muted-foreground">Skor {r!.score.toFixed(0)}</div>
                <div className={`w-full rounded-t-lg bg-gradient-to-b ${bgColors[podiumOrder as 1|2|3]} ${heights[podiumOrder as 1|2|3]}`} />
              </div>
            );
          })}
        </div>
      )}

      {/* Tabel lengkap */}
      <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center gap-2">
          <Medal className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">Ranking {PERIOD_LABEL_LB[period]}</span>
          <span className="ml-auto text-xs text-muted-foreground">Skor = Closing×3 + Lead Baru×2 + FU×1 + Aktivitas×0.5</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Rank</th>
              <th className="px-4 py-2.5 text-left font-medium">Agent</th>
              <th className="px-4 py-2.5 text-center font-medium">Lead Baru</th>
              <th className="px-4 py-2.5 text-center font-medium">FU Selesai</th>
              <th className="px-4 py-2.5 text-center font-medium">Aktivitas</th>
              <th className="px-4 py-2.5 text-center font-medium">Closing</th>
              <th className="px-4 py-2.5 text-center font-medium">
                <span className="flex items-center justify-center gap-1"><Clock className="h-3 w-3" /> Resp. Time</span>
              </th>
              <th className="px-4 py-2.5 text-center font-medium text-amber-600">Skor</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, idx) => {
              const rank = idx + 1;
              const isTop3 = rank <= 3;
              return (
                <tr
                  key={r.userId}
                  className={`border-b border-border last:border-0 ${isTop3 ? "bg-amber-50/30" : ""}`}
                >
                  <td className="px-4 py-3 font-bold text-lg">{medalEmoji(rank)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.role}</div>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">{r.actual.newLead}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{r.actual.fu}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{r.actual.activity}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-semibold text-emerald-600">{r.actual.closing}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-xs">
                    <span className={r.actual.avgResponseMinutes !== null && r.actual.avgResponseMinutes <= 5 ? "text-emerald-600 font-semibold" : r.actual.avgResponseMinutes !== null && r.actual.avgResponseMinutes <= 15 ? "text-amber-600" : "text-muted-foreground"}>
                      {fmtMinutes(r.actual.avgResponseMinutes)}
                    </span>
                    {r.actual.responseCount > 0 && (
                      <div className="text-[10px] text-muted-foreground">{r.actual.responseCount} chat</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${isTop3 ? "bg-amber-100 text-amber-700" : "bg-muted text-foreground"}`}>
                      {r.score.toFixed(0)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rest.length === 0 && ranked.length <= 3 && ranked.length > 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-2 text-center text-xs text-muted-foreground">
                  — hanya {ranked.length} agent aktif dalam periode ini —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
