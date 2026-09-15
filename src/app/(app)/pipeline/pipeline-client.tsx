"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X, User2, Trash2, ArrowLeft, ArrowRight, Layers, Check, MessageSquare } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import Link from "next/link";

type Deal = {
  id: string;
  title: string;
  value: number | null;
  stageId: string;
  customerId: string | null;
  customer: { name: string | null; externalId: string; tags: string[]; assignedTo: { name: string } | null } | null;
  assignedTo: { name: string } | null;
};
type Stage = { id: string; name: string; color: string | null; deals: Deal[] };

const PALETTE = [
  { bg: "#fef2f2", text: "#b91c1c", border: "#fca5a5" }, // red
  { bg: "#fff7ed", text: "#c2410c", border: "#fdba74" }, // orange
  { bg: "#fefce8", text: "#a16207", border: "#fde047" }, // yellow
  { bg: "#f0fdf4", text: "#15803d", border: "#86efac" }, // green
  { bg: "#ecfeff", text: "#0e7490", border: "#67e8f9" }, // cyan
  { bg: "#eef2ff", text: "#4338ca", border: "#a5b4fc" }, // indigo
  { bg: "#faf5ff", text: "#7e22ce", border: "#d8b4fe" }, // purple
  { bg: "#fdf2f8", text: "#9d174d", border: "#f9a8d4" }, // pink
];

function strColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}
type Board = { id: string; name: string; stages: Stage[] };
type Lite = { id: string; name: string | null; externalId?: string };

export function PipelineClient() {
  const [board, setBoard] = useState<Board | null>(null);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [activePid, setActivePid] = useState<string>("");
  const [sessionRole, setSessionRole] = useState<string>("AGENT");
  const [pendingMove, setPendingMove] = useState<{
    dealId: string; customerId: string | null;
    toStageId: string; toStageName: string;
  } | null>(null);
  const [moveNote, setMoveNote] = useState("");
  const [moveSaving, setMoveSaving] = useState(false);
  const [customers, setCustomers] = useState<Lite[]>([]);
  const [users, setUsers] = useState<Lite[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showNewPipe, setShowNewPipe] = useState(false);
  const [editStages, setEditStages] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async (pid?: string) => {
    const q = pid ? `?pipelineId=${pid}` : "";
    const r = await fetch(`/api/crm/board${q}`);
    if (r.ok) {
      const d = await r.json();
      setBoard(d.pipeline);
      setPipelines(d.pipelines.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      setActivePid(d.pipeline.id);
      setCustomers(d.customers);
      setUsers(d.users);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.role) setSessionRole(d.role);
    });
  }, []);

  async function execMove(dealId: string, toStageId: string, customerId: string | null, note: string) {
    await fetch(`/api/crm/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStageId }),
    });
    // Buat journal entry otomatis jika ada note atau mandatory
    if (note.trim() && customerId) {
      await fetch("/api/crm/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }),
          activityType: "Admin",
          stageId: toStageId,
          notes: note.trim(),
          status: "DONE",
        }),
      });
    }
    load(activePid);
  }

  function move(deal: Deal, toStageId: string) {
    const toStage = board?.stages.find(s => s.id === toStageId);
    setPendingMove({ dealId: deal.id, customerId: deal.customerId ?? null, toStageId, toStageName: toStage?.name ?? toStageId });
    setMoveNote("");
  }

  // --- kelola pipeline ---
  async function renamePipeline(name: string) {
    if (!name.trim()) return;
    await fetch(`/api/crm/pipelines/${activePid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    load(activePid);
  }
  async function delPipeline() {
    setErr("");
    if (!confirm("Hapus pipeline ini beserta semua kartunya?")) return;
    const r = await fetch(`/api/crm/pipelines/${activePid}`, { method: "DELETE" });
    if (!r.ok) { setErr((await r.json()).error ?? "Gagal hapus pipeline"); return; }
    load();
  }

  // --- kelola tahap ---
  async function addStage() {
    await fetch("/api/crm/stages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Tahap baru", color: "#6b7280", pipelineId: activePid }) });
    load(activePid);
  }
  async function renameStage(id: string, name: string) {
    await fetch(`/api/crm/stages/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  }
  async function recolorStage(id: string, color: string) {
    await fetch(`/api/crm/stages/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ color }) });
    load(activePid);
  }
  async function moveStage(id: string, dir: "up" | "down") {
    await fetch(`/api/crm/stages/${id}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dir }) });
    load(activePid);
  }
  async function delStage(id: string) {
    setErr("");
    const r = await fetch(`/api/crm/stages/${id}`, { method: "DELETE" });
    if (!r.ok) setErr((await r.json()).error ?? "Gagal hapus tahap");
    load(activePid);
  }

  if (!board) {
    return <div className="p-6 text-sm text-muted-foreground">Memuat...</div>;
  }

  return (
    <>
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activePid}
              onChange={(e) => load(e.target.value)}
              className="rounded-[var(--radius-md)] border border-input bg-white px-3 py-2 text-lg font-bold outline-none focus:border-primary"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={() => setShowNewPipe(true)}
              className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-input px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Plus className="h-4 w-4" /> Pipeline baru
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditStages((v) => !v)}
              className={
                "inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium " +
                (editStages ? "border-primary bg-primary-soft text-primary-dark" : "border-input hover:bg-muted")
              }
            >
              {editStages ? <Check className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
              {editStages ? "Selesai atur tahap" : "Atur tahap"}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
            >
              <Plus className="h-4 w-4" /> Tambah Kartu
            </button>
          </div>
        </div>

        {/* baris atur pipeline (nama + hapus) saat mode atur tahap */}
        {editStages && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs font-medium text-muted-foreground">Nama pipeline:</span>
            <input
              key={activePid}
              defaultValue={board.name}
              onBlur={(e) => e.target.value !== board.name && renamePipeline(e.target.value)}
              className="h-9 w-56 rounded-md border border-input px-3 text-sm outline-none focus:border-primary"
            />
            <button onClick={delPipeline} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-danger hover:bg-danger/10">
              <Trash2 className="h-4 w-4" /> Hapus pipeline ini
            </button>
            {err && <span className="text-xs text-danger">{err}</span>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex h-full gap-4">
          {board.stages.map((st, si) => {
            const total = st.deals.reduce((a, d) => a + (d.value ?? 0), 0);
            return (
              <div
                key={st.id}
                className="flex w-72 shrink-0 flex-col rounded-[var(--radius-lg)] bg-muted/50"
              >
                {editStages ? (
                  <div className="space-y-1.5 p-2.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        defaultValue={st.color ?? "#6b7280"}
                        onChange={(e) => recolorStage(st.id, e.target.value)}
                        className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                        title="Warna tahap"
                      />
                      <input
                        defaultValue={st.name}
                        onBlur={(e) => e.target.value !== st.name && renameStage(st.id, e.target.value)}
                        className="h-8 flex-1 rounded-md border border-input bg-white px-2 text-sm font-semibold outline-none focus:border-primary"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveStage(st.id, "up")} disabled={si === 0} className="rounded p-1 text-muted-foreground hover:bg-white disabled:opacity-30" title="Geser kiri">
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <button onClick={() => moveStage(st.id, "down")} disabled={si === board.stages.length - 1} className="rounded p-1 text-muted-foreground hover:bg-white disabled:opacity-30" title="Geser kanan">
                        <ArrowRight className="h-4 w-4" />
                      </button>
                      <button onClick={() => delStage(st.id)} className="ml-auto rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger" title="Hapus tahap">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: st.color ?? "#6b7280" }}
                        />
                        <span className="text-sm font-semibold">{st.name}</span>
                        <span className="rounded-full bg-white px-1.5 text-xs text-muted-foreground">
                          {st.deals.length}
                        </span>
                      </div>
                    </div>
                    <div className="px-3 pb-2 text-xs text-muted-foreground">
                      {total > 0 ? formatRupiah(total) : "—"}
                    </div>
                  </>
                )}
                <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {st.deals.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-[var(--radius-md)] border border-border bg-white p-3 shadow-sm"
                    >
                      <div className="text-sm font-medium">
                        {d.customer?.name ?? d.customer?.externalId ?? d.title}
                      </div>
                      {d.value != null && (
                        <div className="mt-0.5 text-sm font-semibold text-primary-dark">
                          {formatRupiah(d.value)}
                        </div>
                      )}
                      {d.customer?.tags && d.customer.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {d.customer.tags.map((tag) => {
                            const c = strColor(tag);
                            return (
                              <span
                                key={tag}
                                style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
                                className="inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium"
                              >
                                {tag}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {(() => {
                          const agentName = d.assignedTo?.name ?? d.customer?.assignedTo?.name;
                          const c = agentName ? strColor(agentName) : null;
                          return (
                            <span className="inline-flex items-center gap-1 text-[11px]"
                              style={c ? { color: c.text } : { color: "#6b7280" }}>
                              <User2 className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[80px]">{agentName ?? "—"}</span>
                            </span>
                          );
                        })()}
                        <div className="flex items-center gap-1">
                          {d.customerId && (
                            <Link
                              href={`/inbox?customer=${d.customerId}`}
                              title="Buka di Inbox"
                              className="flex h-6 w-6 items-center justify-center rounded border border-input bg-white text-muted-foreground hover:border-primary hover:text-primary"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </Link>
                          )}
                          <select
                            value={d.stageId}
                            onChange={(e) => move(d, e.target.value)}
                            className="rounded border border-input bg-white px-1 py-0.5 text-[11px] outline-none focus:border-primary"
                          >
                            {board.stages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                  {st.deals.length === 0 && (
                    <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                      Kosong
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* kolom tambah tahap (mode atur) */}
          {editStages && (
            <button
              onClick={addStage}
              className="flex h-24 w-72 shrink-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary-dark"
            >
              <Plus className="h-5 w-5" /> Tambah Tahap
            </button>
          )}
        </div>
      </div>

      {showNewPipe && (
        <NewPipelineModal
          onClose={() => setShowNewPipe(false)}
          onDone={async (pid) => {
            setShowNewPipe(false);
            await load(pid);
            setEditStages(true);
          }}
        />
      )}

      {showAdd && (
        <AddDealModal
          stages={board.stages}
          customers={customers}
          users={users}
          onClose={() => setShowAdd(false)}
          onDone={async () => {
            setShowAdd(false);
            await load(activePid);
          }}
        />
      )}
    </div>

    {/* Modal alasan pindah stage */}
    {pendingMove && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-white p-5 shadow-xl">
          <h3 className="mb-1 font-semibold">Pindah Stage</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Deal dipindah ke <span className="font-medium text-foreground">{pendingMove.toStageName}</span>.
            {sessionRole === "AGENT" ? " Tulis alasan (wajib)." : " Tulis alasan (opsional)."}
          </p>
          <textarea
            value={moveNote}
            onChange={e => setMoveNote(e.target.value)}
            rows={3}
            placeholder="Tulis alasan perubahan..."
            className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => { setPendingMove(null); setMoveNote(""); }}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Batal
            </button>
            <button
              disabled={moveSaving || (sessionRole === "AGENT" && !moveNote.trim())}
              onClick={async () => {
                setMoveSaving(true);
                await execMove(pendingMove.dealId, pendingMove.toStageId, pendingMove.customerId, moveNote);
                setMoveSaving(false);
                setPendingMove(null);
                setMoveNote("");
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {moveSaving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function NewPipelineModal({ onClose, onDone }: { onClose: () => void; onDone: (pid: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    const r = await fetch("/api/crm/pipelines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setBusy(false);
    if (r.ok) onDone((await r.json()).pipeline.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Pipeline Baru</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <label className="text-xs font-medium">Nama pipeline</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Mis. Pipeline Behel / Pipeline Pasien Baru"
          className="mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary"
        />
        <p className="mt-2 text-xs text-muted-foreground">Otomatis dibuat 3 tahap awal (Baru, Proses, Selesai) — bisa diubah lewat &quot;Atur tahap&quot;.</p>
        <button onClick={submit} disabled={busy || !name.trim()} className="mt-3 h-10 w-full rounded-md bg-primary font-medium text-white hover:bg-primary-dark disabled:opacity-50">
          {busy ? "Membuat..." : "Buat Pipeline"}
        </button>
      </div>
    </div>
  );
}

function AddDealModal({
  stages,
  customers,
  users,
  onClose,
  onDone,
}: {
  stages: Stage[];
  customers: Lite[];
  users: Lite[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [customerId, setCustomerId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    await fetch("/api/crm/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, value, stageId, customerId, assignedToId }),
    });
    setBusy(false);
    onDone();
  }

  const field =
    "mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Tambah Kartu</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Judul</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mis. Pasang Behel - Bu Ani" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Potensi Income (Rp)</label>
              <input value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, "."))} placeholder="5.000.000" className={field} inputMode="numeric" />
            </div>
            <div>
              <label className="text-xs font-medium">Tahap</label>
              <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={field}>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Pelanggan (opsional)</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={field}>
              <option value="">— tidak ada —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name ?? c.externalId}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium">Ditugaskan ke (opsional)</label>
            <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={field}>
              <option value="">— tidak ada —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={submit}
            disabled={busy || !title.trim()}
            className="mt-1 h-10 w-full rounded-md bg-primary font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
