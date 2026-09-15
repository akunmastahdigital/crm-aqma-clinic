"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Trash2, Plus, Pencil, Check, X, Clock } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type BhDay = { day: number; name: string; open: boolean; start: string; end: string };
type BhSettings = { enabled: boolean; timezone: string; autoReplyEnabled: boolean; outsideMessage: string; days: BhDay[] };

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DEFAULT_BH: BhSettings = {
  enabled: false,
  timezone: "Asia/Jakarta",
  autoReplyEnabled: false,
  outsideMessage: "Halo! Terima kasih sudah menghubungi kami 🙏\nSaat ini kami sedang di luar jam kerja. Tim kami akan segera membalas pada jam kerja berikutnya.",
  days: DAY_NAMES.map((name, day) => ({ day, name, open: day >= 1 && day <= 5, start: "08:00", end: "17:00" })),
};

type Stage = { id: string; name: string; color: string | null; deals: { id: string }[] };
type Field = { id: string; label: string; key: string; type: string; options: string[] };

const TABS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "fields", label: "Field Kustom" },
  { id: "score", label: "Skor" },
  { id: "jurnal", label: "Jurnal Sales" },
  { id: "business_hours", label: "Jam Kerja" },
  { id: "notifikasi", label: "Notifikasi" },
] as const;

export function CrmSettingsClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pipeline");

  return (
    <>
      <PageHeader
        title="Pengaturan CRM"
        description="Atur tahap pipeline, field kustom, dan skor lead"
      />
      <div className="border-b border-border bg-white px-6">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "border-b-2 px-4 py-3 text-sm font-medium transition-colors " +
                (tab === t.id
                  ? "border-primary text-primary-dark"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6">
        {tab === "pipeline" && <PipelineTab />}
        {tab === "fields" && <FieldsTab />}
        {tab === "score" && <ScoreTab />}
        {tab === "jurnal" && <JurnalSettingsTab />}
        {tab === "business_hours" && <BusinessHoursTab />}
        {tab === "notifikasi" && <NotifikasiTab />}
      </div>
    </>
  );
}

type Pipe = { id: string; name: string; _count?: { deals: number } };

function PipelineTab() {
  const [pipelines, setPipelines] = useState<Pipe[]>([]);
  const [activePid, setActivePid] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [newPipe, setNewPipe] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadPipelines = useCallback(async () => {
    const r = await fetch("/api/crm/pipelines");
    if (r.ok) {
      const d = await r.json();
      setPipelines(d.pipelines);
      setActivePid((prev) => prev || d.pipelines[0]?.id || "");
    }
  }, []);
  const loadStages = useCallback(async (pid: string) => {
    if (!pid) return;
    const r = await fetch(`/api/crm/board?pipelineId=${pid}`);
    if (r.ok) setStages((await r.json()).pipeline.stages);
  }, []);
  useEffect(() => { loadPipelines(); }, [loadPipelines]);
  useEffect(() => { if (activePid) loadStages(activePid); }, [activePid, loadStages]);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    await fetch("/api/crm/stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, pipelineId: activePid }),
    });
    setName("");
    setBusy(false);
    loadStages(activePid);
  }
  async function rename(id: string, val: string) {
    await fetch(`/api/crm/stages/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: val }) });
  }
  async function recolor(id: string, val: string) {
    await fetch(`/api/crm/stages/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ color: val }) });
    loadStages(activePid);
  }
  async function move(id: string, dir: "up" | "down") {
    await fetch(`/api/crm/stages/${id}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dir }) });
    loadStages(activePid);
  }
  async function del(id: string) {
    setErr("");
    const r = await fetch(`/api/crm/stages/${id}`, { method: "DELETE" });
    if (!r.ok) setErr((await r.json()).error ?? "Gagal hapus");
    loadStages(activePid);
  }
  async function addPipeline() {
    if (!newPipe.trim()) return;
    setBusy(true);
    const r = await fetch("/api/crm/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPipe }),
    });
    setNewPipe("");
    setBusy(false);
    if (r.ok) {
      const d = await r.json();
      await loadPipelines();
      setActivePid(d.pipeline.id);
    }
  }
  async function renamePipeline(val: string) {
    if (!activePid || !val.trim()) return;
    await fetch(`/api/crm/pipelines/${activePid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: val }) });
    loadPipelines();
  }
  async function delPipeline() {
    setErr("");
    const r = await fetch(`/api/crm/pipelines/${activePid}`, { method: "DELETE" });
    if (!r.ok) { setErr((await r.json()).error ?? "Gagal hapus pipeline"); return; }
    setActivePid("");
    loadPipelines();
  }

  const activePipe = pipelines.find((p) => p.id === activePid);

  return (
    <div className="max-w-2xl space-y-4">
      {/* Kelola pipeline */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div className="mb-2 text-sm font-semibold">Pipeline</div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activePid}
            onChange={(e) => setActivePid(e.target.value)}
            className="h-9 rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {activePipe && (
            <input
              key={activePipe.id}
              defaultValue={activePipe.name}
              onBlur={(e) => renamePipeline(e.target.value)}
              className="h-9 flex-1 rounded-md border border-input px-3 text-sm outline-none focus:border-primary"
              placeholder="Nama pipeline"
            />
          )}
          <button onClick={delPipeline} className="rounded-md p-2 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Hapus pipeline">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-border pt-3">
          <input value={newPipe} onChange={(e) => setNewPipe(e.target.value)} placeholder="Nama pipeline baru" className="h-9 flex-1 rounded-md border border-input px-3 text-sm outline-none focus:border-primary" />
          <button onClick={addPipeline} disabled={busy || !newPipe.trim()} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
            <Plus className="h-4 w-4" /> Pipeline
          </button>
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border bg-white">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          Tahap Pipeline
        </div>
        <div className="divide-y divide-border">
          {stages.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <input
                type="color"
                defaultValue={s.color ?? "#6b7280"}
                onChange={(e) => recolor(s.id, e.target.value)}
                className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                title="Warna"
              />
              <input
                defaultValue={s.name}
                onBlur={(e) => rename(s.id, e.target.value)}
                className="flex-1 rounded-md border border-transparent px-2 py-1 text-sm hover:border-input focus:border-primary focus:outline-none"
              />
              <span className="text-xs text-muted-foreground">{s.deals.length} deal</span>
              <button onClick={() => move(s.id, "up")} disabled={i === 0} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button onClick={() => move(s.id, "down")} disabled={i === stages.length - 1} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button onClick={() => del(s.id)} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        {err && <div className="px-4 py-2 text-xs text-danger">{err}</div>}
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama tahap baru" className="h-9 flex-1 rounded-md border border-input px-3 text-sm outline-none focus:border-primary" />
          <button onClick={add} disabled={busy || !name.trim()} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
            <Plus className="h-4 w-4" /> Tambah
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldsTab() {
  const [fields, setFields] = useState<Field[]>([]);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("TEXT");
  const [options, setOptions] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/crm/fields");
    if (r.ok) setFields((await r.json()).fields);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!label.trim()) return;
    setBusy(true);
    await fetch("/api/crm/fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, type, options: options.split(",").map((s) => s.trim()).filter(Boolean) }),
    });
    setLabel(""); setOptions(""); setType("TEXT");
    setBusy(false);
    load();
  }
  async function del(id: string) {
    await fetch(`/api/crm/fields/${id}`, { method: "DELETE" });
    load();
  }

  const TYPE_LABEL: Record<string, string> = { TEXT: "Teks", NUMBER: "Angka", SELECT: "Pilihan", DATE: "Tanggal" };

  return (
    <div className="max-w-2xl">
      <div className="rounded-[var(--radius-lg)] border border-border bg-white">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          Field Kustom Pelanggan
        </div>
        <div className="divide-y divide-border">
          {fields.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Belum ada field kustom.
            </div>
          )}
          {fields.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1">
                <div className="text-sm font-medium">{f.label}</div>
                <div className="text-xs text-muted-foreground">
                  {TYPE_LABEL[f.type]}{f.options.length ? ` · ${f.options.join(", ")}` : ""}
                </div>
              </div>
              <button onClick={() => del(f.id)} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nama field (mis. Kota)" className="h-9 flex-1 rounded-md border border-input px-3 text-sm outline-none focus:border-primary" />
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-md border border-input px-2 text-sm outline-none focus:border-primary">
              <option value="TEXT">Teks</option>
              <option value="NUMBER">Angka</option>
              <option value="SELECT">Pilihan</option>
              <option value="DATE">Tanggal</option>
            </select>
            <button onClick={add} disabled={busy || !label.trim()} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
              <Plus className="h-4 w-4" /> Tambah
            </button>
          </div>
          {type === "SELECT" && (
            <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Pilihan, pisah koma: Panas, Hangat, Dingin" className="h-9 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary" />
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreTab() {
  return (
    <div className="max-w-2xl rounded-[var(--radius-lg)] border border-border bg-white p-6">
      <h3 className="text-sm font-semibold">Skor Lead</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Skor lead per pelanggan sudah tersimpan di data pelanggan. Aturan skor
        otomatis (mis. tambah poin bila punya tag tertentu atau membalas cepat)
        akan diaktifkan berbarengan dengan Automasi di tahap berikutnya.
      </p>
    </div>
  );
}

// ============================================================
// HELPER: Inline-editable string list
// ============================================================

function StringList({ items, onUpdate }: { items: string[]; onUpdate: (n: string[]) => void }) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  function startEdit(i: number) { setEditIdx(i); setEditVal(items[i]); }
  function commit(i: number) {
    if (!editVal.trim()) return;
    const n = items.map((v, j) => j === i ? editVal.trim() : v);
    onUpdate(n);
    setEditIdx(null);
  }
  function cancel() { setEditIdx(null); }
  function remove(i: number) { onUpdate(items.filter((_, j) => j !== i)); }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t, i) =>
        editIdx === i ? (
          <span key={i} className="flex items-center gap-1 rounded-full border border-primary bg-primary/5 px-1.5 py-0.5">
            <input
              autoFocus
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commit(i); if (e.key === "Escape") cancel(); }}
              className="w-28 bg-transparent text-xs outline-none"
            />
            <button onClick={() => commit(i)} className="text-primary hover:text-primary-dark"><Check className="h-3 w-3" /></button>
            <button onClick={cancel} className="text-muted-foreground hover:text-danger"><X className="h-3 w-3" /></button>
          </span>
        ) : (
          <span key={i} className="flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium">
            {t}
            <button onClick={() => startEdit(i)} className="text-muted-foreground hover:text-primary"><Pencil className="h-2.5 w-2.5" /></button>
            <button onClick={() => remove(i)} className="text-muted-foreground hover:text-danger"><X className="h-3 w-3" /></button>
          </span>
        )
      )}
    </div>
  );
}

// ============================================================
// HELPER: Inline-editable label list (with color)
// ============================================================

const COLOR_PRESETS = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e",
  "#10b981","#14b8a6","#06b6d4","#0ea5e9","#3b82f6","#6366f1",
  "#8b5cf6","#a855f7","#d946ef","#ec4899","#f43f5e","#2F4157",
  "#A1A692","#8A9079","#4F7A5B","#B4534B","#C08A3E","#27364A",
  "#64748b","#6b7280","#78716c","#1e40af","#065f46","#92400e",
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(c: string) { onChange(c); setHex(c); setOpen(false); }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Pilih warna"
        className="h-7 w-7 rounded-full border-2 border-border shadow-sm transition-transform hover:scale-110"
        style={{ backgroundColor: value }}
      />
      {open && (
        <div className="absolute left-0 top-9 z-50 w-52 rounded-xl border border-border bg-white p-3 shadow-xl">
          <div className="mb-2.5 grid grid-cols-6 gap-1.5">
            {COLOR_PRESETS.map(c => (
              <button
                key={c}
                onClick={() => pick(c)}
                className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: c, borderColor: value === c ? "#0f172a" : "transparent" }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-2.5">
            <input
              type="color"
              value={value}
              onChange={e => { onChange(e.target.value); setHex(e.target.value); }}
              className="h-7 w-7 cursor-pointer rounded border border-border p-0.5"
              title="Pilih warna bebas"
            />
            <input
              value={hex}
              onChange={e => {
                setHex(e.target.value);
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value);
              }}
              onBlur={() => setHex(value)}
              placeholder="#rrggbb"
              maxLength={7}
              className="h-7 flex-1 rounded border border-input px-2 font-mono text-xs outline-none focus:border-primary"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function LabelList({ labels, onUpdate }: { labels: LabelItem[]; onUpdate: (n: LabelItem[]) => void }) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(COLOR_PRESETS[0]);

  function startEdit(i: number) { setEditIdx(i); setEditName(labels[i].name); setEditColor(labels[i].color); }
  function commit(i: number) {
    if (!editName.trim()) return;
    const n = labels.map((l, j) => j === i ? { name: editName.trim(), color: editColor } : l);
    onUpdate(n);
    setEditIdx(null);
  }
  function cancel() { setEditIdx(null); }
  function remove(i: number) { onUpdate(labels.filter((_, j) => j !== i)); }

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((l, i) =>
        editIdx === i ? (
          <span key={i} className="flex items-center gap-1.5 rounded-full border border-primary bg-primary/5 px-2 py-1">
            <ColorPicker value={editColor} onChange={setEditColor} />
            <input
              autoFocus
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commit(i); if (e.key === "Escape") cancel(); }}
              className="w-24 bg-transparent text-xs outline-none"
            />
            <button onClick={() => commit(i)} className="text-primary hover:text-primary-dark"><Check className="h-3 w-3" /></button>
            <button onClick={cancel} className="text-muted-foreground hover:text-danger"><X className="h-3 w-3" /></button>
          </span>
        ) : (
          <span key={i} className="flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
            {l.name}
            <button onClick={() => startEdit(i)} className="text-muted-foreground hover:text-primary"><Pencil className="h-2.5 w-2.5" /></button>
            <button onClick={() => remove(i)} className="text-muted-foreground hover:text-danger"><X className="h-3 w-3" /></button>
          </span>
        )
      )}
    </div>
  );
}

// ============================================================
// JURNAL SALES SETTINGS
// ============================================================

type LabelItem = { name: string; color: string };
type StringItem = string;
type ClosingDef = { useLabel: boolean; labels: string[]; useStage: boolean; stages: string[] };

const DEFAULT_CLOSING: ClosingDef = { useLabel: false, labels: [], useStage: false, stages: [] };

function JurnalSettingsTab() {
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [fuTypes, setFuTypes] = useState<StringItem[]>([]);
  const [fuResponses, setFuResponses] = useState<StringItem[]>([]);
  const [cancelReasons, setCancelReasons] = useState<StringItem[]>([]);
  const [failLabels, setFailLabels] = useState<string[]>([]);
  const [closingDef, setClosingDef] = useState<ClosingDef>(DEFAULT_CLOSING);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  // Inputs
  const [newLabel, setNewLabel] = useState("");
  const [newLabelColor, setNewLabelColor] = useState(COLOR_PRESETS[0]);
  const [newFuType, setNewFuType] = useState("");
  const [newFuResp, setNewFuResp] = useState("");
  const [newCancel, setNewCancel] = useState("");

  useEffect(() => {
    fetch("/api/crm/settings").then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      const s = d.settings;
      if (s.journal_labels) setLabels(s.journal_labels);
      if (s.followup_types) setFuTypes(s.followup_types);
      if (s.followup_responses) setFuResponses(s.followup_responses);
      if (s.cancel_reasons) setCancelReasons(s.cancel_reasons);
      if (s.fail_closing_labels) setFailLabels(s.fail_closing_labels);
      if (s.closing_definition) setClosingDef(s.closing_definition);
    });
    fetch("/api/crm/pipelines").then(r => r.ok ? r.json() : null).then(async d => {
      if (!d?.pipelines?.[0]) return;
      const pid = d.pipelines[0].id;
      const r2 = await fetch(`/api/crm/board?pipelineId=${pid}`);
      if (r2.ok) { const d2 = await r2.json(); setStages(d2.pipeline?.stages ?? []); }
    });
  }, []);

  async function save(key: string, value: unknown) {
    setSaving(key);
    await fetch("/api/crm/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
    setSaving(null);
  }

  const card = "mb-6 rounded-[var(--radius-lg)] border border-border bg-white p-5";
  const inp = "h-9 rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary";
  const btn = "h-9 rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50";
  const btnSm = "rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium hover:bg-muted";

  return (
    <div className="max-w-2xl space-y-0">

      {/* Section 1 — Label */}
      <div className={card}>
        <h3 className="mb-1 text-sm font-semibold">Label</h3>
        <p className="mb-3 text-xs text-muted-foreground">Label untuk menandai status lead di jurnal. Bisa dikustomisasi sesuai alur bisnis.</p>
        <LabelList labels={labels} onUpdate={n => { setLabels(n); save("journal_labels", n); }} />
        <div className="mt-3 flex items-center gap-2">
          <ColorPicker value={newLabelColor} onChange={setNewLabelColor} />
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Nama label..." className={inp + " flex-1"} onKeyDown={e => { if (e.key === "Enter" && newLabel.trim()) { const n = [...labels, { name: newLabel.trim(), color: newLabelColor }]; setLabels(n); save("journal_labels", n); setNewLabel(""); }}} />
          <button disabled={!newLabel.trim() || saving === "journal_labels"} onClick={() => { const n = [...labels, { name: newLabel.trim(), color: newLabelColor }]; setLabels(n); save("journal_labels", n); setNewLabel(""); }} className={btn}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Section 2 — Jenis Follow Up */}
      <div className={card}>
        <h3 className="mb-1 text-sm font-semibold">Jenis Follow Up</h3>
        <p className="mb-3 text-xs text-muted-foreground">Cara sales menghubungi lead (WA Text, Telpon, Meeting, dsb).</p>
        <StringList items={fuTypes} onUpdate={n => { setFuTypes(n); save("followup_types", n); }} />
        <div className="mt-3 flex gap-2">
          <input value={newFuType} onChange={e => setNewFuType(e.target.value)} placeholder="Contoh: WA Text, Telpon..." className={inp + " flex-1"} onKeyDown={e => { if (e.key === "Enter" && newFuType.trim()) { const n = [...fuTypes, newFuType.trim()]; setFuTypes(n); save("followup_types", n); setNewFuType(""); }}} />
          <button disabled={!newFuType.trim()} onClick={() => { const n = [...fuTypes, newFuType.trim()]; setFuTypes(n); save("followup_types", n); setNewFuType(""); }} className={btn}><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Section 3 — Respon Follow Up */}
      <div className={card}>
        <h3 className="mb-1 text-sm font-semibold">Respon Follow Up</h3>
        <p className="mb-3 text-xs text-muted-foreground">Respon yang diterima dari lead (independen dari Jenis FU, dianalisa cross-reference di laporan).</p>
        <StringList items={fuResponses} onUpdate={n => { setFuResponses(n); save("followup_responses", n); }} />
        <div className="mt-3 flex gap-2">
          <input value={newFuResp} onChange={e => setNewFuResp(e.target.value)} placeholder="Contoh: Tertarik, Tidak Dibalas..." className={inp + " flex-1"} onKeyDown={e => { if (e.key === "Enter" && newFuResp.trim()) { const n = [...fuResponses, newFuResp.trim()]; setFuResponses(n); save("followup_responses", n); setNewFuResp(""); }}} />
          <button disabled={!newFuResp.trim()} onClick={() => { const n = [...fuResponses, newFuResp.trim()]; setFuResponses(n); save("followup_responses", n); setNewFuResp(""); }} className={btn}><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Section 4 — Alasan Gagal Closing */}
      <div className={card}>
        <h3 className="mb-1 text-sm font-semibold">Alasan Gagal Closing</h3>
        <p className="mb-3 text-xs text-muted-foreground">Alasan mengapa lead tidak jadi closing (untuk analisa di laporan).</p>
        <StringList items={cancelReasons} onUpdate={n => { setCancelReasons(n); save("cancel_reasons", n); }} />
        <div className="mt-3 flex gap-2">
          <input value={newCancel} onChange={e => setNewCancel(e.target.value)} placeholder="Contoh: Harga mahal, Pilih kompetitor..." className={inp + " flex-1"} onKeyDown={e => { if (e.key === "Enter" && newCancel.trim()) { const n = [...cancelReasons, newCancel.trim()]; setCancelReasons(n); save("cancel_reasons", n); setNewCancel(""); }}} />
          <button disabled={!newCancel.trim()} onClick={() => { const n = [...cancelReasons, newCancel.trim()]; setCancelReasons(n); save("cancel_reasons", n); setNewCancel(""); }} className={btn}><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Section 5 — Definisi Gagal Closing */}
      <div className={card}>
        <h3 className="mb-1 text-sm font-semibold">Definisi Gagal Closing</h3>
        <p className="mb-3 text-xs text-muted-foreground">Lead dianggap GAGAL CLOSING jika memilih label berikut di form jurnal → field Alasan Gagal muncul otomatis + wajib diisi.</p>
        {labels.length === 0 && <p className="text-xs text-muted-foreground italic">Tambahkan label dulu di Section 1.</p>}
        <div className="flex flex-wrap gap-2">
          {labels.map((l) => (
            <button
              key={l.name}
              onClick={() => {
                const n = failLabels.includes(l.name) ? failLabels.filter(x => x !== l.name) : [...failLabels, l.name];
                setFailLabels(n);
                save("fail_closing_labels", n);
              }}
              className={"flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors " + (failLabels.includes(l.name) ? "border-danger bg-danger/10 text-danger" : "border-border bg-white hover:border-danger/40")}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
              {l.name}
            </button>
          ))}
        </div>
      </div>

      {/* Section 6 — Definisi Closing (Closing Rate) */}
      <div className={card}>
        <h3 className="mb-1 text-sm font-semibold">Definisi Closing (untuk Closing Rate)</h3>
        <p className="mb-3 text-xs text-muted-foreground">Lead dihitung CLOSING jika memenuhi minimal salah satu kondisi berikut.</p>

        <div className="space-y-4">
          {/* Kondisi A — Label */}
          <div className="rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={closingDef.useLabel} onChange={e => {
                const n = { ...closingDef, useLabel: e.target.checked };
                setClosingDef(n); save("closing_definition", n);
              }} className="accent-primary" />
              Berdasarkan Label
            </label>
            {closingDef.useLabel && (
              <div className="mt-2 flex flex-wrap gap-2">
                {labels.map(l => (
                  <button key={l.name} onClick={() => {
                    const ls = closingDef.labels.includes(l.name) ? closingDef.labels.filter(x => x !== l.name) : [...closingDef.labels, l.name];
                    const n = { ...closingDef, labels: ls };
                    setClosingDef(n); save("closing_definition", n);
                  }} className={"flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " + (closingDef.labels.includes(l.name) ? "border-primary bg-primary/10 text-primary-dark" : "border-border bg-white hover:border-primary/40")}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />{l.name}
                  </button>
                ))}
                {labels.length === 0 && <span className="text-xs text-muted-foreground italic">Tambahkan label dulu.</span>}
              </div>
            )}
          </div>

          {/* Kondisi B — Stage */}
          <div className="rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={closingDef.useStage} onChange={e => {
                const n = { ...closingDef, useStage: e.target.checked };
                setClosingDef(n); save("closing_definition", n);
              }} className="accent-primary" />
              Berdasarkan Stage Pipeline
            </label>
            {closingDef.useStage && (
              <div className="mt-2 flex flex-wrap gap-2">
                {stages.map(s => (
                  <button key={s.id} onClick={() => {
                    const ss = closingDef.stages.includes(s.id) ? closingDef.stages.filter(x => x !== s.id) : [...closingDef.stages, s.id];
                    const n = { ...closingDef, stages: ss };
                    setClosingDef(n); save("closing_definition", n);
                  }} className={"rounded-full border px-2.5 py-1 text-xs font-medium " + (closingDef.stages.includes(s.id) ? "border-primary bg-primary/10 text-primary-dark" : "border-border bg-white hover:border-primary/40")}>
                    {s.name}
                  </button>
                ))}
                {stages.length === 0 && <span className="text-xs text-muted-foreground italic">Buat pipeline dulu di tab Pipeline.</span>}
              </div>
            )}
          </div>
        </div>

        {saving === "closing_definition" && <p className="mt-2 text-xs text-muted-foreground">Menyimpan...</p>}
      </div>
    </div>
  );
}

function BusinessHoursTab() {
  const [bh, setBh] = useState<BhSettings>(DEFAULT_BH);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/crm/settings")
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings?.business_hours as BhSettings | undefined;
        if (s) setBh({ ...DEFAULT_BH, ...s, days: s.days ?? DEFAULT_BH.days });
      })
      .catch(() => {});
  }, []);

  function updateDay(idx: number, patch: Partial<BhDay>) {
    setBh((prev) => {
      const days = prev.days.map((d, i) => (i === idx ? { ...d, ...patch } : d));
      return { ...prev, days };
    });
  }

  async function save() {
    setSaving(true);
    await fetch("/api/crm/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "business_hours", value: bh }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header toggle */}
      <div className="rounded-xl border border-border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Jam Kerja</span>
          </div>
          <button
            onClick={() => setBh((p) => ({ ...p, enabled: !p.enabled }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${bh.enabled ? "bg-primary" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${bh.enabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Aktifkan untuk mengatur jam operasional tim. Pesan di luar jam kerja bisa mendapat auto-reply otomatis.
        </p>
      </div>

      {bh.enabled && (
        <>
          {/* Jadwal per hari */}
          <div className="rounded-xl border border-border bg-white p-5">
            <h3 className="mb-4 text-sm font-semibold">Jadwal Operasional</h3>
            <div className="space-y-3">
              {bh.days.map((d, i) => (
                <div key={d.day} className="flex items-center gap-3">
                  <button
                    onClick={() => updateDay(i, { open: !d.open })}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${d.open ? "bg-primary" : "bg-gray-200"}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${d.open ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                  <span className={`w-16 text-sm ${d.open ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {d.name}
                  </span>
                  {d.open ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={d.start}
                        onChange={(e) => updateDay(i, { start: e.target.value })}
                        className="rounded-lg border border-border px-2 py-1 text-sm focus:border-primary focus:outline-none"
                      />
                      <span className="text-xs text-muted-foreground">s/d</span>
                      <input
                        type="time"
                        value={d.end}
                        onChange={(e) => updateDay(i, { end: e.target.value })}
                        className="rounded-lg border border-border px-2 py-1 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Tutup</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Auto-reply luar jam */}
          <div className="rounded-xl border border-border bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Auto-Reply di Luar Jam Kerja</h3>
              <button
                onClick={() => setBh((p) => ({ ...p, autoReplyEnabled: !p.autoReplyEnabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${bh.autoReplyEnabled ? "bg-primary" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${bh.autoReplyEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {bh.autoReplyEnabled && (
              <>
                <p className="text-xs text-muted-foreground">
                  Dikirim 1x per sesi — hanya pada pesan pertama lead di luar jam kerja. Tidak spam jika lead kirim beberapa pesan.
                </p>
                <textarea
                  value={bh.outsideMessage}
                  onChange={(e) => setBh((p) => ({ ...p, outsideMessage: e.target.value }))}
                  rows={5}
                  placeholder="Tulis pesan auto-reply di luar jam kerja..."
                  className="w-full rounded-lg border border-border p-3 text-sm focus:border-primary focus:outline-none resize-none"
                />
              </>
            )}
          </div>
        </>
      )}

      {/* Simpan */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
        {saved && <span className="text-xs text-green-600 font-medium">Tersimpan ✓</span>}
      </div>
    </div>
  );
}

function NotifikasiTab() {
  const [pushEnabled, setPushEnabled] = useState(true);
  const [fuEnabled, setFuEnabled] = useState(true);
  const [fuMinutes, setFuMinutes] = useState(30);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/settings")
      .then((r) => r.json())
      .then(({ settings }) => {
        if (settings.push_notif_enabled !== undefined) setPushEnabled(!!settings.push_notif_enabled);
        if (settings.fu_reminder_enabled !== undefined) setFuEnabled(!!settings.fu_reminder_enabled);
        if (settings.fu_reminder_minutes !== undefined) setFuMinutes(Number(settings.fu_reminder_minutes) || 30);
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveSetting(key: string, value: unknown) {
    await fetch("/api/crm/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    await Promise.all([
      saveSetting("push_notif_enabled", pushEnabled),
      saveSetting("fu_reminder_enabled", fuEnabled),
      saveSetting("fu_reminder_minutes", fuMinutes),
    ]);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return <div className="py-8 text-sm text-muted-foreground">Memuat...</div>;

  return (
    <div className="max-w-lg space-y-8">
      {/* Push Notification */}
      <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-1">Push Notification (Browser)</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Notifikasi muncul di OS saat ada pesan masuk, meskipun browser di-minimize.
        </p>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => setPushEnabled((v) => !v)}
            className={
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors " +
              (pushEnabled ? "bg-primary" : "bg-muted-foreground/30")
            }
          >
            <span
              className={
                "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform " +
                (pushEnabled ? "translate-x-6" : "translate-x-1")
              }
            />
          </div>
          <span className="text-sm">{pushEnabled ? "Aktif" : "Nonaktif"} untuk semua agent</span>
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Catatan: Setiap agent tetap bisa aktifkan/nonaktifkan notifikasi di browser mereka sendiri via ikon Bell di halaman Inbox.
        </p>
      </section>

      {/* FU Reminder */}
      <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-1">Pengingat Follow Up Otomatis</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Popup + suara mengingatkan agent sebelum jadwal Follow Up tiba.
        </p>

        <label className="flex items-center gap-3 cursor-pointer select-none mb-4">
          <div
            onClick={() => setFuEnabled((v) => !v)}
            className={
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors " +
              (fuEnabled ? "bg-primary" : "bg-muted-foreground/30")
            }
          >
            <span
              className={
                "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform " +
                (fuEnabled ? "translate-x-6" : "translate-x-1")
              }
            />
          </div>
          <span className="text-sm">{fuEnabled ? "Aktif" : "Nonaktif"}</span>
        </label>

        {fuEnabled && (
          <div>
            <p className="text-xs font-medium text-foreground mb-2">Ingatkan berapa menit sebelum jadwal?</p>
            <div className="flex gap-2">
              {[15, 30, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => setFuMinutes(m)}
                  className={
                    "rounded-lg border px-4 py-2 text-sm font-medium transition-colors " +
                    (fuMinutes === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted")
                  }
                >
                  {m} menit
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
        {saved && <span className="text-xs text-green-600 font-medium">Tersimpan ✓</span>}
      </div>
    </div>
  );
}
