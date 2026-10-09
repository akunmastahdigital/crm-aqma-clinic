"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Tag as TagIcon, KanbanSquare, Trash2, BookOpen, Sparkles, Lightbulb, Copy, Check, Loader2, Plus, Send, Brain, Merge } from "lucide-react";
import { cn } from "@/lib/utils";
import { AudienceProfilePanel } from "@/components/audience-profile-panel";

type Customer = {
  id: string; name: string | null; phone: string | null; externalId: string; channel: string;
  tags: string[]; note: string | null; score: number; assignedToId: string | null;
};
type Deal = { id: string; title: string; value: number | null; pipelineId: string; stageId: string; stage: { name: string; color: string | null } };
type Pipeline = { id: string; name: string; stages: { id: string; name: string }[] };
type User = { id: string; name: string };
type CrmLabel = { name: string; color: string };
type JournalNote = { id: string; date: string; notes: string | null; activityType: string; user: { name: string } };
type LeadTag = { id: string; name: string; color: string };
type PackagePrice = { sessionPack: string; price: number };
type PackageVariant = { id: string; name: string; prices: PackagePrice[] };
type PackageType = { id: string; name: string; variants: PackageVariant[] };

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear + 1, currentYear + 2];

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return raw;
  if (d.startsWith("62") && d.length >= 10) {
    const local = d.slice(2);
    const parts: string[] = [];
    if (local.length >= 3) parts.push(local.slice(0, 3));
    if (local.length >= 7) parts.push(local.slice(3, 7));
    if (local.length >= 7) parts.push(local.slice(7));
    return "+62 " + parts.join("-");
  }
  return d.length >= 8 ? "+" + d : d;
}

function displayCustomer(c: { name: string | null; phone: string | null; externalId: string; channel?: string }): string {
  if (c.name) return c.name;
  if (c.channel === "INSTAGRAM") return `@${c.externalId}`;
  if (c.channel === "MESSENGER") return `FB:${c.externalId.slice(-6)}`;
  if (c.phone) return formatPhone(c.phone);
  return formatPhone(c.externalId);
}

function formatRpFull(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function fmtJournalDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00+07:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

export function CustomerPanel({
  customerId, conversationId, aiPaused, onUpdated, onClose,
}: {
  customerId: string; conversationId: string; aiPaused?: boolean; onUpdated: () => void; onClose: () => void;
}) {
  type ConvAgent = { role: string; agent: { id: string; name: string; avatarUrl: string | null } };
  const [c, setC] = useState<Customer | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestErr, setSuggestErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function getSuggestion() {
    setSuggesting(true);
    setSuggestion(null);
    setSuggestErr(null);
    try {
      const r = await fetch(`/api/inbox/conversations/${conversationId}/suggest`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) { setSuggestErr(d.error ?? "Gagal mendapat saran."); }
      else { setSuggestion(d.suggestion ?? ""); }
    } catch { setSuggestErr("Koneksi gagal."); }
    setSuggesting(false);
  }

  async function copySuggestion() {
    if (!suggestion) return;
    await navigator.clipboard.writeText(suggestion);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [crmLabels, setCrmLabels] = useState<CrmLabel[]>([]);
  const [convAgents, setConvAgents] = useState<ConvAgent[]>([]);
  const [journalNotes, setJournalNotes] = useState<JournalNote[]>([]);
  const [allLeadTags, setAllLeadTags] = useState<LeadTag[]>([]);
  const [activeTagIds, setActiveTagIds] = useState<string[]>([]);
  const [tagBusy, setTagBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [showDeal, setShowDeal] = useState(false);
  const [sessionRole, setSessionRole] = useState<string>("AGENT");
  const [pendingStage, setPendingStage] = useState<{
    dealId: string; toStageId: string; toStageName: string;
  } | null>(null);
  const [stageNote, setStageNote] = useState("");
  const [stageSaving, setStageSaving] = useState(false);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [quickNote, setQuickNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Duplikat otomatis terdeteksi
  const [autoDuplicates, setAutoDuplicates] = useState<{ id: string; name: string | null; phone: string | null; externalId: string; channel: string; tags: string[] }[]>([]);

  // Merge lead
  const [showMerge, setShowMerge] = useState(false);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeResults, setMergeResults] = useState<{ id: string; name: string | null; phone: string | null; externalId: string; channel: string; tags: string[] }[]>([]);
  const [mergeSearching, setMergeSearching] = useState(false);
  const [merging, setMerging] = useState(false);
  const mergeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!showMerge || !mergeQuery.trim()) { setMergeResults([]); return; }
    if (mergeTimer.current) clearTimeout(mergeTimer.current);
    mergeTimer.current = setTimeout(async () => {
      setMergeSearching(true);
      const r = await fetch(`/api/customers?q=${encodeURIComponent(mergeQuery)}&limit=8`).catch(() => null);
      const d = r?.ok ? await r.json() : null;
      setMergeResults((d?.customers ?? []).filter((x: { id: string }) => x.id !== customerId));
      setMergeSearching(false);
    }, 400);
  }, [mergeQuery, showMerge, customerId]);

  async function doMerge(secondaryId: string, secondaryName: string | null) {
    if (!confirm(`Gabungkan "${secondaryName ?? secondaryId}" ke lead ini?\n\nSemua percakapan, jurnal, dan history akan dipindah. Lead duplikat akan dihapus. Tindakan ini tidak bisa dibatalkan.`)) return;
    setMerging(true);
    const r = await fetch("/api/customers/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryId: customerId, secondaryId }),
    });
    setMerging(false);
    if (r.ok) {
      setShowMerge(false);
      setMergeQuery("");
      setAutoDuplicates([]);
      load();
      onUpdated();
    } else {
      const d = await r.json();
      alert(d.error ?? "Gagal menggabungkan lead");
    }
  }

  // Paket & potensi
  const [packageTypes, setPackageTypes] = useState<PackageType[]>([]);
  const [pkgTypeId, setPkgTypeId] = useState("");
  const [pkgVariantId, setPkgVariantId] = useState("");
  const [pkgMonth, setPkgMonth] = useState("");
  const [pkgYear, setPkgYear] = useState("");
  const [pkgQty1x, setPkgQty1x] = useState("");
  const [pkgQty3x, setPkgQty3x] = useState("");
  const [pkgQty6x, setPkgQty6x] = useState("");
  const [pkgQty12x, setPkgQty12x] = useState("");
  const [savingPkg, setSavingPkg] = useState(false);

  // Kosongkan jumlah per ukuran paket saat jenis/varian paket diganti,
  // supaya nilai potensi tidak terbawa dari pilihan sebelumnya.
  const resetPkgQty = useCallback(() => {
    setPkgQty1x("");
    setPkgQty3x("");
    setPkgQty6x("");
    setPkgQty12x("");
  }, []);

  const load = useCallback(async () => {
    const r = await fetch(`/api/customers/${customerId}`);
    if (r.ok) {
      const d = await r.json();
      setC(d.customer); setDeals(d.deals); setPipelines(d.pipelines); setUsers(d.users);
      setName(d.customer.name ?? ""); setNote(d.customer.note ?? "");
      setJournalNotes(d.journalNotes ?? []);
      setActiveTagIds(d.activeTagIds ?? []);
      setPkgTypeId(d.customer.packageTypeId ?? "");
      setPkgVariantId(d.customer.packageVariantId ?? "");
      setPkgMonth(d.customer.packageMonth ? String(d.customer.packageMonth) : "");
      setPkgYear(d.customer.packageYear ? String(d.customer.packageYear) : "");
      setPkgQty1x(d.customer.potentialQty1x != null ? String(d.customer.potentialQty1x) : "");
      setPkgQty3x(d.customer.potentialQty3x != null ? String(d.customer.potentialQty3x) : "");
      setPkgQty6x(d.customer.potentialQty6x != null ? String(d.customer.potentialQty6x) : "");
      setPkgQty12x(d.customer.potentialQty12x != null ? String(d.customer.potentialQty12x) : "");
    }
    const ra = await fetch(`/api/inbox/conversations/${conversationId}/agents`).catch(() => null);
    if (ra?.ok) { const da = await ra.json(); setConvAgents(da.agents ?? []); }
    // Deteksi duplikat otomatis by nama di channel berbeda
    const rd = await fetch(`/api/customers/duplicates?id=${customerId}`).catch(() => null);
    if (rd?.ok) { const dd = await rd.json(); setAutoDuplicates(dd.duplicates ?? []); }
  }, [customerId, conversationId]);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.role) setSessionRole(d.role);
    });
    fetch("/api/crm/settings").then(r => r.json()).then(d => {
      setCrmLabels(d.settings?.journal_labels ?? []);
    }).catch(() => {});
    fetch("/api/lead-tags").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.tags) setAllLeadTags(d.tags);
    }).catch(() => {});
    fetch("/api/package-types").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.packageTypes) setPackageTypes(d.packageTypes);
    }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/customers/${customerId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, conversationId }),
    });
    load(); onUpdated();
  }

  function addLabel(label: string) {
    if (!label || !c || c.tags.includes(label)) return;
    patch({ tags: [...c.tags, label] });
  }

  function removeTag(t: string) {
    if (!c) return;
    patch({ tags: c.tags.filter((x) => x !== t) });
  }

  function changeStage(dealId: string, stageId: string) {
    const pipe = pipelines.find(p => p.stages.some(s => s.id === stageId));
    const stageName = pipe?.stages.find(s => s.id === stageId)?.name ?? stageId;
    setPendingStage({ dealId, toStageId: stageId, toStageName: stageName });
    setStageNote("");
  }

  async function execChangeStage(dealId: string, toStageId: string, note: string) {
    await fetch(`/api/crm/deals/${dealId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStageId }),
    });
    if (note.trim() && c) {
      await fetch("/api/crm/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: c.id,
          date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }),
          activityType: "Admin",
          stageId: toStageId,
          notes: note.trim(),
          status: "DONE",
        }),
      });
    }
    load(); onUpdated();
  }

  async function toggleLeadTag(tagId: string) {
    if (tagBusy) return;
    setTagBusy(tagId);
    const isActive = activeTagIds.includes(tagId);
    if (isActive) {
      await fetch("/api/lead-tags/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId, customerId }),
      });
      setActiveTagIds((prev) => prev.filter((id) => id !== tagId));
    } else {
      await fetch("/api/lead-tags/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId, customerId }),
      });
      setActiveTagIds((prev) => [...prev, tagId]);
    }
    setTagBusy(null);
  }

  async function saveQuickNote() {
    if (!quickNote.trim() || !c) return;
    setSavingNote(true);
    await fetch("/api/crm/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: c.id,
        date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }),
        activityType: "Admin",
        notes: quickNote.trim(),
        status: "DONE",
      }),
    });
    setQuickNote("");
    setShowQuickNote(false);
    setSavingNote(false);
    load();
  }

  async function savePaket() {
    setSavingPkg(true);
    const selectedVariant = packageTypes.find((p) => p.id === pkgTypeId)?.variants.find((v) => v.id === pkgVariantId);
    const getPrice = (rt: string) => selectedVariant?.prices.find((p) => p.sessionPack === rt)?.price ?? 0;
    const n = (v: string) => (v !== "" ? Number(v) : 0);
    const calculatedValue =
      n(pkgQty1x) * getPrice("1x") +
      n(pkgQty3x) * getPrice("3x") +
      n(pkgQty6x) * getPrice("6x") +
      n(pkgQty12x) * getPrice("12x");

    await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageTypeId: pkgTypeId || null,
        packageVariantId: pkgVariantId || null,
        packageMonth: pkgMonth ? Number(pkgMonth) : null,
        packageYear: pkgYear ? Number(pkgYear) : null,
        potentialQty1x: pkgQty1x !== "" ? Number(pkgQty1x) : null,
        potentialQty3x: pkgQty3x !== "" ? Number(pkgQty3x) : null,
        potentialQty6x: pkgQty6x !== "" ? Number(pkgQty6x) : null,
        potentialQty12x: pkgQty12x !== "" ? Number(pkgQty12x) : null,
        potentialValue: calculatedValue > 0 ? calculatedValue : null,
        conversationId,
      }),
    });
    setSavingPkg(false);
    load();
  }

  async function deleteDeal(dealId: string) {
    if (!confirm("Hapus dari pipeline ini?")) return;
    await fetch(`/api/crm/deals/${dealId}`, { method: "DELETE" });
    load(); onUpdated();
  }

  if (!c) return <div className="w-80 shrink-0 border-l border-border bg-white p-4 text-sm text-muted-foreground">Memuat...</div>;

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-semibold">Detail Pelanggan</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowProfile(true)}
            title="Profiling Audience"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <Brain className="h-3.5 w-3.5" />
            Profiling Audience
          </button>
          <button
            onClick={() => { setShowMerge(true); setMergeQuery(""); setMergeResults([]); }}
            title="Gabungkan Lead Duplikat"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 transition-colors"
          >
            <Merge className="h-3.5 w-3.5" />
            Gabung
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-1"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Nama & nomor */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-base font-semibold text-primary-dark">
            {displayCustomer(c).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== (c.name ?? "") && patch({ name })}
              placeholder="Nama pelanggan"
              className="w-full rounded-md border border-transparent px-1 py-0.5 text-sm font-medium hover:border-input focus:border-primary focus:outline-none"
            />
            <div className="px-1 text-xs text-muted-foreground">{c.phone ?? c.externalId}</div>
          </div>
        </div>

        {/* Banner duplikat otomatis */}
        {autoDuplicates.length > 0 && autoDuplicates.map(dup => (
          <div key={dup.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-xs font-medium text-amber-700 mb-1">⚠️ Mungkin lead yang sama</div>
            <div className="text-xs text-amber-800">
              <span className="font-medium">{dup.name}</span>
              <span className="text-amber-600"> · {dup.channel.replace("WA_CLOUD","WA Cloud").replace("WA_QR","WA QR Biasa")} · {dup.phone ?? dup.externalId}</span>
            </div>
            {dup.tags.length > 0 && <div className="text-xs text-amber-600 mt-0.5">Label: {dup.tags.join(", ")}</div>}
            <button
              disabled={merging}
              onClick={() => doMerge(dup.id, dup.name)}
              className="mt-2 w-full rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {merging ? "Menggabungkan..." : "Gabungkan sekarang (1 klik)"}
            </button>
          </div>
        ))}

        {/* Penanggung jawab */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Ditugaskan ke</label>
          <select
            value={c.assignedToId ?? ""}
            onChange={(e) => patch({ assignedToId: e.target.value || null })}
            className="mt-1 h-9 w-full rounded-md border border-input px-2 text-sm outline-none focus:border-primary"
          >
            <option value="">— belum ditugaskan —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        {/* Agent yang menangani */}
        {convAgents.length > 0 && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Agent yang Menangani</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {convAgents.map((ca) => (
                <span
                  key={ca.agent.id}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    ca.role === "PRIMARY"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  {ca.agent.name}
                  <span className="opacity-50">{ca.role === "PRIMARY" ? "· Primary" : "· Secondary"}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tags / Label */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><TagIcon className="h-3 w-3" /> Label</label>
          <div className="mt-1 flex flex-wrap gap-1">
            {c.tags.map((t) => {
              const lbl = crmLabels.find(l => l.name === t);
              return (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={lbl
                    ? { backgroundColor: lbl.color + "30", color: lbl.color, border: `1px solid ${lbl.color}60` }
                    : { backgroundColor: "var(--color-primary-soft)", color: "var(--color-primary-dark)" }}
                >
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:opacity-70"><X className="h-2.5 w-2.5" /></button>
                </span>
              );
            })}
            {c.tags.length === 0 && <span className="text-xs text-muted-foreground">Belum ada label</span>}
          </div>
          {crmLabels.filter(l => !c.tags.includes(l.name)).length > 0 && (
            <select
              value=""
              onChange={(e) => addLabel(e.target.value)}
              className="mt-1.5 h-8 w-full rounded-md border border-input px-2 text-xs outline-none focus:border-primary"
            >
              <option value="">+ Tambah label...</option>
              {crmLabels.filter(l => !c.tags.includes(l.name)).map(l => (
                <option key={l.name} value={l.name}>{l.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Pipeline */}
        <div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><KanbanSquare className="h-3 w-3" /> Pipeline</label>
            <button onClick={() => setShowDeal(true)} className="text-xs font-medium text-primary-dark hover:underline">+ Tambah</button>
          </div>
          <div className="mt-1 space-y-1">
            {deals.length === 0 && <span className="text-xs text-muted-foreground">Belum ada pipeline</span>}
            {deals.map((d) => {
              const pipe = pipelines.find((p) => p.id === d.pipelineId);
              return (
                <div key={d.id} className="rounded-md border border-border p-2">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    {pipe && <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{pipe.name}</span>}
                    <button onClick={() => deleteDeal(d.id)} title="Hapus" className="shrink-0 text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <select
                    value={d.stageId}
                    onChange={(e) => changeStage(d.id, e.target.value)}
                    className="h-8 w-full rounded-md border px-2 text-xs font-medium outline-none focus:border-primary"
                    style={{ borderColor: (d.stage.color ?? "#6b7280") + "80", color: d.stage.color ?? "#374151" }}
                  >
                    {(pipe?.stages ?? [{ id: d.stageId, name: d.stage.name }]).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tanda Minat */}
        {allLeadTags.length > 0 && (
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3 w-3" /> Tanda Minat
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {allLeadTags.map((tag) => {
                const active = activeTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    disabled={tagBusy === tag.id}
                    onClick={() => toggleLeadTag(tag.id)}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-50"
                    style={active
                      ? { backgroundColor: tag.color + "25", color: tag.color, border: `1.5px solid ${tag.color}` }
                      : { backgroundColor: "transparent", color: "var(--color-muted-foreground)", border: "1.5px dashed var(--color-border)" }
                    }
                  >
                    {active && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />}
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Catatan */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Catatan</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (c.note ?? "") && patch({ note })}
            rows={3}
            placeholder="Catatan internal soal pelanggan..."
            className="mt-1 w-full rounded-md border border-input px-2 py-1.5 text-sm outline-none focus:border-primary"
          />

          {/* Catatan dari Jurnal — timeline per tanggal */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <BookOpen className="h-3 w-3" />
                Catatan Lead
              </div>
              {!showQuickNote && (
                <button
                  onClick={() => setShowQuickNote(true)}
                  className="flex items-center gap-1 text-xs font-medium text-primary-dark hover:underline"
                >
                  <Plus className="h-3 w-3" /> Tambah
                </button>
              )}
            </div>

            {showQuickNote && (
              <div className="mb-3 rounded-md border border-primary/30 bg-primary-soft/20 p-2">
                <textarea
                  value={quickNote}
                  onChange={(e) => setQuickNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveQuickNote(); }}
                  rows={3}
                  placeholder="Tulis catatan..."
                  autoFocus
                  className="w-full resize-none rounded-md border border-input bg-white px-2 py-1.5 text-xs outline-none focus:border-primary"
                />
                <div className="mt-1.5 flex justify-end gap-1.5">
                  <button
                    onClick={() => { setShowQuickNote(false); setQuickNote(""); }}
                    className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    Batal
                  </button>
                  <button
                    onClick={saveQuickNote}
                    disabled={savingNote || !quickNote.trim()}
                    className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                  >
                    {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    Simpan
                  </button>
                </div>
              </div>
            )}

            {journalNotes.length === 0 && !showQuickNote && (
              <p className="text-xs text-muted-foreground">Belum ada catatan.</p>
            )}

            {(() => {
              const grouped = journalNotes.reduce<Record<string, JournalNote[]>>((acc, jn) => {
                (acc[jn.date] ??= []).push(jn);
                return acc;
              }, {});
              return Object.entries(grouped).map(([date, notes]) => (
                <div key={date} className="mb-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">{fmtJournalDate(date)}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-1.5">
                    {notes.map((jn) => (
                      <div key={jn.id} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                        <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{jn.notes}</p>
                        <div className="mt-1 text-[10px] text-muted-foreground">{jn.activityType} · {jn.user.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Paket & Potensi Closing */}
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Paket &amp; Potensi Closing
          </div>
          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
            {/* Jenis Paket */}
            <div>
              <label className="mb-0.5 block text-xs text-muted-foreground">Jenis Paket</label>
              <select value={pkgTypeId} onChange={(e) => { setPkgTypeId(e.target.value); setPkgVariantId(""); resetPkgQty(); }}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                <option value="">— Pilih paket —</option>
                {packageTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Varian — muncul setelah pilih jenis paket */}
            {pkgTypeId && (() => {
              const variants = packageTypes.find((p) => p.id === pkgTypeId)?.variants ?? [];
              return variants.length > 0 ? (
                <div>
                  <label className="mb-0.5 block text-xs text-muted-foreground">Varian</label>
                  <select value={pkgVariantId} onChange={(e) => { setPkgVariantId(e.target.value); resetPkgQty(); }}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                    <option value="">— Pilih varian —</option>
                    {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              ) : <p className="text-xs text-muted-foreground">Belum ada varian — atur di menu Paket.</p>;
            })()}

            {/* Bulan & Tahun */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 block text-xs text-muted-foreground">Bulan</label>
                <select value={pkgMonth} onChange={(e) => setPkgMonth(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-muted-foreground">Tahun</label>
                <select value={pkgYear} onChange={(e) => setPkgYear(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Tabel jumlah paket per ukuran paket */}
            {(() => {
              const variant = packageTypes.find((p) => p.id === pkgTypeId)?.variants.find((v) => v.id === pkgVariantId);
              const getPrice = (rt: string) => variant?.prices.find((pr) => pr.sessionPack === rt)?.price ?? 0;
              const rows = [
                { rt: "1x", val: pkgQty1x, set: setPkgQty1x },
                { rt: "3x", val: pkgQty3x, set: setPkgQty3x },
                { rt: "6x", val: pkgQty6x, set: setPkgQty6x },
                { rt: "12x", val: pkgQty12x, set: setPkgQty12x },
              ] as const;
              const n = (v: string) => (v !== "" ? Number(v) : 0);
              const total =
                n(pkgQty1x) * getPrice("1x") +
                n(pkgQty3x) * getPrice("3x") +
                n(pkgQty6x) * getPrice("6x") +
                n(pkgQty12x) * getPrice("12x");

              return (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">Jumlah paket per ukuran paket</label>
                  <div className="overflow-hidden rounded-md border border-input">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Kamar</th>
                          <th className="px-2 py-1.5 text-center font-medium text-muted-foreground w-14">Orang</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Harga/org</th>
                          <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Sub-total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {rows.map(({ rt, val, set }) => {
                          const price = getPrice(rt);
                          const count = val !== "" ? Number(val) : 0;
                          const sub = count * price;
                          return (
                            <tr key={rt} className={cn(count > 0 && "bg-primary-soft/30")}>
                              <td className="px-2 py-1.5 font-medium">{rt}</td>
                              <td className="px-2 py-1 text-center">
                                <input type="number" min="0" value={val}
                                  onChange={(e) => set(e.target.value)}
                                  placeholder="0"
                                  className="w-12 rounded border border-input bg-background px-1.5 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                              </td>
                              <td className="px-2 py-1.5 text-right text-muted-foreground">
                                {price > 0 ? formatRpFull(price) : "—"}
                              </td>
                              <td className="px-2 py-1.5 text-right font-medium">
                                {sub > 0 ? formatRpFull(sub) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {total > 0 && (
                        <tfoot className="border-t-2 border-border bg-muted/20">
                          <tr>
                            <td colSpan={3} className="px-2 py-1.5 font-semibold text-primary">Total</td>
                            <td className="px-2 py-1.5 text-right font-bold text-primary">{formatRpFull(total)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              );
            })()}

            <button onClick={savePaket} disabled={savingPkg}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {savingPkg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Simpan
            </button>
          </div>
        </div>

        {/* Saran Jawaban — hanya tampil saat mode Human (aiPaused) */}
        {aiPaused && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Lightbulb className="h-3 w-3" /> Saran Jawaban AI
              </span>
              <button
                onClick={getSuggestion}
                disabled={suggesting}
                className="flex items-center gap-1 h-7 px-2.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {suggesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {suggesting ? "Memuat..." : "Sarankan"}
              </button>
            </div>

            {suggestErr && (
              <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{suggestErr}</p>
            )}

            {suggestion && (
              <div className="relative rounded-md border border-border bg-muted/30 px-3 py-2.5 text-sm">
                <p className="whitespace-pre-wrap leading-relaxed pr-7">{suggestion}</p>
                <button
                  onClick={copySuggestion}
                  title="Copy ke clipboard"
                  className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}

            {!suggestion && !suggestErr && !suggesting && (
              <p className="text-xs text-muted-foreground">Klik "Sarankan" untuk mendapat rekomendasi balasan dari AI.</p>
            )}
          </div>
        )}
      </div>

      {showDeal && (
        <AddDeal
          pipelines={pipelines.filter((p) => !deals.some((d) => d.pipelineId === p.id))}
          customerId={customerId}
          defaultTitle={displayCustomer(c)}
          onClose={() => setShowDeal(false)}
          onDone={() => { setShowDeal(false); load(); onUpdated(); }}
        />
      )}

      {showProfile && (
        <AudienceProfilePanel
          customerId={customerId}
          customerName={displayCustomer(c)}
          onClose={() => setShowProfile(false)}
        />
      )}
      {pendingStage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-white p-5 shadow-xl">
            <h3 className="mb-1 font-semibold">Ubah Stage Pipeline</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              Pindah ke <span className="font-medium text-foreground">{pendingStage.toStageName}</span>.
              {sessionRole === "AGENT" ? " Tulis alasan (wajib)." : " Tulis alasan (opsional)."}
            </p>
            <textarea
              value={stageNote}
              onChange={e => setStageNote(e.target.value)}
              rows={3}
              placeholder="Tulis alasan perubahan..."
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setPendingStage(null); setStageNote(""); }}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Batal
              </button>
              <button
                disabled={stageSaving || (sessionRole === "AGENT" && !stageNote.trim())}
                onClick={async () => {
                  setStageSaving(true);
                  await execChangeStage(pendingStage.dealId, pendingStage.toStageId, stageNote);
                  setStageSaving(false);
                  setPendingStage(null);
                  setStageNote("");
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {stageSaving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gabungkan Lead */}
      {showMerge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMerge(false)}>
          <div className="w-[420px] max-w-[calc(100vw-2rem)] rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-semibold text-sm">Gabungkan Lead Duplikat</span>
              <button onClick={() => setShowMerge(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              {/* Primary (current) */}
              <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-sm">
                <div className="text-xs text-orange-600 font-medium mb-0.5">Lead ini (utama — tetap ada)</div>
                <div className="font-medium">{c?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{c?.phone ?? c?.externalId} · {c?.channel}</div>
              </div>

              <div className="text-xs text-muted-foreground text-center">+ gabungkan dengan</div>

              {/* Search */}
              <input
                autoFocus
                value={mergeQuery}
                onChange={e => setMergeQuery(e.target.value)}
                placeholder="Cari nama atau nomor lead duplikat..."
                className="w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary"
              />

              {mergeSearching && <div className="text-xs text-center text-muted-foreground py-2">Mencari...</div>}

              {mergeResults.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {mergeResults.map(r => (
                    <button
                      key={r.id}
                      disabled={merging}
                      onClick={() => doMerge(r.id, r.name)}
                      className="w-full text-left rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <div className="font-medium">{r.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.phone ?? r.externalId} · {r.channel} · {r.tags.join(", ") || "belum ada label"}</div>
                    </button>
                  ))}
                </div>
              )}

              {!mergeSearching && mergeQuery.trim() && mergeResults.length === 0 && (
                <div className="text-xs text-center text-muted-foreground py-2">Lead tidak ditemukan</div>
              )}

              <div className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                ⚠️ Semua percakapan, jurnal, label, pipeline dari lead duplikat akan dipindah ke lead ini. Lead duplikat akan dihapus permanen.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddDeal({ pipelines, customerId, defaultTitle, onClose, onDone }: {
  pipelines: Pipeline[]; customerId: string; defaultTitle: string; onClose: () => void; onDone: () => void;
}) {
  const [pipeId, setPipeId] = useState(pipelines[0]?.id ?? "");
  const pipe = pipelines.find((p) => p.id === pipeId);
  const [stageId, setStageId] = useState(pipe?.stages[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!stageId) return;
    setBusy(true);
    await fetch("/api/crm/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: defaultTitle, value: null, stageId, customerId }),
    });
    setBusy(false); onDone();
  }

  const field = "mt-1 h-9 w-full rounded-md border border-input px-2 text-sm outline-none focus:border-primary";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Tambah Pipeline</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        {pipelines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lead ini sudah ada di semua pipeline. Untuk mengubah tahap, gunakan dropdown di kartu pipeline.</p>
        ) : (
          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium">Pipeline</label>
              <select
                value={pipeId}
                onChange={(e) => {
                  setPipeId(e.target.value);
                  const p = pipelines.find((x) => x.id === e.target.value);
                  setStageId(p?.stages[0]?.id ?? "");
                }}
                className={field}
              >
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Tahap</label>
              <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={field}>
                {(pipe?.stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button
              onClick={submit}
              disabled={busy || !stageId}
              className="mt-1 h-9 w-full rounded-md bg-primary text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
