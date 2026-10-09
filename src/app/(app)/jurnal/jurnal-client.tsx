"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X, CalendarClock, AlertCircle, Activity, ChevronDown, Search, Check, BarChart2 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { dateLabel, isSameDay } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────────────
type JEntry = {
  id: string;
  customerId: string;
  date: string;
  activityType: string;
  followUpType: string | null;
  followUpResponse: string | null;
  label: string | null;
  stageId: string | null;
  isClosingFail: boolean;
  cancelReason: string | null;
  notes: string | null;
  nextAction: string | null;
  scheduledAt: string | null;
  status: "PENDING" | "DONE" | "RESCHEDULE";
  createdAt: string;
  customer: { id: string; name: string | null; phone: string | null; externalId: string };
  user: { id: string; name: string };
  stage: { id: string; name: string } | null;
};
type Widgets = { fuToday: number; overdue: number; actTotal: number; actByType: Record<string, number> };
type AgentStat = { userId: string; name: string; fuToday: number; overdue: number; actToday: number };
type LabelItem = { name: string; color: string };
type JSettings = {
  journal_labels: LabelItem[];
  followup_types: string[];
  followup_responses: string[];
  cancel_reasons: string[];
  fail_closing_labels: string[];
  closing_definition: { useLabel: boolean; labels: string[]; useStage: boolean; stages: string[] };
};
type Customer = { id: string; name: string | null; phone: string | null; externalId: string };
type Stage = { id: string; name: string; color: string };
type PipelineWithStages = { id: string; name: string; stages: Stage[] };
type TeamMember = { id: string; name: string };

const ACTIVITY_TYPES = ["Lead Baru", "Follow Up", "Closing", "After Sales", "Admin"];
const STATUS_OPTS: { val: JEntry["status"]; label: string; cls: string }[] = [
  { val: "PENDING", label: "Pending", cls: "bg-amber-100 text-amber-700" },
  { val: "DONE", label: "Selesai", cls: "bg-emerald-100 text-emerald-700" },
  { val: "RESCHEDULE", label: "Reschedule", cls: "bg-blue-100 text-blue-700" },
];

function statusCls(s: JEntry["status"]) {
  return STATUS_OPTS.find(o => o.val === s)?.cls ?? "bg-muted text-muted-foreground";
}
function statusLabel(s: JEntry["status"]) {
  return STATUS_OPTS.find(o => o.val === s)?.label ?? s;
}
function isOverdue(e: JEntry) {
  return e.status === "PENDING" && e.scheduledAt && new Date(e.scheduledAt) < new Date();
}
function isDueToday(e: JEntry) {
  return e.status === "PENDING" && e.scheduledAt && isSameDay(e.scheduledAt, new Date().toISOString());
}

// ── Main Component ─────────────────────────────────────────────────────────
export function JurnalClient({ sessionUserId, sessionRole }: { sessionUserId: string; sessionRole: string }) {
  const [entries, setEntries] = useState<JEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [widgets, setWidgets] = useState<Widgets>({ fuToday: 0, overdue: 0, actTotal: 0, actByType: {} });
  const [widgetPeriode, setWidgetPeriode] = useState("today");
  const [widgetCustomFrom, setWidgetCustomFrom] = useState("");
  const [widgetCustomTo, setWidgetCustomTo] = useState("");
  const [agentBreakdown, setAgentBreakdown] = useState<AgentStat[]>([]);
  const [settings, setSettings] = useState<JSettings>({
    journal_labels: [], followup_types: [], followup_responses: [],
    cancel_reasons: [], fail_closing_labels: [], closing_definition: { useLabel: false, labels: [], useStage: false, stages: [] },
  });
  const [pipelines, setPipelines] = useState<PipelineWithStages[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);

  // Filters
  const [periode, setPeriode] = useState("30");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterActivity, setFilterActivity] = useState("");
  const [filterLabel, setFilterLabel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterQ, setFilterQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [skip, setSkip] = useState(0);
  const TAKE = 50;

  // Panel form
  const [showPanel, setShowPanel] = useState(false);
  const [editing, setEditing] = useState<JEntry | null>(null);

  // Form state
  const [fCustomerQ, setFCustomerQ] = useState("");
  const [fCustomerResults, setFCustomerResults] = useState<Customer[]>([]);
  const [fCustomer, setFCustomer] = useState<Customer | null>(null);
  const [fDate, setFDate] = useState(today());
  const [fActivity, setFActivity] = useState(ACTIVITY_TYPES[1]);
  const [fFuType, setFFuType] = useState("");
  const [fFuResp, setFFuResp] = useState("");
  const [fLabel, setFLabel] = useState("");
  const [fStage, setFStage] = useState("");
  const [fCancelReason, setFCancelReason] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fNextAction, setFNextAction] = useState("");
  const [fScheduledAt, setFScheduledAt] = useState("");
  const [fStatus, setFStatus] = useState<JEntry["status"]>("PENDING");
  const [fDpValue, setFDpValue] = useState("");
  const [saving, setSaving] = useState(false);

  const isFailLabel = (settings.fail_closing_labels ?? []).includes(fLabel);
  const isClosingLabel = !!(settings.closing_definition?.useLabel && (settings.closing_definition?.labels ?? []).includes(fLabel));

  function today() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  }

  // Hitung range tanggal untuk widget aktivitas
  function widgetRange() {
    const tz = "Asia/Jakarta";
    const d = new Date();
    const tStr = d.toLocaleDateString("en-CA", { timeZone: tz });
    if (widgetPeriode === "today") return { from: tStr, to: tStr };
    if (widgetPeriode === "yesterday") {
      const y = new Date(d); y.setDate(y.getDate() - 1);
      const s = y.toLocaleDateString("en-CA", { timeZone: tz });
      return { from: s, to: s };
    }
    const days: Record<string, number> = { "3d": 2, "7d": 6, "30d": 29 };
    if (days[widgetPeriode] !== undefined) {
      const f = new Date(d); f.setDate(f.getDate() - days[widgetPeriode]);
      return { from: f.toLocaleDateString("en-CA", { timeZone: tz }), to: tStr };
    }
    return { from: widgetCustomFrom || tStr, to: widgetCustomTo || tStr };
  }

  // Load data
  const load = useCallback(async () => {
    const sp = new URLSearchParams({ take: String(TAKE), skip: String(skip) });
    if (filterUser) sp.set("userId", filterUser);
    if (filterActivity) sp.set("activityType", filterActivity);
    if (filterLabel) sp.set("label", filterLabel);
    if (filterStatus) sp.set("status", filterStatus);
    if (debouncedQ) sp.set("q", debouncedQ);
    let from = dateFrom, to = dateTo;
    if (!from && !to && periode !== "custom") {
      const d = new Date();
      to = d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
      d.setDate(d.getDate() - parseInt(periode));
      from = d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    }
    if (from) sp.set("dateFrom", from);
    if (to) sp.set("dateTo", to);
    const wr = widgetRange();
    if (wr.from) sp.set("widgetFrom", wr.from);
    if (wr.to) sp.set("widgetTo", wr.to);
    const r = await fetch(`/api/crm/journal?${sp}`);
    if (r.ok) {
      const d = await r.json();
      setEntries(d.items);
      setTotal(d.total);
      setWidgets(d.widgets);
      setAgentBreakdown(d.agentBreakdown ?? []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, filterUser, filterActivity, filterLabel, filterStatus, debouncedQ, dateFrom, dateTo, periode, widgetPeriode, widgetCustomFrom, widgetCustomTo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/crm/settings").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.settings) setSettings(prev => ({ ...prev, ...(d.settings as JSettings) }));
    });
    fetch("/api/crm/pipelines-with-stages").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.pipelines) setPipelines(d.pipelines);
    });
    fetch("/api/team").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.members) setTeam(d.members);
    });
  }, []);

  // Auto-buka form jika ada ?openFor=customerId di URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const openForId = sp.get("openFor");
    if (!openForId) return;
    // Bersihkan param dari URL supaya refresh tidak re-trigger
    const url = new URL(window.location.href);
    url.searchParams.delete("openFor");
    window.history.replaceState({}, "", url.toString());
    // Fetch customer lalu buka form
    (async () => {
      const r = await fetch(`/api/customers/${openForId}`);
      if (!r.ok) return;
      const d = await r.json();
      const c = d.customer ?? d;
      if (!c?.id) return;
      // Reset form lalu isi customer
      setEditing(null);
      setFCustomer(c);
      setFCustomerQ(c.name ?? c.externalId);
      setFCustomerResults([]);
      setFDate(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }));
      setFActivity("Follow Up");
      setFFuType(""); setFFuResp(""); setFLabel(""); setFStage("");
      setFCancelReason(""); setFNotes(""); setFNextAction(""); setFScheduledAt(""); setFStatus("PENDING");
      // Pre-fill dari entri terakhir
      const jr = await fetch(`/api/crm/journal?customerId=${c.id}&take=1`);
      if (jr.ok) {
        const jd = await jr.json();
        const last = jd.items?.[0];
        if (last) {
          if (last.label) setFLabel(last.label);
          if (last.stageId) setFStage(last.stageId);
        }
      }
      setShowPanel(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter search debounce
  const filterQTimer = useRef<number | undefined>(undefined);
  function onFilterQChange(v: string) {
    setFilterQ(v);
    window.clearTimeout(filterQTimer.current);
    filterQTimer.current = window.setTimeout(() => {
      setDebouncedQ(v);
      setSkip(0);
    }, 400);
  }

  // Customer search
  const searchTimer = useRef<number | undefined>(undefined);
  function onCustomerSearch(q: string) {
    setFCustomerQ(q);
    window.clearTimeout(searchTimer.current);
    if (!q.trim()) { setFCustomerResults([]); return; }
    searchTimer.current = window.setTimeout(async () => {
      const r = await fetch(`/api/customers?q=${encodeURIComponent(q)}&take=10`);
      if (r.ok) { const d = await r.json(); setFCustomerResults(d.customers ?? []); }
    }, 300);
  }

  function openAdd() {
    setEditing(null);
    setFCustomer(null); setFCustomerQ(""); setFCustomerResults([]);
    setFDate(today()); setFActivity(ACTIVITY_TYPES[1]);
    setFFuType(""); setFFuResp(""); setFLabel(""); setFStage("");
    setFCancelReason(""); setFNotes(""); setFNextAction("");
    setFScheduledAt(""); setFStatus("PENDING"); setFDpValue("");
    setShowPanel(true);
  }

  function openEdit(e: JEntry) {
    setEditing(e);
    setFCustomer(e.customer);
    setFCustomerQ(e.customer.name ?? e.customer.externalId);
    setFCustomerResults([]);
    setFDate(e.date.slice(0, 10));
    setFActivity(e.activityType);
    setFFuType(e.followUpType ?? "");
    setFFuResp(e.followUpResponse ?? "");
    setFLabel(e.label ?? "");
    setFStage(e.stageId ?? "");
    setFCancelReason(e.cancelReason ?? "");
    setFNotes(e.notes ?? "");
    setFNextAction(e.nextAction ?? "");
    setFScheduledAt(e.scheduledAt ? e.scheduledAt.slice(0, 16) : "");
    setFStatus(e.status); setFDpValue("");
    setShowPanel(true);
  }

  async function markDone(e: JEntry) {
    await fetch(`/api/crm/journal/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    load();
  }

  async function deleteEntry(e: JEntry) {
    if (!confirm(`Hapus entri jurnal untuk ${e.customer.name ?? e.customer.externalId}?`)) return;
    await fetch(`/api/crm/journal/${e.id}`, { method: "DELETE" });
    load();
  }

  async function submit() {
    if (!fCustomer || !fActivity) return;
    setSaving(true);
    const rawDp = fDpValue.trim().replace(/\./g, "").replace(",", ".");
    const dpValueNum = rawDp ? parseFloat(rawDp) : null;
    const body = {
      customerId: fCustomer.id,
      date: fDate,
      activityType: fActivity,
      followUpType: fFuType || null,
      followUpResponse: fFuResp || null,
      label: fLabel || null,
      stageId: fStage || null,
      isClosingFail: isFailLabel,
      cancelReason: isFailLabel ? fCancelReason : null,
      notes: fNotes || null,
      nextAction: fNextAction || null,
      scheduledAt: fScheduledAt || null,
      status: fStatus,
      dpValue: isClosingLabel && dpValueNum ? dpValueNum : null,
    };
    if (editing) {
      await fetch(`/api/crm/journal/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/crm/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setSaving(false);
    setShowPanel(false);
    load();
  }

  const labelColor = (name: string) => (settings.journal_labels ?? []).find(l => l.name === name)?.color ?? "#94a3b8";

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        title="Jurnal Sales"
        description="Catat setiap aktivitas, follow up, dan closing"
        action={
          <Link
            href="/jurnal/analytics"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
          >
            <BarChart2 className="h-4 w-4" />
            Analitik
          </Link>
        }
      />

      <div className="p-6 space-y-5">

        {/* Widget cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              <span className="text-xs font-medium">FU Hari Ini</span>
            </div>
            <div className="mt-2 text-2xl font-bold">{widgets.fuToday}</div>
          </div>
          <div className={cn("rounded-[var(--radius-lg)] border bg-white p-4", widgets.overdue > 0 ? "border-danger/40 bg-danger/5" : "border-border")}>
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className={cn("h-4 w-4", widgets.overdue > 0 && "text-danger")} />
              <span className="text-xs font-medium">Overdue</span>
            </div>
            <div className={cn("mt-2 text-2xl font-bold", widgets.overdue > 0 && "text-danger")}>{widgets.overdue}</div>
          </div>
        </div>

        {/* Aktivitas — dengan filter tanggal dan breakdown per kategori */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Activity className="h-4 w-4" />
              <span className="text-xs font-medium">Aktivitas</span>
              <span className="text-lg font-bold text-foreground ml-1">{widgets.actTotal}</span>
            </div>
            {/* Filter periode widget */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(["today","yesterday","3d","7d","30d","custom"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setWidgetPeriode(p)}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                    widgetPeriode === p ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {p === "today" ? "Hari Ini" : p === "yesterday" ? "Kemarin" : p === "3d" ? "3 Hari" : p === "7d" ? "7 Hari" : p === "30d" ? "30 Hari" : "Custom"}
                </button>
              ))}
              {widgetPeriode === "custom" && (
                <div className="flex items-center gap-1.5">
                  <input type="date" value={widgetCustomFrom} onChange={e => setWidgetCustomFrom(e.target.value)}
                    className="h-7 rounded-md border border-input bg-white px-2 text-xs outline-none focus:border-primary" />
                  <span className="text-xs text-muted-foreground">–</span>
                  <input type="date" value={widgetCustomTo} onChange={e => setWidgetCustomTo(e.target.value)}
                    className="h-7 rounded-md border border-input bg-white px-2 text-xs outline-none focus:border-primary" />
                </div>
              )}
            </div>
          </div>
          {/* Breakdown per tipe */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { key: "Lead Baru", color: "bg-blue-50 text-blue-700 border-blue-200" },
              { key: "Follow Up", color: "bg-amber-50 text-amber-700 border-amber-200" },
              { key: "Closing",   color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
              { key: "Admin",     color: "bg-slate-50 text-slate-600 border-slate-200" },
            ].map(({ key, color }) => (
              <div key={key} className={cn("rounded-lg border p-3", color)}>
                <div className="text-xs font-medium opacity-80">{key}</div>
                <div className="mt-1 text-2xl font-bold">{widgets.actByType[key] ?? 0}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent breakdown — hanya tampil untuk non-AGENT role */}
        {sessionRole !== "AGENT" && agentBreakdown.length > 0 && (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white">
            <div className="border-b border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Breakdown per Sales
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/20 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Sales</th>
                    <th className="px-4 py-2 text-center">FU Hari Ini</th>
                    <th className="px-4 py-2 text-center">Overdue</th>
                    <th className="px-4 py-2 text-center">Aktivitas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {agentBreakdown.map(a => (
                    <tr key={a.userId} className="hover:bg-muted/10">
                      <td className="px-4 py-2 font-medium">{a.name}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={cn("inline-block min-w-[1.75rem] rounded-full px-2 py-0.5 text-xs font-semibold", a.fuToday > 0 ? "bg-amber-100 text-amber-700" : "text-muted-foreground")}>{a.fuToday}</span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={cn("inline-block min-w-[1.75rem] rounded-full px-2 py-0.5 text-xs font-semibold", a.overdue > 0 ? "bg-red-100 text-red-600" : "text-muted-foreground")}>{a.overdue}</span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={cn("inline-block min-w-[1.75rem] rounded-full px-2 py-0.5 text-xs font-semibold", a.actToday > 0 ? "bg-emerald-100 text-emerald-700" : "text-muted-foreground")}>{a.actToday}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-white p-3">
          <select value={periode} onChange={e => { setPeriode(e.target.value); setDateFrom(""); setDateTo(""); setSkip(0); }}
            className="h-8 rounded-md border border-input bg-white px-2 text-xs outline-none focus:border-primary">
            <option value="7">7 hari</option>
            <option value="30">30 hari</option>
            <option value="90">90 hari</option>
            <option value="custom">Custom</option>
          </select>
          {periode === "custom" && (
            <>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setSkip(0); }}
                className="h-8 rounded-md border border-input bg-white px-2 text-xs outline-none focus:border-primary" />
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setSkip(0); }}
                className="h-8 rounded-md border border-input bg-white px-2 text-xs outline-none focus:border-primary" />
            </>
          )}
          {sessionRole !== "AGENT" && (
            <select value={filterUser} onChange={e => { setFilterUser(e.target.value); setSkip(0); }}
              className="h-8 rounded-md border border-input bg-white px-2 text-xs outline-none focus:border-primary">
              <option value="">Semua Sales</option>
              {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <select value={filterActivity} onChange={e => { setFilterActivity(e.target.value); setSkip(0); }}
            className="h-8 rounded-md border border-input bg-white px-2 text-xs outline-none focus:border-primary">
            <option value="">Semua Aktivitas</option>
            {ACTIVITY_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filterLabel} onChange={e => { setFilterLabel(e.target.value); setSkip(0); }}
            className="h-8 rounded-md border border-input bg-white px-2 text-xs outline-none focus:border-primary">
            <option value="">Semua Label</option>
            {(settings.journal_labels ?? []).map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setSkip(0); }}
            className="h-8 rounded-md border border-input bg-white px-2 text-xs outline-none focus:border-primary">
            <option value="">Semua Status</option>
            {STATUS_OPTS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
          </select>
          <div className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-white px-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Cari nama / telepon..."
              value={filterQ}
              onChange={e => onFilterQChange(e.target.value)}
              className="w-44 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
            {filterQ && (
              <button onClick={() => { setFilterQ(""); setDebouncedQ(""); setSkip(0); }}
                className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="ml-auto">
            <button onClick={openAdd}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark">
              <Plus className="h-4 w-4" /> Tambah
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Tanggal</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Sales</th>
                  <th className="px-4 py-3 text-left">Aktivitas</th>
                  <th className="px-4 py-3 text-left">Jenis FU</th>
                  <th className="px-4 py-3 text-left">Respon FU</th>
                  <th className="px-4 py-3 text-left">Label</th>
                  <th className="px-4 py-3 text-left">Jadwal TL</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.length === 0 && (
                  <tr><td colSpan={10} className="py-10 text-center text-muted-foreground">Belum ada entri jurnal.</td></tr>
                )}
                {entries.map(e => {
                  const overdue = isOverdue(e);
                  const dueToday = isDueToday(e);
                  return (
                    <tr key={e.id} className={cn(
                      "transition-colors hover:bg-muted/20",
                      overdue ? "bg-danger/5" : dueToday ? "bg-amber-50/60" : "",
                    )}>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{dateLabel(e.date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{e.customer.name ?? e.customer.externalId}</div>
                        {e.customer.phone && <div className="text-xs text-muted-foreground">{e.customer.phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs">{e.user.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{e.activityType}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{e.followUpType ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{e.followUpResponse ?? "—"}</td>
                      <td className="px-4 py-3">
                        {e.label ? (
                          <span className="flex items-center gap-1.5 text-xs font-medium">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: labelColor(e.label) }} />
                            {e.label}
                          </span>
                        ) : "—"}
                      </td>
                      <td className={cn("whitespace-nowrap px-4 py-3 text-xs", overdue ? "font-semibold text-danger" : dueToday ? "font-semibold text-amber-600" : "text-muted-foreground")}>
                        {e.scheduledAt ? new Date(e.scheduledAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                        {overdue && " ⚠"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", statusCls(e.status))}>{statusLabel(e.status)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {e.status !== "DONE" && (
                            <button onClick={() => markDone(e)} title="Tandai Selesai"
                              className="rounded p-1 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600">
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          <button onClick={() => openEdit(e)} title="Edit"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                            <ChevronDown className="h-4 w-4 rotate-[-90deg]" />
                          </button>
                          <button onClick={() => deleteEntry(e)} title="Hapus"
                            className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {total > TAKE && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>{skip + 1}–{Math.min(skip + TAKE, total)} dari {total}</span>
              <div className="flex gap-2">
                <button onClick={() => setSkip(s => Math.max(0, s - TAKE))} disabled={skip === 0}
                  className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40">← Sebelumnya</button>
                <button onClick={() => setSkip(s => s + TAKE)} disabled={skip + TAKE >= total}
                  className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40">Berikutnya →</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Slide panel — form tambah/edit */}
      {showPanel && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowPanel(false)} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-semibold">{editing ? "Edit Entri Jurnal" : "Tambah Entri Jurnal"}</h3>
              <button onClick={() => setShowPanel(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Customer */}
              <div>
                <label className="mb-1 block text-xs font-semibold">Customer *</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={fCustomerQ}
                    onChange={e => onCustomerSearch(e.target.value)}
                    placeholder="Cari nama / nomor..."
                    className="h-9 w-full rounded-md border border-input bg-white pl-8 pr-3 text-sm outline-none focus:border-primary"
                  />
                </div>
                {fCustomerResults.length > 0 && (
                  <div className="mt-1 max-h-36 overflow-y-auto rounded-md border border-border bg-white shadow-sm">
                    {fCustomerResults.map(c => (
                      <button key={c.id} onClick={async () => {
                        setFCustomer(c); setFCustomerQ(c.name ?? c.externalId); setFCustomerResults([]);
                        // Pre-fill dari entri jurnal terakhir customer ini
                        const r = await fetch(`/api/crm/journal?customerId=${c.id}&take=1`);
                        if (r.ok) {
                          const d = await r.json();
                          const last = d.items?.[0];
                          if (last) {
                            if (last.label) setFLabel(last.label);
                            if (last.stageId) setFStage(last.stageId);
                          }
                        }
                      }}
                        className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted">
                        <span className="font-medium">{c.name ?? c.externalId}</span>
                        {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {fCustomer && <p className="mt-1 text-xs text-emerald-600 font-medium">✓ {fCustomer.name ?? fCustomer.externalId}</p>}
              </div>

              {/* Tanggal */}
              <div>
                <label className="mb-1 block text-xs font-semibold">Tanggal</label>
                <input type="date" value={fDate} onChange={e => setFDate(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary" />
              </div>

              {/* Tipe Aktivitas */}
              <div>
                <label className="mb-1 block text-xs font-semibold">Tipe Aktivitas *</label>
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_TYPES.map(a => (
                    <button key={a} onClick={() => setFActivity(a)}
                      className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        fActivity === a ? "border-primary bg-primary text-white" : "border-border bg-white hover:border-primary/50")}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Jenis FU */}
              <div>
                <label className="mb-1 block text-xs font-semibold">Jenis Follow Up</label>
                <select value={fFuType} onChange={e => setFFuType(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary">
                  <option value="">— Tidak diisi —</option>
                  {(settings.followup_types ?? []).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Respon FU */}
              <div>
                <label className="mb-1 block text-xs font-semibold">Respon Follow Up</label>
                <select value={fFuResp} onChange={e => setFFuResp(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary">
                  <option value="">— Tidak diisi —</option>
                  {(settings.followup_responses ?? []).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Label */}
              <div>
                <label className="mb-1 block text-xs font-semibold">Label</label>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setFLabel("")}
                    className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", !fLabel ? "border-primary bg-primary text-white" : "border-border bg-white hover:border-primary/50")}>
                    Tidak ada
                  </button>
                  {(settings.journal_labels ?? []).map(l => (
                    <button key={l.name} onClick={() => setFLabel(l.name)}
                      className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                        fLabel === l.name ? "border-primary bg-primary/10 text-primary-dark" : "border-border bg-white hover:border-primary/50")}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />{l.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alasan Gagal — muncul kalau label = fail label */}
              {isFailLabel && (
                <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                  <label className="mb-1 block text-xs font-semibold text-danger">Alasan Gagal Closing *</label>
                  <select value={fCancelReason} onChange={e => setFCancelReason(e.target.value)}
                    className="h-9 w-full rounded-md border border-danger/40 bg-white px-3 text-sm outline-none focus:border-danger">
                    <option value="">— Pilih alasan —</option>
                    {(settings.cancel_reasons ?? []).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}

              {/* Nilai DP — muncul kalau label = closing label */}
              {isClosingLabel && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                  <label className="mb-1 block text-xs font-semibold text-emerald-700">Nilai DP / Pembayaran (Rp)</label>
                  <input
                    type="text"
                    value={fDpValue}
                    onChange={e => setFDpValue(e.target.value)}
                    placeholder="5.000.000"
                    className="h-9 w-full rounded-md border border-emerald-300 bg-white px-3 text-sm font-mono outline-none focus:border-emerald-500"
                  />
                  <p className="mt-1 text-[10px] text-emerald-600">Isi untuk auto-kirim event Purchase ke Meta — opsional</p>
                </div>
              )}

              {/* Stage Pipeline */}
              <div>
                <label className="mb-1 block text-xs font-semibold">Stage Pipeline</label>
                <select value={fStage} onChange={e => setFStage(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary">
                  <option value="">— Tidak diisi —</option>
                  {pipelines.map(p => (
                    <optgroup key={p.id} label={p.name}>
                      {p.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Catatan */}
              <div>
                <label className="mb-1 block text-xs font-semibold">Catatan</label>
                <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={3}
                  className="w-full resize-none rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Hasil percakapan, info penting..." />
              </div>

              {/* Tindak Lanjut & Jadwal */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Tindak Lanjut</label>
                  <input value={fNextAction} onChange={e => setFNextAction(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary" placeholder="Rencana berikutnya..." />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Jadwal TL</label>
                  <input type="datetime-local" value={fScheduledAt} onChange={e => setFScheduledAt(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary" />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="mb-1 block text-xs font-semibold">Status</label>
                <div className="flex gap-2">
                  {STATUS_OPTS.map(s => (
                    <button key={s.val} onClick={() => setFStatus(s.val)}
                      className={cn("rounded-full border px-3 py-1 text-xs font-medium",
                        fStatus === s.val ? s.cls + " border-transparent" : "border-border bg-white hover:bg-muted")}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border p-4">
              <button
                onClick={submit}
                disabled={saving || !fCustomer || !fActivity || (isFailLabel && !fCancelReason)}
                className="h-10 w-full rounded-md bg-primary font-medium text-white hover:bg-primary-dark disabled:opacity-50">
                {saving ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Tambah Entri"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
