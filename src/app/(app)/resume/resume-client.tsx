"use client";

import { useState, useEffect, useCallback } from "react";
import { BrainCircuit, RefreshCw, AlertCircle, Clock, Users, TrendingDown, ShoppingBag, Swords, DollarSign, UserX, CalendarClock, MessageSquareWarning, Smile, Lightbulb, Zap, History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";

type Channel = { id: string; label: string; phoneNumberId: string; displayPhone: string | null };

type ResumeResult = {
  pertanyaanSering: string[];
  requestUmum: string[];
  objeksiUmum: string[];
  produkDitanyakan: string[];
  kompetitor: string[];
  rangeBudget: string[];
  dropOffReasons: string[];
  leadMintaNanti: { nama: string; alasan: string }[];
  tidakTerjawab: string[];
  sentimen: { positif: number; netral: number; negatif: number };
  polaPenting: string[];
  rekomendasiAction: string[];
};

type ResumeEntry = {
  id: string;
  channelId: string | null;
  period: string;
  totalConvs: number;
  generatedAt: string;
  result: ResumeResult;
};

const PERIODS = [
  { value: "today", label: "Hari Ini" },
  { value: "7d", label: "7 Hari" },
  { value: "30d", label: "30 Hari" },
];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
}

function Section({ icon, title, items, color }: { icon: React.ReactNode; title: string; items: string[]; color: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className={`mb-2 flex items-center gap-2 text-sm font-semibold ${color}`}>
        {icon}
        {title}
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-40" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResumeClient({ channels }: { channels: Channel[] }) {
  const [channelId, setChannelId] = useState<string>("");
  const [period, setPeriod] = useState("7d");
  const [history, setHistory] = useState<ResumeEntry[]>([]);
  const [selected, setSelected] = useState<ResumeEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(null);
    const r = await fetch(`/api/resume?channelId=${channelId}&period=${period}`);
    if (r.ok) {
      const d = await r.json();
      const hist: ResumeEntry[] = d.history ?? [];
      setHistory(hist);
      setSelected(hist[0] ?? null);
    }
    setLoading(false);
  }, [channelId, period]);

  useEffect(() => { void load(); }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    const r = await fetch("/api/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: channelId || null, period }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error ?? "Gagal generate. Coba lagi.");
    } else {
      const newEntry: ResumeEntry = d.cached;
      setHistory((prev) => [newEntry, ...prev]);
      setSelected(newEntry);
    }
    setGenerating(false);
  }

  const res = selected?.result;
  const totalSentimen = res ? (res.sentimen.positif + res.sentimen.netral + res.sentimen.negatif) : 0;

  return (
    <>
      <PageHeader
        title="Resume Percakapan AI"
        description="Analisis pola percakapan lead per channel untuk evaluasi harian"
      />
      <div className="p-6 space-y-5">
        {/* Filter */}
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Channel</label>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
              >
                <option value="">Semua Channel</option>
                {channels.map((c) => (
                  <option key={c.phoneNumberId} value={c.phoneNumberId}>
                    {c.label} {c.displayPhone ? `(${c.displayPhone})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Periode</label>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPeriod(p.value)}
                    className={`px-3 py-1.5 text-sm transition ${period === p.value ? "bg-primary text-white" : "bg-white text-foreground hover:bg-muted"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={generate}
              disabled={generating || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
              {generating ? "Menganalisis..." : selected ? "Refresh Analisis" : "Analisis Sekarang"}
            </button>
          </div>
        </Card>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="py-16 text-center text-sm text-muted-foreground">Memuat...</div>
        )}

        {!loading && history.length === 0 && !error && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <BrainCircuit className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Belum ada analisis untuk channel & periode ini.</p>
            <p className="text-xs text-muted-foreground">Klik "Analisis Sekarang" untuk mulai.</p>
          </div>
        )}

        {/* Panel Riwayat */}
        {!loading && history.length > 0 && (
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="h-4 w-4 text-muted-foreground" />
              Riwayat Analisis
            </div>
            <div className="flex flex-wrap gap-2">
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setSelected(entry)}
                  className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                    selected?.id === entry.id
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border bg-white text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  <div>{fmtTime(entry.generatedAt)}</div>
                  <div className="text-[10px] opacity-70">{entry.totalConvs} percakapan</div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {selected && res && (
          <>
            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Dianalisis: {fmtTime(selected.generatedAt)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {selected.totalConvs} percakapan
              </span>
            </div>

            {/* Sentimen Overview */}
            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Smile className="h-4 w-4 text-yellow-500" />
                Sentimen Percakapan
              </div>
              <div className="flex gap-4">
                {[
                  { label: "Positif", val: res.sentimen.positif, color: "bg-green-500", text: "text-green-700" },
                  { label: "Netral", val: res.sentimen.netral, color: "bg-gray-400", text: "text-gray-600" },
                  { label: "Negatif", val: res.sentimen.negatif, color: "bg-red-400", text: "text-red-700" },
                ].map((s) => (
                  <div key={s.label} className="flex-1">
                    <div className={`text-lg font-bold ${s.text}`}>{s.val}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className={`h-full ${s.color}`} style={{ width: totalSentimen > 0 ? `${Math.round(s.val / totalSentimen * 100)}%` : "0%" }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Grid 2 kolom */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4 space-y-1">
                <Section icon={<MessageSquareWarning className="h-4 w-4" />} title="Pertanyaan yang Sering Muncul" items={res.pertanyaanSering} color="text-blue-600" />
              </Card>
              <Card className="p-4">
                <Section icon={<ShoppingBag className="h-4 w-4" />} title="Permintaan / Request Umum" items={res.requestUmum} color="text-violet-600" />
              </Card>
              <Card className="p-4">
                <Section icon={<Swords className="h-4 w-4" />} title="Objeksi yang Sering Muncul" items={res.objeksiUmum} color="text-orange-600" />
              </Card>
              <Card className="p-4">
                <Section icon={<ShoppingBag className="h-4 w-4" />} title="Produk / Paket yang Ditanyakan" items={res.produkDitanyakan} color="text-teal-600" />
              </Card>
              <Card className="p-4">
                <Section icon={<DollarSign className="h-4 w-4" />} title="Range Budget Lead" items={res.rangeBudget} color="text-green-600" />
              </Card>
              <Card className="p-4">
                <Section icon={<Swords className="h-4 w-4" />} title="Kompetitor yang Disebutkan" items={res.kompetitor} color="text-red-600" />
              </Card>
              <Card className="p-4">
                <Section icon={<TrendingDown className="h-4 w-4" />} title="Alasan Drop-off / Tidak Jadi" items={res.dropOffReasons} color="text-rose-600" />
              </Card>
              <Card className="p-4">
                <Section icon={<AlertCircle className="h-4 w-4" />} title="Pertanyaan Tidak Terjawab Baik" items={res.tidakTerjawab} color="text-amber-600" />
              </Card>
            </div>

            {/* Lead minta nanti */}
            {res.leadMintaNanti && res.leadMintaNanti.length > 0 && (
              <Card className="p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-600">
                  <CalendarClock className="h-4 w-4" />
                  Lead yang Minta Ditunda / Follow Up Nanti
                </div>
                <div className="space-y-2">
                  {res.leadMintaNanti.map((l, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg bg-indigo-50 px-3 py-2">
                      <UserX className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                      <div>
                        <div className="text-sm font-medium text-indigo-800">{l.nama}</div>
                        <div className="text-xs text-indigo-600">{l.alasan}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Pola penting */}
            {res.polaPenting && res.polaPenting.length > 0 && (
              <Card className="p-4">
                <Section icon={<Lightbulb className="h-4 w-4" />} title="Pola Penting Lainnya" items={res.polaPenting} color="text-yellow-600" />
              </Card>
            )}

            {/* Rekomendasi aksi */}
            {res.rekomendasiAction && res.rekomendasiAction.length > 0 && (
              <Card className="p-4 border-primary/30 bg-primary/5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                  <Zap className="h-4 w-4" />
                  Rekomendasi Aksi untuk Tim Sales
                </div>
                <ol className="space-y-2">
                  {res.rekomendasiAction.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">{i + 1}</span>
                      {item}
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
