"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Loader2, RefreshCw, ChevronDown, ChevronRight, Brain, Flame, Thermometer, Snowflake } from "lucide-react";

type ProfileContent = {
  karakter?: { tipe?: string; deskripsi?: string };
  motivasi?: { alasan_utama?: string; urgensi?: string; deskripsi?: string };
  profil_pasien?: { pengalaman?: string; estimasi_usia?: string; domisili?: string };
  kesiapan_finansial?: { level?: string; preferensi_paket?: string; deskripsi?: string };
  pengambilan_keputusan?: { pengambil?: string; faktor_utama?: string[]; deskripsi?: string };
  keberatan?: { poin?: string[]; deskripsi?: string };
  kesiapan_closing?: { level?: string; skor?: number; alasan?: string };
  rekomendasi?: { pendekatan?: string; hindari?: string; waktu_follow_up?: string; catatan_tambahan?: string };
};

type Profile = {
  id: string;
  createdAt: string;
  content: ProfileContent;
};

function ClosingBadge({ level }: { level?: string }) {
  if (!level) return null;
  const l = level.toLowerCase();
  if (l === "hot") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
      <Flame className="h-3 w-3" /> Hot
    </span>
  );
  if (l === "warm") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
      <Thermometer className="h-3 w-3" /> Warm
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
      <Snowflake className="h-3 w-3" /> Cold
    </span>
  );
}

function ScoreBar({ skor }: { skor?: number }) {
  const s = Math.max(0, Math.min(10, skor ?? 0));
  const color = s >= 7 ? "bg-red-500" : s >= 4 ? "bg-amber-400" : "bg-blue-400";
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${s * 10}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums">{s}/10</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value || value === "Belum dapat disimpulkan") return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground w-28">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ProfileView({ p }: { p: Profile }) {
  const c = p.content;
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
    });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground text-right">{fmtDate(p.createdAt)}</p>

      {/* Kesiapan Closing — paling penting, di atas */}
      {c.kesiapan_closing && (
        <Section title="Kesiapan Closing">
          <div className="flex items-center justify-between">
            <ClosingBadge level={c.kesiapan_closing.level} />
            <ScoreBar skor={c.kesiapan_closing.skor} />
          </div>
          {c.kesiapan_closing.alasan && (
            <p className="text-sm text-muted-foreground mt-1">{c.kesiapan_closing.alasan}</p>
          )}
        </Section>
      )}

      {/* Karakter */}
      {c.karakter && (
        <Section title="Karakter Komunikasi">
          {c.karakter.tipe && (
            <span className="inline-block rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-semibold">
              {c.karakter.tipe}
            </span>
          )}
          {c.karakter.deskripsi && <p className="text-sm text-muted-foreground">{c.karakter.deskripsi}</p>}
        </Section>
      )}

      {/* Motivasi */}
      {c.motivasi && (
        <Section title="Motivasi & Niat">
          <Row label="Alasan utama" value={c.motivasi.alasan_utama} />
          <Row label="Urgensi" value={c.motivasi.urgensi} />
          {c.motivasi.deskripsi && <p className="text-sm text-muted-foreground">{c.motivasi.deskripsi}</p>}
        </Section>
      )}

      {/* Profil pasien */}
      {c.profil_pasien && (
        <Section title="Profil Pasien">
          <Row label="Pengalaman" value={c.profil_pasien.pengalaman} />
          <Row label="Est. usia" value={c.profil_pasien.estimasi_usia} />
          <Row label="Domisili" value={c.profil_pasien.domisili} />
        </Section>
      )}

      {/* Kesiapan finansial */}
      {c.kesiapan_finansial && (
        <Section title="Kesiapan Finansial">
          <Row label="Status" value={c.kesiapan_finansial.level} />
          <Row label="Preferensi" value={c.kesiapan_finansial.preferensi_paket} />
          {c.kesiapan_finansial.deskripsi && <p className="text-sm text-muted-foreground">{c.kesiapan_finansial.deskripsi}</p>}
        </Section>
      )}

      {/* Pengambilan keputusan */}
      {c.pengambilan_keputusan && (
        <Section title="Pengambilan Keputusan">
          <Row label="Pengambil" value={c.pengambilan_keputusan.pengambil} />
          {(c.pengambilan_keputusan.faktor_utama ?? []).length > 0 && (
            <div className="flex gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground w-28">Faktor utama</span>
              <div className="flex flex-wrap gap-1">
                {c.pengambilan_keputusan.faktor_utama!.map((f, i) => (
                  <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs">{f}</span>
                ))}
              </div>
            </div>
          )}
          {c.pengambilan_keputusan.deskripsi && <p className="text-sm text-muted-foreground">{c.pengambilan_keputusan.deskripsi}</p>}
        </Section>
      )}

      {/* Keberatan */}
      {c.keberatan && (
        <Section title="Keberatan Utama">
          {(c.keberatan.poin ?? []).length > 0 && (
            <ul className="space-y-1">
              {c.keberatan.poin!.map((p, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                  {p}
                </li>
              ))}
            </ul>
          )}
          {c.keberatan.deskripsi && <p className="text-sm text-muted-foreground">{c.keberatan.deskripsi}</p>}
        </Section>
      )}

      {/* Rekomendasi */}
      {c.rekomendasi && (
        <Section title="Rekomendasi untuk Agent">
          {c.rekomendasi.pendekatan && (
            <div>
              <p className="text-xs font-medium text-emerald-700 mb-0.5">Pendekatan terbaik</p>
              <p className="text-sm">{c.rekomendasi.pendekatan}</p>
            </div>
          )}
          {c.rekomendasi.hindari && (
            <div>
              <p className="text-xs font-medium text-red-600 mb-0.5">Hindari</p>
              <p className="text-sm">{c.rekomendasi.hindari}</p>
            </div>
          )}
          {c.rekomendasi.waktu_follow_up && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">Follow up</p>
              <p className="text-sm">{c.rekomendasi.waktu_follow_up}</p>
            </div>
          )}
          {c.rekomendasi.catatan_tambahan && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">Catatan tambahan</p>
              <p className="text-sm">{c.rekomendasi.catatan_tambahan}</p>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function HistoryItem({ p }: { p: Profile }) {
  const [open, setOpen] = useState(false);
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta",
    });
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 text-left"
      >
        <span className="text-sm font-medium">{fmtDate(p.createdAt)}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="p-3 space-y-2 bg-background">
          <ProfileView p={p} />
        </div>
      )}
    </div>
  );
}

type Props = {
  customerId: string;
  customerName: string;
  onClose: () => void;
};

export function AudienceProfilePanel({ customerId, customerName, onClose }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/customers/${customerId}/profile`);
    if (res.ok) {
      const d = await res.json();
      setProfiles(d.profiles ?? []);
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/customers/${customerId}/profile`, { method: "POST" });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Gagal generate profil");
    } else {
      await load();
    }
    setGenerating(false);
  }

  const latest   = profiles[0] ?? null;
  const history  = profiles.slice(1);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Profiling Audience</p>
              <p className="truncate font-semibold text-sm max-w-[180px]">{customerName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Generate button */}
          <button
            onClick={generate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
          >
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sedang generate profil...</>
            ) : (
              <><RefreshCw className="h-4 w-4" /> {latest ? "Update Profiling Audience" : "Generate Profiling Audience"}</>
            )}
          </button>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : profiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <Brain className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Belum ada profil untuk lead ini.</p>
              <p className="text-xs text-muted-foreground">Klik tombol di atas untuk generate profil pertama.</p>
            </div>
          ) : (
            <>
              {/* Latest profile */}
              <ProfileView p={latest!} />

              {/* History */}
              {history.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Riwayat Profil Sebelumnya</p>
                  {history.map((p) => <HistoryItem key={p.id} p={p} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
