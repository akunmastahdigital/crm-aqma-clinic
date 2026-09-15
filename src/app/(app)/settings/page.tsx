"use client";
import { useState, useEffect } from "react";
import { Save, FlaskConical, CheckCircle, XCircle, Plug, Users, Bell, X } from "lucide-react";

const TABS = [
  { key: "integrasi", label: "Integrasi", icon: Plug },
  { key: "performa", label: "Performa Tim", icon: Users },
  { key: "notifikasi", label: "Notifikasi", icon: Bell },
];

export default function SettingsPage() {
  const [tab, setTab] = useState("integrasi");

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Pengaturan</h1>
      <p className="text-sm text-muted-foreground mb-5">Konfigurasi sistem dan aturan tim</p>

      <div className="flex gap-1 border-b mb-6">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "integrasi" && <IntegrasiTab />}
      {tab === "performa" && <PerformaTab />}
      {tab === "notifikasi" && <NotifikasiTab />}
    </div>
  );
}

function IntegrasiTab() {
  const [pixelName, setPixelName] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; response: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/capi").then(r => r.json()).then(d => {
      setPixelName(d.pixelName ?? "");
      setPixelId(d.pixelId ?? "");
      setAccessToken(d.accessToken ?? "");
    });
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/settings/capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pixelName, pixelId, accessToken }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    const r = await fetch("/api/settings/capi", { method: "PUT" });
    const d = await r.json();
    setTestResult(d);
    setTesting(false);
  }

  const field = "h-9 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary font-mono";

  return (
    <div className="rounded-lg border p-5 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-blue-600"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        </div>
        <div>
          <p className="font-medium text-sm">Meta Conversions API (CAPI)</p>
          <p className="text-xs text-muted-foreground">Kirim event Lead & Purchase langsung ke Meta dari server</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nama Pixel</label>
          <input className={field + " mt-1 font-sans"} value={pixelName} onChange={e => setPixelName(e.target.value)} placeholder="misal: Aqma Clinic X Meta Ads" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pixel ID</label>
          <input className={field + " mt-1"} value={pixelId} onChange={e => setPixelId(e.target.value)} placeholder="1234567890123456" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Access Token</label>
          <input className={field + " mt-1"} type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="EAA..." />
          <p className="text-xs text-muted-foreground mt-1">Buat di Meta Events Manager → Settings → Conversions API</p>
        </div>
      </div>

      {testResult && (
        <div className={`rounded-md p-3 text-xs font-mono ${testResult.status === "sent" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
          <div className="flex items-center gap-1 font-semibold mb-1">
            {testResult.status === "sent" ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {testResult.status === "sent" ? "Berhasil terhubung ke Meta" : "Gagal: " + testResult.status}
          </div>
          <div className="opacity-70 break-all">{testResult.response}</div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          <Save className="w-3.5 h-3.5" />
          {saving ? "Menyimpan..." : saved ? "Tersimpan!" : "Simpan"}
        </button>
        <button onClick={test} disabled={testing || !pixelId || !accessToken} className="flex items-center gap-1.5 h-9 px-4 rounded-md border text-sm font-medium hover:bg-muted disabled:opacity-40">
          <FlaskConical className="w-3.5 h-3.5" />
          {testing ? "Mengirim..." : "Test Kirim Event"}
        </button>
      </div>
    </div>
  );
}

function PerformaTab() {
  const [minIncoming, setMinIncoming] = useState(5);
  const [minReplies, setMinReplies] = useState(5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/performance").then(r => r.json()).then(d => {
      setMinIncoming(d.secondaryMinIncoming ?? 5);
      setMinReplies(d.secondaryMinReplies ?? 5);
      setLoading(false);
    });
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/settings/performance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secondaryMinIncoming: minIncoming, secondaryMinReplies: minReplies }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <div className="text-sm text-muted-foreground">Memuat...</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border p-5 space-y-5">
        <div>
          <p className="font-medium text-sm">Syarat Secondary Assignee</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Agent berstatus PENDING naik ke SECONDARY setelah memenuhi kedua syarat di bawah,
            dihitung sejak agent pertama kali ikut balas di conversation tersebut.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-md border p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">Pesan masuk dari lead</p>
              <p className="text-xs text-muted-foreground">Minimal berapa pesan yang dikirim lead</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={20}
                value={minIncoming}
                onChange={e => setMinIncoming(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="w-8 text-center text-sm font-semibold tabular-nums">{minIncoming}</span>
            </div>
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">Balasan dari agent</p>
              <p className="text-xs text-muted-foreground">Minimal berapa kali agent membalas</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={20}
                value={minReplies}
                onChange={e => setMinReplies(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="w-8 text-center text-sm font-semibold tabular-nums">{minReplies}</span>
            </div>
          </div>
        </div>

        <div className="rounded-md bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
          Dengan pengaturan saat ini: agent yang ikut handle conversation akan naik ke Secondary
          setelah lead mengirim <strong className="text-foreground">{minIncoming} pesan</strong> dan
          agent membalas <strong className="text-foreground">{minReplies} kali</strong> sejak bergabung.
          Secondary assignee mendapat kredit closing di halaman Analitik.
        </div>

        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          <Save className="w-3.5 h-3.5" />
          {saving ? "Menyimpan..." : saved ? "Tersimpan!" : "Simpan"}
        </button>
      </div>
    </div>
  );
}

function NotifikasiTab() {
  const [threshold, setThreshold] = useState(3);
  const [excludeTags, setExcludeTags] = useState<string[]>(["Drop"]);
  const [excludeFailClose, setExcludeFailClose] = useState(true);
  const [allTags, setAllTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/performance").then(r => r.json()),
      fetch("/api/lead-tags").then(r => r.json()),
    ]).then(([perf, tags]) => {
      setThreshold(perf.overdueThresholdMinutes ?? 3);
      setExcludeTags(perf.overdueExcludeTags ?? ["Drop"]);
      setExcludeFailClose(perf.overdueExcludeFailClose ?? true);
      setAllTags(tags.tags ?? []);
      setLoading(false);
    });
  }, []);

  function addTag(name: string) {
    if (!name || excludeTags.includes(name)) return;
    setExcludeTags([...excludeTags, name]);
  }

  function removeTag(tag: string) {
    setExcludeTags(excludeTags.filter(t => t !== tag));
  }

  async function save() {
    setSaving(true);
    await fetch("/api/settings/performance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overdueThresholdMinutes: threshold, overdueExcludeTags: excludeTags, overdueExcludeFailClose: excludeFailClose }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <div className="text-sm text-muted-foreground">Memuat...</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border p-5 space-y-5">
        <div>
          <p className="font-medium text-sm">Pop-up Notifikasi Chat Belum Dibalas</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Atur kapan pop-up muncul dan lead mana yang dikecualikan dari notifikasi.
          </p>
        </div>

        {/* Threshold */}
        <div className="rounded-md border p-4 space-y-3">
          <div>
            <p className="text-sm font-medium">Threshold waktu belum dibalas</p>
            <p className="text-xs text-muted-foreground">Pop-up muncul jika lead belum dibalas selama ini</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={30}
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="w-20 text-center text-sm font-semibold tabular-nums">{threshold} menit</span>
          </div>
        </div>

        {/* Exclude labels */}
        <div className="rounded-md border p-4 space-y-3">
          <div>
            <p className="text-sm font-medium">Label yang dikecualikan</p>
            <p className="text-xs text-muted-foreground">Lead dengan label ini tidak akan memunculkan pop-up notifikasi</p>
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-8">
            {excludeTags.map(tag => {
              const meta = allTags.find(t => t.name === tag);
              return (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
                  style={{ backgroundColor: meta?.color ?? "#6366f1" }}
                >
                  {tag}
                  <button onClick={() => removeTag(tag)} className="opacity-70 hover:opacity-100">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            {excludeTags.length === 0 && (
              <span className="text-xs text-muted-foreground italic">Belum ada label dikecualikan</span>
            )}
          </div>
          {allTags.filter(t => !excludeTags.includes(t.name)).length > 0 && (
            <select
              defaultValue=""
              onChange={e => { if (e.target.value) { addTag(e.target.value); e.target.value = ""; } }}
              className="h-9 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary bg-white"
            >
              <option value="" disabled>+ Pilih label untuk dikecualikan...</option>
              {allTags
                .filter(t => !excludeTags.includes(t.name))
                .map(t => (
                  <option key={t.id} value={t.name}>{t.name}</option>
                ))}
            </select>
          )}
          {allTags.length === 0 && (
            <p className="text-xs text-muted-foreground">Belum ada label. Buat dulu di menu Pengaturan CRM.</p>
          )}
        </div>

        {/* Exclude fail close */}
        <div className="rounded-md border p-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setExcludeFailClose(!excludeFailClose)}
              className={`relative h-5 w-9 rounded-full transition-colors ${excludeFailClose ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${excludeFailClose ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <div>
              <p className="text-sm font-medium">Kecualikan lead gagal closing</p>
              <p className="text-xs text-muted-foreground">Lead yang sudah dicatat gagal closing tidak memunculkan pop-up</p>
            </div>
          </label>
        </div>

        <div className="rounded-md bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
          Dengan pengaturan ini: pop-up muncul jika lead belum dibalas lebih dari <strong className="text-foreground">{threshold} menit</strong>
          {excludeTags.length > 0 && <>, kecuali yang berlabel <strong className="text-foreground">{excludeTags.join(", ")}</strong></>}
          {excludeFailClose && <> dan lead yang sudah dicatat gagal closing</>}.
        </div>

        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          <Save className="w-3.5 h-3.5" />
          {saving ? "Menyimpan..." : saved ? "Tersimpan!" : "Simpan"}
        </button>
      </div>
    </div>
  );
}
