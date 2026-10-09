"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Megaphone, Send, Users, Filter, ChevronDown, ChevronUp, CheckCheck, Check, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { relativeTime } from "@/lib/format";

type Channel  = { phoneNumberId: string; label: string; wabaId: string };
type Template = { name: string; language: string; wabaId: string; category: string | null };
type Tag      = { tag: string; count: number };
type MinatTag = { id: string; name: string; color: string; count: number };
type Stage    = { id: string; name: string; order: number };
type Pipeline = { id: string; name: string; stages: Stage[] };
type Agent    = { id: string; name: string; role: string };
type Job = {
  id: string; templateName: string; total: number;
  sent: number; failed: number; status: string; createdAt: string;
};
type Recipient = {
  id: string; to: string; name: string | null; status: string;
  error: string | null; wamid: string | null; deliveryStatus: string | null;
};

function DeliveryBadge({ bcStatus, deliveryStatus }: { bcStatus: string; deliveryStatus: string | null }) {
  if (bcStatus === "failed") return <span className="flex items-center gap-1 text-red-600 text-[11px]"><AlertCircle className="h-3 w-3" /> Gagal kirim</span>;
  if (deliveryStatus === "READ") return <span className="flex items-center gap-1 text-blue-600 text-[11px]"><CheckCheck className="h-3 w-3" /> Dibaca</span>;
  if (deliveryStatus === "DELIVERED") return <span className="flex items-center gap-1 text-green-600 text-[11px]"><CheckCheck className="h-3 w-3" /> Diterima</span>;
  if (deliveryStatus === "FAILED") return <span className="flex items-center gap-1 text-red-600 text-[11px]"><AlertCircle className="h-3 w-3" /> Ditolak WA</span>;
  if (bcStatus === "sent") return <span className="flex items-center gap-1 text-muted-foreground text-[11px]"><Check className="h-3 w-3" /> Terkirim</span>;
  return <span className="text-muted-foreground text-[11px]">Menunggu</span>;
}

const LEAD_STATUS_OPTIONS = [
  { value: "",       label: "Semua status lead" },
  { value: "active", label: "Belum Closing (masih aktif)" },
  { value: "closed", label: "Sudah Closing" },
  { value: "fail",   label: "Gagal Closing" },
];

export function BroadcastClient() {
  const [channels,   setChannels]   = useState<Channel[]>([]);
  const [templates,  setTemplates]  = useState<Template[]>([]);
  const [tags,       setTags]       = useState<Tag[]>([]);
  const [minatTags,  setMinatTags]  = useState<MinatTag[]>([]);
  const [pipelines,  setPipelines]  = useState<Pipeline[]>([]);
  const [agents,     setAgents]     = useState<Agent[]>([]);
  const [totalWa,    setTotalWa]    = useState(0);
  const [jobs,       setJobs]       = useState<Job[]>([]);
  const [month,      setMonth]      = useState("");
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [recipients,  setRecipients]  = useState<Record<string, Recipient[]>>({});
  const [loadingRecip, setLoadingRecip] = useState<string | null>(null);

  // Form state
  const [channelId,     setChannelId]     = useState("");
  const [templateName,  setTemplateName]  = useState("");
  const [tag,           setTag]           = useState("");
  const [minatTagId,    setMinatTagId]    = useState("");
  const [pipelineId,    setPipelineId]    = useState("");
  const [stageId,       setStageId]       = useState("");
  const [assignedToId,  setAssignedToId]  = useState("");
  const [leadStatus,    setLeadStatus]    = useState("");

  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [countLoading,   setCountLoading]   = useState(false);
  const [confirming,     setConfirming]     = useState(false);
  const [busy,           setBusy]           = useState(false);
  const [err,            setErr]            = useState("");

  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (m?: string) => {
    const p = m ? `?month=${m}` : "";
    const r = await fetch(`/api/broadcast${p}`);
    if (r.ok) {
      const d = await r.json();
      setChannels(d.channels);
      setTemplates(d.templates);
      setTags(d.tags);
      setMinatTags(d.minatTags ?? []);
      setPipelines(d.pipelines ?? []);
      setAgents(d.agents ?? []);
      setTotalWa(d.totalWa);
      setJobs(d.jobs);
      setChannelId((prev) => prev || d.channels[0]?.phoneNumberId || "");
    }
  }, []);

  async function toggleJob(jobId: string) {
    if (expandedJob === jobId) { setExpandedJob(null); return; }
    setExpandedJob(jobId);
    if (recipients[jobId]) return;
    setLoadingRecip(jobId);
    const r = await fetch(`/api/broadcast/${jobId}`);
    if (r.ok) {
      const d = await r.json();
      setRecipients((prev) => ({ ...prev, [jobId]: d.recipients }));
    }
    setLoadingRecip(null);
  }

  useEffect(() => {
    load(month);
    const t = setInterval(() => load(month), 5000);
    return () => clearInterval(t);
  }, [load, month]);

  // Fetch jumlah penerima setiap kali filter berubah (debounced 400ms)
  useEffect(() => {
    if (countTimer.current) clearTimeout(countTimer.current);
    setRecipientCount(null); // reset dulu agar tidak tampilkan angka lama
    countTimer.current = setTimeout(async () => {
      setCountLoading(true);
      const p = new URLSearchParams();
      if (tag)          p.set("tag",          tag);
      if (minatTagId)   p.set("minatTagId",   minatTagId);
      if (pipelineId)   p.set("pipelineId",   pipelineId);
      if (stageId)      p.set("stageId",      stageId);
      if (assignedToId) p.set("assignedToId", assignedToId);
      if (leadStatus)   p.set("leadStatus",   leadStatus);
      const r = await fetch(`/api/broadcast/count?${p.toString()}`);
      if (r.ok) {
        const d = await r.json();
        setRecipientCount(d.count);
      }
      setCountLoading(false);
    }, 400);
    return () => { if (countTimer.current) clearTimeout(countTimer.current); };
  }, [tag, minatTagId, pipelineId, stageId, assignedToId, leadStatus]);

  const channel      = channels.find((c) => c.phoneNumberId === channelId);
  const tmplList     = templates.filter((t) => !channel || t.wabaId === channel.wabaId);
  const selectedTmpl = tmplList.find((t) => t.name === templateName);
  const stageList    = pipelines.find((p) => p.id === pipelineId)?.stages ?? [];

  // Hitung apakah ada filter aktif
  const hasFilter = !!(tag || minatTagId || pipelineId || stageId || assignedToId || leadStatus);
  // Saat ada filter: pakai recipientCount (null = sedang loading). Tanpa filter: totalWa langsung.
  const displayCount = hasFilter ? (recipientCount ?? 0) : totalWa;

  function resetFilters() {
    setTag(""); setMinatTagId(""); setPipelineId(""); setStageId("");
    setAssignedToId(""); setLeadStatus("");
  }

  async function send() {
    if (!channelId || !templateName) return;
    setBusy(true);
    setErr("");
    const r = await fetch("/api/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelAccountId: channelId,
        templateName,
        templateLang: selectedTmpl?.language ?? "id",
        tag:          tag          || undefined,
        minatTagId:   minatTagId   || undefined,
        pipelineId:   pipelineId   || undefined,
        stageId:      stageId      || undefined,
        assignedToId: assignedToId || undefined,
        leadStatus:   leadStatus   || undefined,
      }),
    });
    setBusy(false);
    setConfirming(false);
    if (r.ok) { setTemplateName(""); resetFilters(); load(); }
    else setErr((await r.json()).error ?? "Gagal kirim");
  }

  return (
    <>
      <PageHeader title="Broadcast" description="Kirim template ke banyak pelanggan sekaligus" />
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">

        {/* ── Form ── */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-white p-5">
          <div className="mb-4 flex items-center gap-2 font-semibold">
            <Megaphone className="h-4 w-4 text-primary" /> Buat Broadcast
          </div>

          <div className="space-y-4">
            {/* Channel */}
            <div>
              <label className="text-xs font-medium">Kirim dari nomor</label>
              <select
                value={channelId}
                onChange={(e) => { setChannelId(e.target.value); setTemplateName(""); }}
                className="mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary"
              >
                {channels.map((c) => <option key={c.phoneNumberId} value={c.phoneNumberId}>{c.label}</option>)}
              </select>
            </div>

            {/* Template */}
            <div>
              <label className="text-xs font-medium">Template ({tmplList.length})</label>
              <select
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">— pilih template —</option>
                {tmplList.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            </div>

            {/* ── Filter Penerima ── */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Filter className="h-3.5 w-3.5 text-primary" />
                  Filter Penerima
                </div>
                {hasFilter && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Reset semua filter
                  </button>
                )}
              </div>

              {/* Tanda Minat */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tanda Minat</label>
                <select
                  value={minatTagId}
                  onChange={(e) => setMinatTagId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary"
                >
                  <option value="">Semua tanda minat</option>
                  <option value="__none__">— Belum ditandai (tanpa tanda minat)</option>
                  {minatTags.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.count} lead)
                    </option>
                  ))}
                </select>
              </div>

              {/* Pipeline & Stage */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Pipeline</label>
                  <select
                    value={pipelineId}
                    onChange={(e) => { setPipelineId(e.target.value); setStageId(""); }}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary"
                  >
                    <option value="">Semua pipeline</option>
                    {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Stage</label>
                  <select
                    value={stageId}
                    onChange={(e) => setStageId(e.target.value)}
                    disabled={!pipelineId}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary disabled:opacity-50"
                  >
                    <option value="">Semua stage</option>
                    {stageList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Status Lead */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status Lead</label>
                <select
                  value={leadStatus}
                  onChange={(e) => setLeadStatus(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary"
                >
                  {LEAD_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Agent PIC */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Agent PIC</label>
                <select
                  value={assignedToId}
                  onChange={(e) => setAssignedToId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary"
                >
                  <option value="">Semua agent</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              {/* Tag lama */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tag Customer</label>
                <select
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary"
                >
                  <option value="">Semua tag</option>
                  {tags.map((t) => <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>)}
                </select>
              </div>
            </div>

            {/* Preview jumlah penerima */}
            <div className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm ${
              displayCount === 0 ? "bg-red-50 text-red-700" : "bg-primary/5 text-primary-dark"
            }`}>
              <Users className="h-4 w-4 shrink-0" />
              {countLoading ? (
                <span className="animate-pulse">Menghitung penerima...</span>
              ) : (
                <span>
                  Akan dikirim ke <b>{displayCount.toLocaleString("id-ID")}</b> nomor WhatsApp
                  {hasFilter && <span className="ml-1 text-xs opacity-70">(dari total {totalWa.toLocaleString("id-ID")} nomor)</span>}
                </span>
              )}
            </div>

            {err && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                disabled={!templateName || displayCount === 0 || countLoading}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> Kirim Broadcast
              </button>
            ) : (
              <div className="space-y-2">
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
                  Yakin kirim ke <b>{displayCount.toLocaleString("id-ID")}</b> nomor?
                  <br />
                  <span className="text-xs">Template: <b>{templateName}</b></span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(false)} className="h-10 flex-1 rounded-md border border-border text-sm font-medium hover:bg-muted">Batal</button>
                  <button onClick={send} disabled={busy} className="h-10 flex-1 rounded-md bg-primary text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
                    {busy ? "Mengirim..." : "Ya, kirim sekarang"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Riwayat ── */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="font-semibold">Riwayat & Progres</span>
            <input
              type="month"
              value={month}
              onChange={(e) => { setMonth(e.target.value); setExpandedJob(null); setRecipients({}); }}
              className="h-8 rounded-md border border-input px-2 text-xs outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {jobs.length === 0 && <div className="text-sm text-muted-foreground">Belum ada broadcast{month ? ` di bulan ini` : ""}.</div>}
            {jobs.map((j) => {
              const pct = j.total ? Math.round(((j.sent + j.failed) / j.total) * 100) : 0;
              const isOpen = expandedJob === j.id;
              const rcps = recipients[j.id] ?? [];
              return (
                <div key={j.id} className="rounded-[var(--radius-md)] border border-border">
                  {/* Header baris */}
                  <button
                    type="button"
                    onClick={() => toggleJob(j.id)}
                    className="w-full p-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{j.templateName}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={"rounded-full px-2 py-0.5 text-[11px] font-medium " + (
                          j.status === "done"   ? "bg-green-100 text-green-700" :
                          j.status === "failed" ? "bg-red-100 text-red-600" :
                                                  "bg-amber-100 text-amber-700"
                        )}>
                          {j.status === "done" ? "Selesai" : j.status === "failed" ? "Gagal" : "Berjalan"}
                        </span>
                        {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>{j.sent} terkirim · {j.failed} gagal · dari {j.total}</span>
                      <span>{relativeTime(j.createdAt)}</span>
                    </div>
                  </button>

                  {/* Dropdown penerima */}
                  {isOpen && (
                    <div className="border-t border-border px-3 pb-3">
                      {loadingRecip === j.id ? (
                        <div className="py-3 text-center text-xs text-muted-foreground animate-pulse">Memuat penerima...</div>
                      ) : rcps.length === 0 ? (
                        <div className="py-3 text-center text-xs text-muted-foreground">Belum ada data penerima.</div>
                      ) : (
                        <div className="mt-2 divide-y divide-border text-xs max-h-60 overflow-y-auto">
                          <div className="grid grid-cols-[1fr_auto] gap-2 pb-1 font-medium text-muted-foreground">
                            <span>Lead</span><span>Status</span>
                          </div>
                          {rcps.map((r) => (
                            <div key={r.id} className="grid grid-cols-[1fr_auto] gap-2 py-1.5 items-center">
                              <div className="min-w-0">
                                <div className="truncate font-medium">{r.name || r.to}</div>
                                {r.name && <div className="text-muted-foreground">{r.to}</div>}
                                {r.error && <div className="text-red-500 text-[10px] mt-0.5 truncate">{r.error}</div>}
                              </div>
                              <DeliveryBadge bcStatus={r.status} deliveryStatus={r.deliveryStatus} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </>
  );
}
