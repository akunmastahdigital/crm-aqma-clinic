"use client";

import { useState } from "react";
import {
  Building2, DoorOpen, UserCog, Wrench, Sparkles, Plus, Trash2, Pencil,
  X, Loader2, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

type Hours = { open: boolean; start: string; end: string }[];

type Branch = {
  id: string; name: string; address: string | null; phone: string | null;
  timezone: string; openingHours: Hours | null; isActive: boolean;
  _count: { resources: number };
};
type ResourceType = "STAFF" | "ROOM" | "EQUIPMENT";
type Resource = {
  id: string; name: string; type: ResourceType; capacity: number;
  tags: string[]; isActive: boolean;
  branch: { id: string; name: string };
  user: { id: string; name: string } | null;
};
type Requirement = {
  id?: string; resourceType: ResourceType; tag: string | null; quantity: number;
};
type Treatment = {
  id: string; name: string; durationMinutes: number; bufferMinutes: number;
  price: number | null; note: string | null; isActive: boolean;
  category: { id: string; name: string } | null;
  requirements: Requirement[];
};

const TYPE_LABEL: Record<ResourceType, string> = {
  STAFF: "Dokter / Terapis",
  ROOM: "Ruang Tindakan",
  EQUIPMENT: "Alat",
};
const TYPE_ICON: Record<ResourceType, typeof UserCog> = {
  STAFF: UserCog,
  ROOM: DoorOpen,
  EQUIPMENT: Wrench,
};

const DEFAULT_HOURS: Hours = [
  { open: false, start: "09:00", end: "17:00" },
  { open: true, start: "09:00", end: "19:00" },
  { open: true, start: "09:00", end: "19:00" },
  { open: true, start: "09:00", end: "19:00" },
  { open: true, start: "09:00", end: "19:00" },
  { open: true, start: "09:00", end: "19:00" },
  { open: true, start: "09:00", end: "17:00" },
];

const input =
  "h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary";
const label = "text-xs font-medium uppercase tracking-wide text-muted-foreground";
const btnPrimary =
  "inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50";
const btnGhost =
  "inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted";

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function durasi(menit: number) {
  if (menit < 60) return `${menit} menit`;
  const j = Math.floor(menit / 60);
  const m = menit % 60;
  return m ? `${j} jam ${m} menit` : `${j} jam`;
}

export function KlinikClient({
  initialBranches, initialResources, initialTreatments, categories, staffUsers, readOnly,
}: {
  initialBranches: Branch[];
  initialResources: Resource[];
  initialTreatments: Treatment[];
  categories: { id: string; name: string }[];
  staffUsers: { id: string; name: string }[];
  readOnly: boolean;
}) {
  const [tab, setTab] = useState<"cabang" | "sumberdaya" | "treatment">("cabang");
  const [branches, setBranches] = useState(initialBranches);
  const [resources, setResources] = useState(initialResources);
  const [treatments, setTreatments] = useState(initialTreatments);
  const [err, setErr] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    setErr(null);
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(d.error ?? "Gagal menyimpan");
      return null;
    }
    return d;
  }

  const TABS = [
    { key: "cabang" as const, label: "Cabang", icon: Building2, count: branches.length },
    { key: "sumberdaya" as const, label: "Sumber Daya", icon: DoorOpen, count: resources.length },
    { key: "treatment" as const, label: "Treatment", icon: Sparkles, count: treatments.length },
  ];

  return (
    <div className="p-6 space-y-5">
      {readOnly && (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-2 text-sm text-warning">
          Akun ini hanya dapat melihat. Semua perubahan tidak akan tersimpan.
        </div>
      )}

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger">
          <span className="flex-1">{err}</span>
          <button onClick={() => setErr(null)} aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-accent text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {tab === "cabang" && (
        <TabCabang
          branches={branches} setBranches={setBranches} call={call} readOnly={readOnly}
        />
      )}
      {tab === "sumberdaya" && (
        <TabSumberDaya
          resources={resources} setResources={setResources} branches={branches}
          staffUsers={staffUsers} call={call} readOnly={readOnly}
        />
      )}
      {tab === "treatment" && (
        <TabTreatment
          treatments={treatments} setTreatments={setTreatments} categories={categories}
          call={call} readOnly={readOnly}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Cabang */

function TabCabang({
  branches, setBranches, call, readOnly,
}: {
  branches: Branch[];
  setBranches: (b: Branch[]) => void;
  call: (u: string, m: string, b?: unknown) => Promise<{ branch?: Branch } | null>;
  readOnly: boolean;
}) {
  const [form, setForm] = useState<{ id?: string; name: string; address: string; phone: string; hours: Hours } | null>(null);
  const [busy, setBusy] = useState(false);

  function openNew() {
    setForm({ name: "", address: "", phone: "", hours: structuredClone(DEFAULT_HOURS) });
  }
  function openEdit(b: Branch) {
    setForm({
      id: b.id, name: b.name, address: b.address ?? "", phone: b.phone ?? "",
      hours: b.openingHours ?? structuredClone(DEFAULT_HOURS),
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    const payload = {
      name: form.name,
      address: form.address || null,
      phone: form.phone || null,
      openingHours: form.hours,
    };
    const d = form.id
      ? await call(`/api/klinik/branches/${form.id}`, "PATCH", payload)
      : await call("/api/klinik/branches", "POST", payload);
    setBusy(false);
    if (!d?.branch) return;
    setBranches(
      form.id
        ? branches.map((b) => (b.id === form.id ? { ...b, ...d.branch! } : b))
        : [...branches, { ...d.branch, _count: { resources: 0 } }],
    );
    setForm(null);
  }

  async function hapus(b: Branch) {
    if (!confirm(`Hapus cabang "${b.name}"?`)) return;
    const d = await call(`/api/klinik/branches/${b.id}`, "DELETE");
    if (d) setBranches(branches.filter((x) => x.id !== b.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Jam operasional di sini jadi acuan slot jadwal. Sumber daya bisa punya jam sendiri.
        </p>
        {!readOnly && (
          <button onClick={openNew} className={btnPrimary}>
            <Plus className="h-4 w-4" /> Tambah Cabang
          </button>
        )}
      </div>

      {branches.length === 0 ? (
        <Kosong pesan="Belum ada cabang. Tambahkan minimal satu untuk mulai." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {branches.map((b) => (
            <div key={b.id} className="rounded-[var(--radius-lg)] border border-border bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{b.name}</p>
                  {b.address && <p className="mt-0.5 text-xs text-muted-foreground">{b.address}</p>}
                  {b.phone && <p className="text-xs text-muted-foreground">{b.phone}</p>}
                </div>
                {!readOnly && (
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => openEdit(b)} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Ubah">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => hapus(b)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" aria-label="Hapus">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(b.openingHours ?? []).map((h, i) =>
                  h.open ? (
                    <span key={i} className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent-foreground">
                      {HARI[i].slice(0, 3)} {h.start}–{h.end}
                    </span>
                  ) : (
                    <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {HARI[i].slice(0, 3)} tutup
                    </span>
                  ),
                )}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{b._count.resources} sumber daya</p>
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal title={form.id ? "Ubah Cabang" : "Tambah Cabang"} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <div>
              <label className={label}>Nama Cabang</label>
              <input className={input + " mt-1"} value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Aqma Clinic Pusat" />
            </div>
            <div>
              <label className={label}>Alamat</label>
              <input className={input + " mt-1"} value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className={label}>Telepon</label>
              <input className={input + " mt-1"} value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className={label}>Jam Operasional</label>
              <div className="mt-1 space-y-1.5">
                {form.hours.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <label className="flex w-24 items-center gap-2 text-sm">
                      <input type="checkbox" checked={h.open}
                        onChange={(e) => {
                          const hours = [...form.hours];
                          hours[i] = { ...h, open: e.target.checked };
                          setForm({ ...form, hours });
                        }} />
                      {HARI[i]}
                    </label>
                    <input type="time" value={h.start} disabled={!h.open}
                      onChange={(e) => {
                        const hours = [...form.hours];
                        hours[i] = { ...h, start: e.target.value };
                        setForm({ ...form, hours });
                      }}
                      className="h-8 rounded-md border border-input px-2 text-sm disabled:opacity-40" />
                    <span className="text-muted-foreground">–</span>
                    <input type="time" value={h.end} disabled={!h.open}
                      onChange={(e) => {
                        const hours = [...form.hours];
                        hours[i] = { ...h, end: e.target.value };
                        setForm({ ...form, hours });
                      }}
                      className="h-8 rounded-md border border-input px-2 text-sm disabled:opacity-40" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setForm(null)} className={btnGhost}>Batal</button>
              <button onClick={save} disabled={busy || !form.name.trim()} className={btnPrimary}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- Sumber Daya */

function TabSumberDaya({
  resources, setResources, branches, staffUsers, call, readOnly,
}: {
  resources: Resource[];
  setResources: (r: Resource[]) => void;
  branches: Branch[];
  staffUsers: { id: string; name: string }[];
  call: (u: string, m: string, b?: unknown) => Promise<{ resource?: Resource } | null>;
  readOnly: boolean;
}) {
  const [form, setForm] = useState<{
    id?: string; branchId: string; name: string; type: ResourceType;
    userId: string; tags: string; capacity: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  function openNew(type: ResourceType) {
    setForm({
      branchId: branches[0]?.id ?? "", name: "", type, userId: "", tags: "", capacity: 1,
    });
  }
  function openEdit(r: Resource) {
    setForm({
      id: r.id, branchId: r.branch.id, name: r.name, type: r.type,
      userId: r.user?.id ?? "", tags: r.tags.join(", "), capacity: r.capacity,
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    const payload = {
      branchId: form.branchId,
      name: form.name,
      type: form.type,
      userId: form.type === "STAFF" && form.userId ? form.userId : null,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      capacity: form.capacity,
    };
    const d = form.id
      ? await call(`/api/klinik/resources/${form.id}`, "PATCH", payload)
      : await call("/api/klinik/resources", "POST", payload);
    setBusy(false);
    if (!d?.resource) return;
    setResources(
      form.id
        ? resources.map((r) => (r.id === form.id ? d.resource! : r))
        : [...resources, d.resource],
    );
    setForm(null);
  }

  async function hapus(r: Resource) {
    if (!confirm(`Hapus "${r.name}"?`)) return;
    const d = await call(`/api/klinik/resources/${r.id}`, "DELETE");
    if (d) setResources(resources.filter((x) => x.id !== r.id));
  }

  if (branches.length === 0) {
    return <Kosong pesan="Tambahkan cabang dulu sebelum mengisi sumber daya." />;
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Ruangan, orang, dan alat diperlakukan sama: tidak bisa dipakai dua jadwal pada waktu
        yang sama. Alat yang jumlahnya terbatas cukup didaftarkan di sini — mis. mesin laser.
      </p>

      {(["STAFF", "ROOM", "EQUIPMENT"] as ResourceType[]).map((type) => {
        const list = resources.filter((r) => r.type === type);
        const Icon = TYPE_ICON[type];
        return (
          <div key={type}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="h-4 w-4 text-accent" />
                {TYPE_LABEL[type]}
                <span className="text-muted-foreground">({list.length})</span>
              </h3>
              {!readOnly && (
                <button onClick={() => openNew(type)} className={btnGhost}>
                  <Plus className="h-4 w-4" /> Tambah
                </button>
              )}
            </div>
            {list.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                Belum ada.
              </p>
            ) : (
              <div className="divide-y rounded-[var(--radius-lg)] border border-border bg-white">
                {list.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", !r.isActive && "text-muted-foreground line-through")}>
                        {r.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.branch.name}
                        {r.user && ` · akun: ${r.user.name}`}
                        {r.capacity > 1 && ` · kapasitas ${r.capacity}`}
                      </p>
                    </div>
                    {r.tags.length > 0 && (
                      <div className="hidden shrink-0 gap-1 sm:flex">
                        {r.tags.map((t) => (
                          <span key={t} className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent-foreground">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {!readOnly && (
                      <div className="flex shrink-0 gap-1">
                        <button onClick={() => openEdit(r)} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Ubah">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => hapus(r)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" aria-label="Hapus">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {form && (
        <Modal title={form.id ? "Ubah Sumber Daya" : `Tambah ${TYPE_LABEL[form.type]}`} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <div>
              <label className={label}>Nama</label>
              <input className={input + " mt-1"} value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={form.type === "ROOM" ? "Ruang Tindakan 1" : form.type === "EQUIPMENT" ? "Mesin Laser CO2" : "dr. Sarah"} />
            </div>
            <div>
              <label className={label}>Cabang</label>
              <select className={input + " mt-1"} value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            {form.type === "STAFF" && (
              <div>
                <label className={label}>Akun CRM (opsional)</label>
                <select className={input + " mt-1"} value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                  <option value="">— tidak ditautkan —</option>
                  {staffUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={label}>Kemampuan / Tag</label>
              <input className={input + " mt-1"} value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="laser, injeksi, facial" />
              <p className="mt-1 text-xs text-muted-foreground">
                Dipisah koma. Dipakai mencocokkan treatment dengan sumber daya yang tepat.
              </p>
            </div>
            <div>
              <label className={label}>Kapasitas</label>
              <input type="number" min={1} className={input + " mt-1"} value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Math.max(1, Number(e.target.value) || 1) })} />
              <p className="mt-1 text-xs text-muted-foreground">
                Berapa jadwal bisa jalan bersamaan. Hampir selalu 1.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setForm(null)} className={btnGhost}>Batal</button>
              <button onClick={save} disabled={busy || !form.name.trim() || !form.branchId} className={btnPrimary}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Treatment */

function TabTreatment({
  treatments, setTreatments, categories, call, readOnly,
}: {
  treatments: Treatment[];
  setTreatments: (t: Treatment[]) => void;
  categories: { id: string; name: string }[];
  call: (u: string, m: string, b?: unknown) => Promise<{ treatment?: Treatment } | null>;
  readOnly: boolean;
}) {
  const [form, setForm] = useState<{
    id?: string; name: string; categoryId: string; durationMinutes: number;
    bufferMinutes: number; price: string; note: string; requirements: Requirement[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  function openNew() {
    setForm({
      name: "", categoryId: "", durationMinutes: 60, bufferMinutes: 10,
      price: "", note: "", requirements: [{ resourceType: "ROOM", tag: null, quantity: 1 }],
    });
  }
  function openEdit(t: Treatment) {
    setForm({
      id: t.id, name: t.name, categoryId: t.category?.id ?? "",
      durationMinutes: t.durationMinutes, bufferMinutes: t.bufferMinutes,
      price: t.price != null ? String(t.price) : "", note: t.note ?? "",
      requirements: t.requirements.map((r) => ({
        resourceType: r.resourceType, tag: r.tag, quantity: r.quantity,
      })),
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    const payload = {
      name: form.name,
      categoryId: form.categoryId || null,
      durationMinutes: form.durationMinutes,
      bufferMinutes: form.bufferMinutes,
      price: form.price.trim() ? Number(form.price.replace(/\D/g, "")) : null,
      note: form.note || null,
      requirements: form.requirements,
    };
    const d = form.id
      ? await call(`/api/klinik/treatments/${form.id}`, "PATCH", payload)
      : await call("/api/klinik/treatments", "POST", payload);
    setBusy(false);
    if (!d?.treatment) return;
    setTreatments(
      form.id
        ? treatments.map((t) => (t.id === form.id ? d.treatment! : t))
        : [...treatments, d.treatment],
    );
    setForm(null);
  }

  async function hapus(t: Treatment) {
    if (!confirm(`Hapus treatment "${t.name}"?`)) return;
    const d = await call(`/api/klinik/treatments/${t.id}`, "DELETE");
    if (d) setTreatments(treatments.filter((x) => x.id !== t.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Durasi dan jeda menentukan panjang slot. Kebutuhan sumber daya menentukan
          jadwal mana yang boleh jalan bersamaan.
        </p>
        {!readOnly && (
          <button onClick={openNew} className={btnPrimary}>
            <Plus className="h-4 w-4" /> Tambah Treatment
          </button>
        )}
      </div>

      {treatments.length === 0 ? (
        <Kosong pesan="Belum ada treatment. Isi daftar layanan klinik di sini." />
      ) : (
        <div className="divide-y rounded-[var(--radius-lg)] border border-border bg-white">
          {treatments.map((t) => (
            <div key={t.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className={cn("font-medium", !t.isActive && "text-muted-foreground line-through")}>
                  {t.name}
                  {t.category && (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                      {t.category.name}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {durasi(t.durationMinutes)}
                    {t.bufferMinutes > 0 && ` + ${t.bufferMinutes} mnt jeda`}
                  </span>
                  {t.price != null && <span className="tnum">{rupiah(t.price)}</span>}
                </p>
                {t.requirements.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {t.requirements.map((r, i) => (
                      <span key={i} className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent-foreground">
                        {r.quantity}× {TYPE_LABEL[r.resourceType]}
                        {r.tag && ` (${r.tag})`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {!readOnly && (
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => openEdit(t)} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Ubah">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => hapus(t)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger" aria-label="Hapus">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal title={form.id ? "Ubah Treatment" : "Tambah Treatment"} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <div>
              <label className={label}>Nama Treatment</label>
              <input className={input + " mt-1"} value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Laser CO2" />
            </div>
            <div>
              <label className={label}>Kategori</label>
              <select className={input + " mt-1"} value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">— tanpa kategori —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Durasi (menit)</label>
                <input type="number" min={5} step={5} className={input + " mt-1"} value={form.durationMinutes}
                  onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className={label}>Jeda setelahnya (menit)</label>
                <input type="number" min={0} step={5} className={input + " mt-1"} value={form.bufferMinutes}
                  onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) || 0 })} />
              </div>
            </div>
            <div>
              <label className={label}>Harga satuan (opsional)</label>
              <input className={input + " mt-1 tnum"} value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, "") })}
                placeholder="350000" />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className={label}>Butuh Sumber Daya</label>
                <button
                  onClick={() => setForm({
                    ...form,
                    requirements: [...form.requirements, { resourceType: "STAFF", tag: null, quantity: 1 }],
                  })}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  + tambah
                </button>
              </div>
              <div className="mt-1 space-y-2">
                {form.requirements.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Belum ada. Tanpa ini, treatment dianggap tidak memakai sumber daya apa pun.
                  </p>
                )}
                {form.requirements.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="number" min={1} value={r.quantity}
                      onChange={(e) => {
                        const reqs = [...form.requirements];
                        reqs[i] = { ...r, quantity: Math.max(1, Number(e.target.value) || 1) };
                        setForm({ ...form, requirements: reqs });
                      }}
                      className="h-9 w-16 rounded-md border border-input px-2 text-sm" />
                    <select value={r.resourceType}
                      onChange={(e) => {
                        const reqs = [...form.requirements];
                        reqs[i] = { ...r, resourceType: e.target.value as ResourceType };
                        setForm({ ...form, requirements: reqs });
                      }}
                      className="h-9 flex-1 rounded-md border border-input bg-white px-2 text-sm">
                      {(["STAFF", "ROOM", "EQUIPMENT"] as ResourceType[]).map((t) => (
                        <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                      ))}
                    </select>
                    <input value={r.tag ?? ""} placeholder="tag (opsional)"
                      onChange={(e) => {
                        const reqs = [...form.requirements];
                        reqs[i] = { ...r, tag: e.target.value || null };
                        setForm({ ...form, requirements: reqs });
                      }}
                      className="h-9 w-32 rounded-md border border-input px-2 text-sm" />
                    <button
                      onClick={() => setForm({
                        ...form,
                        requirements: form.requirements.filter((_, j) => j !== i),
                      })}
                      className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      aria-label="Hapus kebutuhan"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setForm(null)} className={btnGhost}>Batal</button>
              <button onClick={save} disabled={busy || !form.name.trim() || form.durationMinutes < 5} className={btnPrimary}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- utils */

function Kosong({ pesan }: { pesan: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
      {pesan}
    </div>
  );
}

function Modal({
  title, children, onClose,
}: {
  title: string; children: React.ReactNode; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-primary-dark/40 p-4 py-10">
      <div className="w-full max-w-lg rounded-[var(--radius-lg)] border border-border bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
