"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X, MessageSquare, CheckCircle2, Loader2, CalendarDays, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

const DAYS   = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

type FollowUp = {
  id: string;
  scheduledAt: string;
  note: string | null;
  status: "PENDING" | "DONE";
  customer: { id: string; name: string | null; externalId: string };
  assignedTo: { name: string } | null;
};

type Agent = { id: string; name: string };

// Tanggal hari ini dalam WIB (yyyy-mm-dd)
function todayWib(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 3600_000);
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2,"0")}-${String(wib.getUTCDate()).padStart(2,"0")}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const wib = new Date(d.getTime() + 7 * 3600_000);
  return `${String(wib.getUTCHours()).padStart(2,"0")}:${String(wib.getUTCMinutes()).padStart(2,"0")}`;
}

function fmtDateLong(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Warna dot per status & overdue
function dotColor(fu: FollowUp, dateStr: string, today: string): string {
  if (fu.status === "DONE")    return "bg-gray-300";
  if (dateStr < today)         return "bg-red-500";   // overdue
  if (dateStr === today)       return "bg-amber-400";
  return "bg-emerald-500";
}

function StatusBadge({ status, scheduledAt, today }: { status: string; scheduledAt: string; today: string }) {
  const dateStr = scheduledAt.slice(0, 10);
  if (status === "DONE") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
      <CheckCircle2 className="h-3 w-3" /> Selesai
    </span>
  );
  if (dateStr < today) return (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Terlewat</span>
  );
  if (dateStr === today) return (
    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Hari ini</span>
  );
  return (
    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Pending</span>
  );
}

export function KalenderClient({ role }: { role: string }) {
  const showAgentFilter = role !== "AGENT" && role !== "GUEST";
  const today = todayWib();
  const [y, m] = today.split("-").map(Number);

  const [year, setYear]           = useState(y);
  const [month, setMonth]         = useState(m);
  const [grouped, setGrouped]     = useState<Record<string, FollowUp[]>>({});
  const [agents, setAgents]       = useState<Agent[]>([]);
  const [agentFilter, setAgentFilter] = useState("");
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<string | null>(null); // dateStr
  const [doneLoading, setDoneLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month: String(month), year: String(year) });
    if (agentFilter) params.set("assignedToId", agentFilter);
    const res = await fetch(`/api/followups/calendar?${params}`);
    if (res.ok) {
      const d = await res.json();
      setGrouped(d.grouped ?? {});
      if (d.agents?.length) setAgents(d.agents);
    }
    setLoading(false);
  }, [month, year, agentFilter]);

  useEffect(() => { void load(); }, [load]);

  async function markDone(fuId: string) {
    setDoneLoading(fuId);
    await fetch(`/api/followups/${fuId}/done`, { method: "POST" });
    await load();
    setDoneLoading(null);
  }

  // Navigasi bulan
  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelected(null);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelected(null);
  }

  // Bangun grid kalender
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = i - firstDay + 1;
    cells.push(d >= 1 && d <= daysInMonth ? d : null);
  }

  const selectedFus = selected ? (grouped[selected] ?? []) : [];
  const totalMonth  = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);
  const pendingMonth = Object.values(grouped).flat().filter(f => f.status === "PENDING").length;

  return (
    <>
      <PageHeader
        title="Kalender Follow Up"
        description="Jadwal follow up dalam tampilan kalender bulanan"
        action={
          <Link href="/followup" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Follow Up
          </Link>
        }
      />

      <div className="p-6 space-y-5">
        {/* Summary + filter */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <span className="font-semibold text-foreground">{totalMonth}</span>
              <span className="text-muted-foreground"> total bulan ini · </span>
              <span className="font-semibold text-amber-600">{pendingMonth}</span>
              <span className="text-muted-foreground"> pending</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Terlewat
              <span className="h-2 w-2 rounded-full bg-amber-400" /> Hari ini
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Upcoming
              <span className="h-2 w-2 rounded-full bg-gray-300" /> Selesai
            </div>
          </div>
          {showAgentFilter && (
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm bg-background"
            >
              <option value="">Semua Agent</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </div>

        {/* Kalender card */}
        <div className="rounded-2xl border border-border bg-background shadow-sm overflow-hidden">
          {/* Header navigasi bulan */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <button
              onClick={prevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="font-bold text-lg">{MONTHS[month - 1]}</p>
              <p className="text-sm text-muted-foreground">{year}</p>
            </div>
            <button
              onClick={nextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Header hari */}
          <div className="grid grid-cols-7 border-b border-border">
            {DAYS.map((d, i) => (
              <div key={d} className={cn(
                "py-2 text-center text-xs font-semibold text-muted-foreground",
                i === 0 && "text-red-500",
              )}>
                {d}
              </div>
            ))}
          </div>

          {/* Grid tanggal */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                if (!day) return (
                  <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-border bg-muted/20 last:border-r-0" />
                );

                const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const fus     = grouped[dateStr] ?? [];
                const isToday = dateStr === today;
                const isPast  = dateStr < today;
                const isSelected = selected === dateStr;
                const hasPending = fus.some(f => f.status === "PENDING");
                const dayOfWeek  = i % 7;

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelected(isSelected ? null : dateStr)}
                    className={cn(
                      "min-h-[80px] border-b border-r border-border p-1.5 text-left transition-colors last:border-r-0",
                      "hover:bg-primary/5",
                      isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/30",
                      isPast && !isToday && "bg-muted/10",
                    )}
                  >
                    {/* Nomor tanggal */}
                    <div className={cn(
                      "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      isToday && "bg-primary text-primary-foreground",
                      !isToday && dayOfWeek === 0 && "text-red-500",
                      !isToday && isPast && "text-muted-foreground",
                    )}>
                      {day}
                    </div>

                    {/* Dots follow-up */}
                    {fus.length > 0 && (
                      <div className="flex flex-col gap-0.5">
                        {fus.slice(0, 3).map((fu) => (
                          <div key={fu.id} className="flex items-center gap-1">
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColor(fu, dateStr, today))} />
                            <span className="truncate text-[10px] text-muted-foreground leading-tight">
                              {fu.customer.name ?? fu.customer.externalId}
                            </span>
                          </div>
                        ))}
                        {fus.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">+{fus.length - 3} lainnya</span>
                        )}
                      </div>
                    )}

                    {/* Badge count jika ada pending */}
                    {hasPending && (
                      <div className={cn(
                        "mt-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white",
                        fus.some(f => f.status === "PENDING" && dateStr < today) ? "bg-red-500"
                        : isToday ? "bg-amber-400"
                        : "bg-emerald-500",
                      )}>
                        {fus.filter(f => f.status === "PENDING").length}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Popup per tanggal */}
      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSelected(null)} />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-background shadow-xl">
            {/* Header popup */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Follow Up</p>
                  <p className="font-semibold">{fmtDateLong(selected)}</p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body popup */}
            <div className="flex-1 overflow-y-auto p-4">
              {selectedFus.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                  <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Tidak ada follow up di tanggal ini.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedFus.map((fu) => (
                    <div
                      key={fu.id}
                      className={cn(
                        "rounded-xl border p-3 space-y-2",
                        fu.status === "DONE" ? "border-border bg-muted/20 opacity-70" : "border-border bg-background",
                      )}
                    >
                      {/* Lead & status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {fu.customer.name ?? fu.customer.externalId}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {fmtTime(fu.scheduledAt)} WIB
                            {fu.assignedTo ? ` · ${fu.assignedTo.name}` : ""}
                          </p>
                        </div>
                        <StatusBadge status={fu.status} scheduledAt={fu.scheduledAt} today={today} />
                      </div>

                      {/* Catatan */}
                      {fu.note && (
                        <p className="text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                          {fu.note}
                        </p>
                      )}

                      {/* Aksi */}
                      <div className="flex items-center gap-2 pt-1">
                        <Link
                          href={`/inbox?customer=${fu.customer.id}`}
                          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Buka Inbox
                        </Link>
                        {fu.status === "PENDING" && (
                          <button
                            onClick={() => markDone(fu.id)}
                            disabled={doneLoading === fu.id}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                          >
                            {doneLoading === fu.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <CheckCircle2 className="h-3.5 w-3.5" />
                            }
                            Tandai Selesai
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
