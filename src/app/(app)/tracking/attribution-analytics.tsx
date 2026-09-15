"use client";

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, Users, Zap, ShoppingCart, BarChart2, RefreshCw } from "lucide-react";

type SummaryData = { clicks: number; matched: number; leads: number; purchases: number; revenue: number };
type Row = { key: string; label: string; clicks: number; matched: number; leads: number; purchases: number; revenue: number };
type TrendPoint = { date: string; clicks: number; matched: number; leads: number };

function pct(n: number, d: number) { return d === 0 ? "0%" : (n / d * 100).toFixed(1) + "%"; }
function fmt(n: number) { return n.toLocaleString("id-ID"); }
function fmtRp(n: number) {
  if (n >= 1_000_000) return "Rp " + (n / 1_000_000).toFixed(1) + "jt";
  if (n >= 1_000) return "Rp " + (n / 1_000).toFixed(0) + "rb";
  return "Rp " + n.toFixed(0);
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: w + "%" }} />
    </div>
  );
}

function SparkLine({ trend, field, color }: { trend: TrendPoint[]; field: "clicks" | "matched" | "leads"; color: string }) {
  const vals = trend.map(t => t[field]);
  const max = Math.max(...vals, 1);
  const w = 80, h = 28, n = vals.length;
  if (n < 2) return null;
  const pts = vals.map((v, i) => `${Math.round(i / (n - 1) * w)},${Math.round((1 - v / max) * h)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AttributionAnalytics() {
  const [days, setDays] = useState(30);
  const [groupBy, setGroupBy] = useState<"campaign" | "adset" | "ad">("campaign");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/tracking/analytics?days=${days}&groupBy=${groupBy}`)
      .then(r => r.json())
      .then(d => { setSummary(d.summary); setRows(d.rows ?? []); setTrend(d.trend ?? []); })
      .finally(() => setLoading(false));
  }, [days, groupBy]);

  useEffect(() => { load(); }, [load]);

  const maxClicks = Math.max(...rows.map(r => r.clicks), 1);

  const statCards = summary ? [
    { label: "Total Klik LP", value: fmt(summary.clicks), sub: "landing page visit", icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-50", spark: "clicks" as const, sparkColor: "#3b82f6" },
    { label: "Terkoneksi WA", value: fmt(summary.matched), sub: pct(summary.matched, summary.clicks) + " dari klik", icon: Users, color: "text-violet-600", bg: "bg-violet-50", spark: "matched" as const, sparkColor: "#7c3aed" },
    { label: "Lead (CAPI)", value: fmt(summary.leads), sub: pct(summary.leads, summary.clicks) + " dari klik", icon: Zap, color: "text-amber-600", bg: "bg-amber-50", spark: "leads" as const, sparkColor: "#d97706" },
    { label: "Purchase (CAPI)", value: fmt(summary.purchases), sub: summary.revenue > 0 ? fmtRp(summary.revenue) : "Rp 0", icon: ShoppingCart, color: "text-emerald-600", bg: "bg-emerald-50", spark: null, sparkColor: "" },
  ] : [];

  const groupLabels: Record<string, string> = { campaign: "Campaign", adset: "Ad Set", ad: "Ad Creative" };

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground font-medium">Periode:</span>
        {[7, 14, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`h-7 px-3 rounded-full text-xs font-medium transition-colors ${days === d ? "bg-primary text-white" : "border hover:bg-muted"}`}
          >{d}h</button>
        ))}
        <span className="ml-4 text-sm text-muted-foreground font-medium">Kelompokkan:</span>
        {(["campaign", "adset", "ad"] as const).map(g => (
          <button key={g} onClick={() => setGroupBy(g)}
            className={`h-7 px-3 rounded-full text-xs font-medium transition-colors ${groupBy === g ? "bg-primary text-white" : "border hover:bg-muted"}`}
          >{groupLabels[g]}</button>
        ))}
        <button onClick={load} className="ml-auto h-7 w-7 flex items-center justify-center rounded-full border hover:bg-muted" title="Refresh">
          <RefreshCw size={13} className={loading ? "animate-spin text-primary" : "text-muted-foreground"} />
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statCards.map(c => (
            <div key={c.label} className="rounded-xl border bg-white p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center justify-center rounded-lg ${c.bg} ${c.color} p-1.5`}>
                  <c.icon size={15} />
                </span>
                {c.spark && <SparkLine trend={trend} field={c.spark} color={c.sparkColor} />}
              </div>
              <div>
                <div className="text-xl font-bold tracking-tight">{c.value}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="text-xs text-muted-foreground/70 mt-0.5">{c.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Funnel Table */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <BarChart2 size={15} className="text-primary" />
          <span className="font-semibold text-sm">Funnel per {groupLabels[groupBy]}</span>
          <span className="ml-auto text-xs text-muted-foreground">{rows.length} baris</span>
        </div>
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Memuat data...</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Belum ada data klik dari Meta Ads. Pastikan script tracking sudah terpasang di landing page.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground w-64">{groupLabels[groupBy]}</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Klik</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">WA %</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Lead</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Lead %</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Purchase</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className={`border-b last:border-0 hover:bg-muted/20 ${i === 0 ? "bg-primary/3" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground truncate max-w-56" title={r.label}>{r.label}</div>
                      <MiniBar value={r.clicks} max={maxClicks} color="bg-blue-400" />
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{fmt(r.clicks)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-medium ${parseFloat(pct(r.matched, r.clicks)) >= 30 ? "text-green-600" : "text-muted-foreground"}`}>
                        {pct(r.matched, r.clicks)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{fmt(r.leads)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-medium ${parseFloat(pct(r.leads, r.clicks)) >= 10 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {pct(r.leads, r.clicks)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{fmt(r.purchases)}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700">
                      {r.revenue > 0 ? fmtRp(r.revenue) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 1 && summary && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td className="px-4 py-2.5 text-xs">TOTAL</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(summary.clicks)}</td>
                    <td className="px-3 py-2.5 text-right">{pct(summary.matched, summary.clicks)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(summary.leads)}</td>
                    <td className="px-3 py-2.5 text-right">{pct(summary.leads, summary.clicks)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(summary.purchases)}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-700">{summary.revenue > 0 ? fmtRp(summary.revenue) : "—"}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
