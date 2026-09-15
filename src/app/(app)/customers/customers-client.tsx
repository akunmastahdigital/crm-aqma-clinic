"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X, SlidersHorizontal, Users, MessageSquare, BookOpen, Plus, Send, Loader2, Brain } from "lucide-react";
import Link from "next/link";
import { CHANNEL_META } from "@/lib/channel-meta";
import { relativeTime, windowState } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AudienceProfilePanel } from "@/components/audience-profile-panel";

type Customer = {
  id: string; name: string | null; phone: string | null; externalId: string;
  channel: string; tags: string[]; createdAt: string; closedAt: string | null;
  windowExpiresAt: string | null; assignedTo: { name: string } | null;
};

type JournalNote = { id: string; date: string; notes: string | null; activityType: string; user: { name: string } };

type FilterOptions = {
  labels: { name: string; color: string }[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  agents: { id: string; name: string }[];
  channels: string[];
};

const PAGE_SIZE = 50;

export function CustomersClient({ options }: { options: FilterOptions }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const [showFilter, setShowFilter] = useState(false);

  // Profile panel
  type PanelTarget = { customerId: string; name: string };
  const [profileTarget, setProfileTarget] = useState<PanelTarget | null>(null);

  // Notes panel
  type NotesTarget = { customerId: string; name: string };
  const [notesTarget, setNotesTarget] = useState<NotesTarget | null>(null);
  const [notesData, setNotesData] = useState<{ note: string | null; journalNotes: JournalNote[] } | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [quickNote, setQuickNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  async function openNotes(customerId: string, name: string) {
    setNotesTarget({ customerId, name });
    setNotesData(null);
    setQuickNote("");
    setNotesLoading(true);
    const r = await fetch(`/api/customers/${customerId}`);
    if (r.ok) {
      const d = await r.json();
      setNotesData({ note: d.customer?.note ?? null, journalNotes: d.journalNotes ?? [] });
    }
    setNotesLoading(false);
  }

  async function saveQuickNote() {
    if (!quickNote.trim() || !notesTarget) return;
    setSavingNote(true);
    await fetch("/api/crm/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: notesTarget.customerId,
        date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }),
        activityType: "Admin",
        notes: quickNote.trim(),
        status: "DONE",
      }),
    });
    setQuickNote("");
    setSavingNote(false);
    // Reload notes
    const r = await fetch(`/api/customers/${notesTarget.customerId}`);
    if (r.ok) {
      const d = await r.json();
      setNotesData({ note: d.customer?.note ?? null, journalNotes: d.journalNotes ?? [] });
    }
  }

  // filter state
  const [q, setQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [channel, setChannel] = useState("");
  const [tag, setTag] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [leadStatus, setLeadStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const activeFilterCount = [channel, tag, pipelineId, stageId, assignedToId, leadStatus, dateFrom, dateTo]
    .filter(Boolean).length;

  function resetFilters() {
    setChannel(""); setTag(""); setPipelineId(""); setStageId("");
    setAssignedToId(""); setLeadStatus(""); setDateFrom(""); setDateTo("");
    setSkip(0);
  }

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearchQ(q); setSkip(0); }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    sp.set("take", String(PAGE_SIZE));
    sp.set("skip", String(skip));
    if (searchQ) sp.set("q", searchQ);
    if (channel) sp.set("channel", channel);
    if (tag) sp.set("tag", tag);
    if (stageId) sp.set("stageId", stageId);
    else if (pipelineId) sp.set("pipelineId", pipelineId);
    if (assignedToId) sp.set("assignedToId", assignedToId);
    if (leadStatus) sp.set("leadStatus", leadStatus);
    if (dateFrom) sp.set("dateFrom", dateFrom);
    if (dateTo) sp.set("dateTo", dateTo);
    const r = await fetch(`/api/customers?${sp}`);
    if (r.ok) {
      const d = await r.json();
      setCustomers(d.customers ?? []);
      setTotal(d.total ?? 0);
    }
    setLoading(false);
  }, [searchQ, channel, tag, pipelineId, stageId, assignedToId, leadStatus, dateFrom, dateTo, skip]);

  useEffect(() => { load(); }, [load]);

  const selectedPipeline = options.pipelines.find((p) => p.id === pipelineId);

  return (
    <div>
      {/* Search + filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama / nomor..."
            className="h-9 w-full rounded-md border border-input bg-white pl-9 pr-8 text-sm outline-none focus:border-primary"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilter((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            showFilter || activeFilterCount > 0
              ? "bg-primary text-white"
              : "border border-input bg-white text-foreground hover:bg-muted",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filter
          {activeFilterCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-primary">
              {activeFilterCount}
            </span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button onClick={resetFilters} className="text-sm text-muted-foreground underline hover:text-danger">
            Reset
          </button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {loading ? "Memuat..." : `${total.toLocaleString("id-ID")} pelanggan`}
        </span>
      </div>

      {/* Filter panel */}
      {showFilter && (
        <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {/* Channel */}
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Channel</div>
              <select
                value={channel}
                onChange={(e) => { setChannel(e.target.value); setSkip(0); }}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Semua channel</option>
                {options.channels.map((ch) => (
                  <option key={ch} value={ch}>{(CHANNEL_META as Record<string, { label: string }>)[ch]?.label ?? ch}</option>
                ))}
              </select>
            </div>

            {/* Label */}
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Label</div>
              <select
                value={tag}
                onChange={(e) => { setTag(e.target.value); setSkip(0); }}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Semua label</option>
                {options.labels.map((l) => (
                  <option key={l.name} value={l.name}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Pipeline */}
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pipeline</div>
              <select
                value={pipelineId}
                onChange={(e) => { setPipelineId(e.target.value); setStageId(""); setSkip(0); }}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Semua pipeline</option>
                {options.pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Stage — hanya tampil jika pipeline dipilih */}
            {pipelineId && selectedPipeline && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Stage</div>
                <select
                  value={stageId}
                  onChange={(e) => { setStageId(e.target.value); setSkip(0); }}
                  className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Semua stage</option>
                  {selectedPipeline.stages.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Agent PIC */}
            {options.agents.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Agent PIC</div>
                <select
                  value={assignedToId}
                  onChange={(e) => { setAssignedToId(e.target.value); setSkip(0); }}
                  className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Semua agent</option>
                  <option value="__none__">— Belum ditugaskan</option>
                  {options.agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Status Lead */}
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status Lead</div>
              <select
                value={leadStatus}
                onChange={(e) => { setLeadStatus(e.target.value); setSkip(0); }}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Semua status</option>
                <option value="active">Belum Closing</option>
                <option value="closed">Sudah Closing</option>
              </select>
            </div>

            {/* Tanggal Masuk */}
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tanggal Masuk — Dari</div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setSkip(0); }}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tanggal Masuk — Sampai</div>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setSkip(0); }}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {activeFilterCount > 0 && !showFilter && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {channel && (
            <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-dark">
              {(CHANNEL_META as Record<string, { label: string }>)[channel]?.label ?? channel}
              <button onClick={() => setChannel("")}><X className="h-3 w-3" /></button>
            </span>
          )}
          {tag && (
            <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-dark">
              Label: {tag}
              <button onClick={() => setTag("")}><X className="h-3 w-3" /></button>
            </span>
          )}
          {stageId && (
            <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-dark">
              Stage: {options.pipelines.flatMap((p) => p.stages).find((s) => s.id === stageId)?.name}
              <button onClick={() => { setStageId(""); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {!stageId && pipelineId && (
            <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-dark">
              Pipeline: {options.pipelines.find((p) => p.id === pipelineId)?.name}
              <button onClick={() => { setPipelineId(""); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {assignedToId === "__none__" && (
            <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-dark">
              Belum ditugaskan
              <button onClick={() => setAssignedToId("")}><X className="h-3 w-3" /></button>
            </span>
          )}
          {assignedToId && assignedToId !== "__none__" && (
            <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-dark">
              Agent: {options.agents.find((a) => a.id === assignedToId)?.name}
              <button onClick={() => setAssignedToId("")}><X className="h-3 w-3" /></button>
            </span>
          )}
          {leadStatus && (
            <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-dark">
              {leadStatus === "active" ? "Belum Closing" : "Sudah Closing"}
              <button onClick={() => setLeadStatus("")}><X className="h-3 w-3" /></button>
            </span>
          )}
          {dateFrom && (
            <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-dark">
              Dari: {dateFrom}
              <button onClick={() => setDateFrom("")}><X className="h-3 w-3" /></button>
            </span>
          )}
          {dateTo && (
            <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-dark">
              s/d: {dateTo}
              <button onClick={() => setDateTo("")}><X className="h-3 w-3" /></button>
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Pelanggan</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Window 24 jam</th>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Ditugaskan</th>
                <th className="px-4 py-3 font-medium">Tanggal Masuk</th>
                <th className="px-4 py-3 font-medium">Terakhir Kontak</th>
                <th className="px-4 py-3 font-medium text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Memuat...</td>
                </tr>
              )}
              {!loading && customers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <Users className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    Tidak ada pelanggan yang sesuai filter.
                  </td>
                </tr>
              )}
              {!loading && customers.map((c) => {
                const ch = (CHANNEL_META as Record<string, { label: string; color: string }>)[c.channel];
                const win = windowState(c.windowExpiresAt);
                return (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${c.id}`} className="group flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-dark">
                          {(c.name ?? c.externalId).charAt(0).toUpperCase()}
                        </div>
                        <div className="leading-tight">
                          <div className="font-medium group-hover:text-primary transition-colors">
                            {c.name ?? "Tanpa nama"}
                          </div>
                          <div className="text-xs text-muted-foreground">{c.phone ?? c.externalId}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {ch ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: ch.color + "1a", color: ch.color }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ch.color }} />
                          {ch.label}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">{c.channel}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        win.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
                      )}>
                        {win.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.length === 0
                          ? <span className="text-xs text-muted-foreground">-</span>
                          : c.tags.map((t) => (
                            <span key={t} className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-dark">{t}</span>
                          ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.assignedTo?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(c.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{relativeTime((c as unknown as { lastContactAt?: string }).lastContactAt ?? c.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <Link
                          href={`/inbox?customer=${c.id}`}
                          title="Buka di Inbox"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary-soft hover:text-primary transition-colors"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => openNotes(c.id, c.name ?? c.externalId)}
                          title="Lihat Catatan"
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                            notesTarget?.customerId === c.id
                              ? "bg-primary text-white"
                              : "text-muted-foreground hover:bg-primary-soft hover:text-primary",
                          )}
                        >
                          <BookOpen className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setProfileTarget({ customerId: c.id, name: c.name ?? c.externalId })}
                          title="Profiling Audience"
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                            profileTarget?.customerId === c.id
                              ? "bg-primary text-white"
                              : "text-muted-foreground hover:bg-primary-soft hover:text-primary",
                          )}
                        >
                          <Brain className="h-4 w-4" />
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
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-sm text-muted-foreground">
              {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total.toLocaleString("id-ID")}
            </span>
            <div className="flex gap-2">
              <button
                disabled={skip === 0}
                onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
                className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
              >
                ← Sebelumnya
              </button>
              <button
                disabled={skip + PAGE_SIZE >= total}
                onClick={() => setSkip((s) => s + PAGE_SIZE)}
                className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notes side panel */}
      {notesTarget && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-background shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Catatan</p>
              <p className="truncate font-semibold">{notesTarget.name}</p>
            </div>
            <button
              onClick={() => { setNotesTarget(null); setNotesData(null); }}
              className="ml-2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {notesLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : notesData ? (
              <>
                {notesData.note && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Catatan Internal</p>
                    <p className="text-sm whitespace-pre-wrap">{notesData.note}</p>
                  </div>
                )}

                {/* Journal timeline */}
                {notesData.journalNotes.length === 0 && !notesData.note ? (
                  <p className="text-center text-sm text-muted-foreground py-4">Belum ada catatan</p>
                ) : notesData.journalNotes.length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(
                      notesData.journalNotes.reduce<Record<string, JournalNote[]>>((acc, n) => {
                        const d = new Date(n.date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
                        (acc[d] = acc[d] ?? []).push(n);
                        return acc;
                      }, {}),
                    ).map(([dateLabel, notes]) => (
                      <div key={dateLabel}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{dateLabel}</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                        <div className="space-y-2">
                          {notes.map((n) => (
                            <div key={n.id} className="rounded-md bg-muted/40 px-3 py-2">
                              <p className="text-sm whitespace-pre-wrap">{n.notes}</p>
                              <p className="text-xs text-muted-foreground mt-1">{n.user.name}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-4">Gagal memuat catatan</p>
            )}
          </div>

          {/* Quick add note */}
          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <textarea
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveQuickNote(); }}
                placeholder="Tulis catatan… (Ctrl+Enter kirim)"
                rows={2}
                className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={saveQuickNote}
                disabled={savingNote || !quickNote.trim()}
                className="flex h-9 w-9 items-center justify-center self-end rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {profileTarget && (
        <AudienceProfilePanel
          customerId={profileTarget.customerId}
          customerName={profileTarget.name}
          onClose={() => setProfileTarget(null)}
        />
      )}
    </div>
  );
}
