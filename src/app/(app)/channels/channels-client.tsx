"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Smartphone, QrCode, Camera, MessageSquare, ExternalLink, RefreshCw, Plus, Trash2, X, Eye, EyeOff, ChevronDown, ChevronUp, Copy, CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type WabaChannel = { id: string; label: string; wabaId: string; phoneNumberId: string; displayPhone: string | null; active: boolean };
type QrStatus = { connected: boolean; qr: string | null; number: string | null; offline?: boolean; channelId: string };
type WaQrChannel = { id: string; label: string; port: number; phone: string | null; active: boolean };
type WabaHealth = {
  phoneNumberId: string; label: string; displayPhone: string | null;
  tier: string; tierLabel: string; tierValue: number;
  qualityRating: string; callingReady: boolean; error: string | null;
};
type MetaChannel = { id: string; type: "INSTAGRAM" | "MESSENGER"; label: string; pageId: string; igAccountId: string | null; active: boolean };

const TIER_STEPS = ["TIER_50", "TIER_250", "TIER_1K", "TIER_10K", "TIER_100K", "TIER_UNLIMITED"];
const WEBHOOK_URL = "https://crm.klinikaqma.com/api/webhooks/meta";

function QualityBadge({ rating }: { rating: string }) {
  if (rating === "GREEN") return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Kualitas Baik</span>;
  if (rating === "YELLOW") return <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">Perlu Perhatian</span>;
  if (rating === "RED") return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Kualitas Rendah</span>;
  return <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Tidak Diketahui</span>;
}

function TierBar({ tier }: { tier: string }) {
  const idx = TIER_STEPS.indexOf(tier);
  const pct = idx < 0 ? 10 : Math.round(((idx + 1) / TIER_STEPS.length) * 100);
  const color = idx <= 1 ? "bg-orange-400" : idx <= 3 ? "bg-blue-500" : "bg-green-500";
  return <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted"><div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} /></div>;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy} title="Salin" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
      {copied ? <CheckCheck className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ─── Form Tambah WABA ────────────────────────────────────────────────────────

type WabaFormState = { label: string; wabaId: string; phoneNumberId: string; accessToken: string; displayPhone: string };
const EMPTY_FORM: WabaFormState = { label: "", wabaId: "", phoneNumberId: "", accessToken: "", displayPhone: "" };

function AddWabaForm({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const [form, setForm] = useState<WabaFormState>(EMPTY_FORM);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof WabaFormState, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
    setError(null);
  }

  async function submit() {
    if (!form.label.trim() || !form.wabaId.trim() || !form.phoneNumberId.trim() || !form.accessToken.trim()) {
      setError("Label, WABA ID, Phone Number ID, dan Access Token wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/channels/waba-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Gagal menyimpan."); return; }
      onAdded();
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-primary/30 bg-primary-soft p-4 space-y-3">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>Tambah Nomor WABA Baru</span>
        <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
      </div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">{error}</div>}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Label *</label>
          <input type="text" placeholder="mis. Nomor Utama / CS Sales" value={form.label}
            onChange={(e) => set("label", e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Nomor Tampil (opsional)</label>
          <input type="text" placeholder="mis. +62 821-2298-599" value={form.displayPhone}
            onChange={(e) => set("displayPhone", e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">WABA ID *</label>
          <input type="text" placeholder="dari Meta Business Manager" value={form.wabaId}
            onChange={(e) => set("wabaId", e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary font-mono text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone Number ID *</label>
          <input type="text" placeholder="dari Meta → WhatsApp → Phone Numbers" value={form.phoneNumberId}
            onChange={(e) => set("phoneNumberId", e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary font-mono text-xs" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Access Token (Permanent) *</label>
          <div className="relative">
            <input type={showToken ? "text" : "password"} placeholder="EAAxxxxxxxx..." value={form.accessToken}
              onChange={(e) => set("accessToken", e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-primary font-mono text-xs" />
            <button type="button" onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Gunakan Permanent Token dari System User di Meta Business Manager, bukan token sementara.</p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Batal</button>
        <button onClick={submit} disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition-all">
          {saving ? "Menyimpan..." : "Simpan"}
        </button>
      </div>
    </div>
  );
}

// ─── Form Tambah MetaChannel (IG / Messenger) ────────────────────────────────

function AddMetaForm({ type, onAdded, onClose }: { type: "INSTAGRAM" | "MESSENGER"; onAdded: () => void; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [pageId, setPageId] = useState("");
  const [igAccountId, setIgAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!label.trim() || !pageId.trim() || !accessToken.trim()) {
      setError("Label, Page ID, dan Access Token wajib diisi.");
      return;
    }
    if (type === "INSTAGRAM" && !igAccountId.trim()) {
      setError("IG Account ID wajib diisi untuk Instagram.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/channels/meta-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, label: label.trim(), pageId: pageId.trim(), igAccountId: igAccountId.trim() || null, pageAccessToken: accessToken.trim() }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Gagal menyimpan."); return; }
      onAdded();
      onClose();
    } finally { setSaving(false); }
  }

  const isIG = type === "INSTAGRAM";
  return (
    <div className="rounded-[var(--radius-lg)] border border-primary/30 bg-primary-soft p-4 space-y-3">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>Tambah {isIG ? "Instagram" : "Messenger"} Baru</span>
        <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
      </div>
      {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">{error}</div>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Label *</label>
          <input type="text" placeholder={isIG ? "mis. IG Aqma Clinic" : "mis. FB Page Aqma"} value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Facebook Page ID *</label>
          <input type="text" placeholder="dari Meta Business → Pages" value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary font-mono text-xs" />
        </div>
        {isIG && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Instagram Account ID *</label>
            <input type="text" placeholder="IG Business Account ID" value={igAccountId}
              onChange={(e) => setIgAccountId(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary font-mono text-xs" />
          </div>
        )}
        <div className={isIG ? "" : "sm:col-span-2"}>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Page Access Token *</label>
          <div className="relative">
            <input type={showToken ? "text" : "password"} placeholder="EAAxxxxxxxx..." value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-primary font-mono text-xs" />
            <button type="button" onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Batal</button>
        <button onClick={submit} disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition-all">
          {saving ? "Menyimpan..." : "Simpan"}
        </button>
      </div>
    </div>
  );
}

// ─── Card MetaChannel ────────────────────────────────────────────────────────

function MetaChannelCard({ channel, onDelete }: { channel: MetaChannel; onDelete: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [editingToken, setEditingToken] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleDelete() {
    if (!confirm(`Hapus "${channel.label}"? History chat tidak akan terhapus.`)) return;
    setDeleting(true);
    await fetch(`/api/channels/meta-channels/${channel.id}`, { method: "DELETE" });
    onDelete();
  }

  async function toggleActive() {
    await fetch(`/api/channels/meta-channels/${channel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !channel.active }),
    });
    onDelete();
  }

  async function saveToken() {
    if (!newToken.trim()) return;
    setSaving(true);
    await fetch(`/api/channels/meta-channels/${channel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageAccessToken: newToken.trim() }),
    });
    setSaving(false);
    setEditingToken(false);
    setNewToken("");
    onDelete();
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-white px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{channel.label}</div>
        <div className="text-xs text-muted-foreground font-mono truncate">Page ID: {channel.pageId}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ml-3">
        {channel.active
          ? <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"><Check className="h-3 w-3" /> Aktif</span>
          : <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Nonaktif</span>
        }
        <button onClick={toggleActive}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors">
          {channel.active ? "Nonaktifkan" : "Aktifkan"}
        </button>
        <button onClick={() => setEditingToken(!editingToken)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
          title="Update Token">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button onClick={handleDelete} disabled={deleting}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
          title="Hapus">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      </div>

      {editingToken && (
        <div className="border-t border-border pt-2 space-y-1.5">
          <p className="text-xs text-muted-foreground">Paste Page Access Token baru (dari Meta Business Manager → System User):</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input type={showToken ? "text" : "password"} placeholder="EAAxxxxxxxx..." value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-1.5 pr-8 text-xs outline-none focus:border-primary font-mono" autoFocus />
              <button type="button" onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <button onClick={saveToken} disabled={saving || !newToken.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50">
              {saving ? "..." : "Simpan"}
            </button>
            <button onClick={() => { setEditingToken(false); setNewToken(""); }}
              className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-muted">
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Card WABA per nomor ─────────────────────────────────────────────────────

function WabaChannelCard({ channel, health, onDelete }: {
  channel: WabaChannel;
  health: WabaHealth | null;
  onDelete: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function handleDelete() {
    if (!confirm(`Hapus nomor WABA "${channel.label}"? Data history chat tidak akan terhapus.`)) return;
    setDeleting(true);
    await fetch(`/api/channels/waba-channels/${channel.id}`, { method: "DELETE" });
    onDelete();
  }

  async function toggleActive() {
    await fetch(`/api/channels/waba-channels/${channel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !channel.active }),
    });
    onDelete();
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Smartphone className="h-4 w-4 shrink-0 text-success" />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{channel.label}</div>
            {channel.displayPhone && <div className="text-xs text-muted-foreground">{channel.displayPhone}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-3">
          {channel.active
            ? <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"><Check className="h-3 w-3" /> Aktif</span>
            : <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Nonaktif</span>
          }
          <button onClick={() => setExpanded(!expanded)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
            title="Detail">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
            title="Hapus">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">WABA ID</span>
            <span className="font-mono truncate">{channel.wabaId}</span>
            <span className="text-muted-foreground">Phone Number ID</span>
            <span className="font-mono truncate">{channel.phoneNumberId}</span>
          </div>
          {health && !health.error && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Batas pesan harian</span>
                <div className="flex items-center gap-2">
                  <QualityBadge rating={health.qualityRating} />
                  <span className="font-semibold text-foreground">{health.tierLabel}</span>
                </div>
              </div>
              <TierBar tier={health.tier} />
            </div>
          )}
          {health?.error && <div className="text-xs text-red-500">{health.error}</div>}
          <div className="flex justify-end">
            <button onClick={toggleActive}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
              {channel.active ? "Nonaktifkan" : "Aktifkan kembali"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Card WA QR ─────────────────────────────────────────────────────────────

function QrChannelCard({ channel, onDelete }: { channel: WaQrChannel; onDelete: () => void }) {
  const [status, setStatus] = useState<QrStatus | null>(null);
  const [deleting, setDeleting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    const r = await fetch(`/api/channels/wa-qr-channels/${channel.id}`);
    if (r.ok) setStatus(await r.json());
  }, [channel.id]);

  useEffect(() => {
    loadStatus();
    intervalRef.current = setInterval(loadStatus, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadStatus]);

  async function logout() {
    await fetch(`/api/channels/wa-qr-channels/${channel.id}`, { method: "POST" });
    loadStatus();
  }

  async function handleDelete() {
    if (!confirm(`Hapus "${channel.label}"? Koneksi WA akan diputus.`)) return;
    setDeleting(true);
    await fetch(`/api/channels/wa-qr-channels/${channel.id}`, { method: "DELETE" });
    onDelete();
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <QrCode className="h-4 w-4 text-primary" />
          {channel.label}
        </div>
        <button onClick={handleDelete} disabled={deleting}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
          title="Hapus nomor ini">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {!status ? (
        <div className="text-sm text-muted-foreground">Memuat...</div>
      ) : status.offline ? (
        <div className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">Worker belum aktif di server.</div>
      ) : status.connected ? (
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              <Check className="h-3.5 w-3.5" /> Tersambung
            </span>
            <span className="text-sm">+{status.number}</span>
          </div>
          <button onClick={logout} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Putuskan</button>
        </div>
      ) : status.qr ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={status.qr} alt="QR WhatsApp" className="h-52 w-52 rounded-lg border border-border" />
          <p className="max-w-sm text-sm text-muted-foreground">
            Buka WhatsApp → Setelan → Perangkat Tertaut → Tautkan Perangkat → scan QR ini.
          </p>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Menyiapkan koneksi... QR akan muncul sebentar lagi.</div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function ChannelsClient() {
  const [wabaChannels, setWabaChannels] = useState<WabaChannel[]>([]);
  const [qrChannels, setQrChannels] = useState<WaQrChannel[]>([]);
  const [metaChannels, setMetaChannels] = useState<MetaChannel[]>([]);
  const [verifyToken, setVerifyToken] = useState<string>("");
  const [health, setHealth] = useState<WabaHealth[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [showAddWaba, setShowAddWaba] = useState(false);
  const [showAddQr, setShowAddQr] = useState(false);
  const [showAddIG, setShowAddIG] = useState(false);
  const [showAddMsg, setShowAddMsg] = useState(false);
  const [newQrLabel, setNewQrLabel] = useState("");
  const [addingQr, setAddingQr] = useState(false);

  const loadWaba = useCallback(async () => {
    const r = await fetch("/api/channels/waba-channels");
    if (r.ok) setWabaChannels((await r.json()).channels);
  }, []);
  const loadQrChannels = useCallback(async () => {
    const r = await fetch("/api/channels/wa-qr-channels");
    if (r.ok) setQrChannels((await r.json()).channels);
  }, []);
  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const r = await fetch("/api/channels/waba-health");
      if (r.ok) setHealth((await r.json()).health);
    } finally { setHealthLoading(false); }
  }, []);
  const loadMeta = useCallback(async () => {
    const r = await fetch("/api/channels/meta-channels");
    if (r.ok) {
      const data = await r.json();
      setMetaChannels(data.channels ?? []);
      setVerifyToken(data.verifyToken ?? "");
    }
  }, []);

  useEffect(() => {
    loadWaba();
    loadQrChannels();
    loadHealth();
    loadMeta();
  }, [loadWaba, loadQrChannels, loadHealth, loadMeta]);

  function handleWabaAdded() {
    loadWaba();
    loadHealth();
  }

  async function addQrChannel() {
    if (!newQrLabel.trim()) return;
    setAddingQr(true);
    try {
      const r = await fetch("/api/channels/wa-qr-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newQrLabel.trim() }),
      });
      if (r.ok) {
        setNewQrLabel("");
        setShowAddQr(false);
        await loadQrChannels();
      }
    } finally { setAddingQr(false); }
  }

  const healthMap = Object.fromEntries(health.map((h) => [h.phoneNumberId, h]));
  const igChannels = metaChannels.filter((c) => c.type === "INSTAGRAM");
  const msgChannels = metaChannels.filter((c) => c.type === "MESSENGER");

  return (
    <>
      <PageHeader title="Channel" description="Sambungkan WhatsApp, Instagram, dan Messenger" />
      <div className="max-w-3xl space-y-6 p-6">

        {/* ── WABA Cloud API ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Smartphone className="h-4 w-4 text-success" /> WhatsApp (Cloud API resmi)
            </div>
            <div className="flex items-center gap-2">
              <a href="https://business.facebook.com/wa/manage/" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors">
                <ExternalLink className="h-3.5 w-3.5" /> Meta Manager
              </a>
              <button onClick={() => setShowAddWaba(true)}
                className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-primary px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 transition-all">
                <Plus className="h-3.5 w-3.5" /> Tambah Nomor
              </button>
            </div>
          </div>

          {showAddWaba && (
            <AddWabaForm onAdded={handleWabaAdded} onClose={() => setShowAddWaba(false)} />
          )}

          {wabaChannels.length > 0 && (
            <div className="flex justify-end">
              <button onClick={loadHealth} disabled={healthLoading}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">
                <RefreshCw className={`h-3 w-3 ${healthLoading ? "animate-spin" : ""}`} /> Perbarui info
              </button>
            </div>
          )}

          {wabaChannels.length === 0 && !showAddWaba ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-white p-5 text-center text-sm text-muted-foreground">
              Belum ada nomor WABA. Klik &ldquo;Tambah Nomor&rdquo; untuk menambahkan.
            </div>
          ) : (
            <div className="space-y-2">
              {wabaChannels.map((ch) => (
                <WabaChannelCard key={ch.id} channel={ch} health={healthMap[ch.phoneNumberId] ?? null} onDelete={handleWabaAdded} />
              ))}
            </div>
          )}
        </div>

        {/* ── WA QR / Nomor Biasa ───────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <QrCode className="h-4 w-4 text-primary" /> WhatsApp (mode QR / nomor biasa)
            </div>
            <button onClick={() => setShowAddQr(true)}
              className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-primary px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 transition-all">
              <Plus className="h-3.5 w-3.5" /> Tambah Nomor
            </button>
          </div>

          {showAddQr && (
            <div className="rounded-[var(--radius-lg)] border border-primary/30 bg-primary-soft p-4">
              <div className="mb-2 flex items-center justify-between text-sm font-medium">
                <span>Tambah Nomor WA Baru</span>
                <button onClick={() => { setShowAddQr(false); setNewQrLabel(""); }}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="Label nomor, mis. Nomor Utama / CS 1"
                  value={newQrLabel} onChange={(e) => setNewQrLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addQrChannel()}
                  className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                  autoFocus />
                <button onClick={addQrChannel} disabled={addingQr || !newQrLabel.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50 transition-all">
                  {addingQr ? "Menyiapkan..." : "Tambah"}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Setelah ditambah, QR akan muncul untuk di-scan dari HP.</p>
            </div>
          )}

          {qrChannels.length === 0 && !showAddQr ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-white p-5 text-center text-sm text-muted-foreground">
              Belum ada nomor WA biasa. Klik &ldquo;Tambah Nomor&rdquo; untuk memulai.
            </div>
          ) : (
            qrChannels.map((ch) => (
              <QrChannelCard key={ch.id} channel={ch} onDelete={loadQrChannels} />
            ))
          )}
        </div>

        {/* ── Instagram ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Camera className="h-4 w-4" style={{ color: "#d6249f" }} /> Instagram
            </div>
            <button onClick={() => setShowAddIG(true)}
              className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-primary px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 transition-all">
              <Plus className="h-3.5 w-3.5" /> Tambah Akun
            </button>
          </div>

          {/* Webhook info box */}
          {verifyToken && (
            <div className="rounded-[var(--radius-lg)] border border-border bg-blue-50 p-4 space-y-2 text-xs">
              <div className="font-semibold text-blue-800 mb-1">Konfigurasi Webhook di Meta Developer Console</div>
              <div>
                <span className="text-muted-foreground">Callback URL:</span>
                <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 font-mono">
                  <span className="flex-1 truncate text-foreground">{WEBHOOK_URL}</span>
                  <CopyButton value={WEBHOOK_URL} />
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Verify Token:</span>
                <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 font-mono">
                  <span className="flex-1 truncate text-foreground">{verifyToken}</span>
                  <CopyButton value={verifyToken} />
                </div>
              </div>
              <p className="text-muted-foreground">Paste kedua nilai ini ke Meta Developer → App → Instagram → Webhooks → &ldquo;Edit&rdquo;. Subscribe ke field: <strong>messages</strong> dan <strong>comments</strong>.</p>
            </div>
          )}

          {showAddIG && (
            <AddMetaForm type="INSTAGRAM" onAdded={loadMeta} onClose={() => setShowAddIG(false)} />
          )}

          {igChannels.length === 0 && !showAddIG ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-white p-5 text-center text-sm text-muted-foreground">
              Belum ada akun Instagram. Klik &ldquo;Tambah Akun&rdquo; untuk menghubungkan.
            </div>
          ) : (
            <div className="space-y-2">
              {igChannels.map((ch) => (
                <MetaChannelCard key={ch.id} channel={ch} onDelete={loadMeta} />
              ))}
            </div>
          )}
        </div>

        {/* ── Messenger ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <MessageSquare className="h-4 w-4" style={{ color: "#0084ff" }} /> Messenger / Facebook
            </div>
            <button onClick={() => setShowAddMsg(true)}
              className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-primary px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 transition-all">
              <Plus className="h-3.5 w-3.5" /> Tambah Page
            </button>
          </div>

          {/* Webhook info box — Messenger pakai webhook URL yang sama, verify token sama */}
          {verifyToken && (
            <div className="rounded-[var(--radius-lg)] border border-border bg-blue-50 p-4 space-y-2 text-xs">
              <div className="font-semibold text-blue-800 mb-1">Konfigurasi Webhook di Meta Developer Console</div>
              <div>
                <span className="text-muted-foreground">Callback URL:</span>
                <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 font-mono">
                  <span className="flex-1 truncate text-foreground">{WEBHOOK_URL}</span>
                  <CopyButton value={WEBHOOK_URL} />
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Verify Token:</span>
                <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 font-mono">
                  <span className="flex-1 truncate text-foreground">{verifyToken}</span>
                  <CopyButton value={verifyToken} />
                </div>
              </div>
              <p className="text-muted-foreground">Subscribe ke field: <strong>messages</strong> dan <strong>feed</strong> (untuk komentar). Gunakan webhook yang sama dengan Instagram — satu URL untuk semua.</p>
            </div>
          )}

          {showAddMsg && (
            <AddMetaForm type="MESSENGER" onAdded={loadMeta} onClose={() => setShowAddMsg(false)} />
          )}

          {msgChannels.length === 0 && !showAddMsg ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-white p-5 text-center text-sm text-muted-foreground">
              Belum ada Facebook Page. Klik &ldquo;Tambah Page&rdquo; untuk menghubungkan.
            </div>
          ) : (
            <div className="space-y-2">
              {msgChannels.map((ch) => (
                <MetaChannelCard key={ch.id} channel={ch} onDelete={loadMeta} />
              ))}
            </div>
          )}
        </div>

      </div>
    </>
  );
}
