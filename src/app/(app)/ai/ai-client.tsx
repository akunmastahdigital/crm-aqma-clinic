"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Send, Bot, Link2, CheckCircle2, XCircle, Loader2, Eye, ChevronUp, ChevronDown, GitBranch, Image as ImageIcon, X, Save, Clock } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const TABS = [
  { id: "general",   label: "Pengaturan Umum" },
  { id: "flow",      label: "Alur CS" },
  { id: "suggest",   label: "Saran Jawaban" },
  { id: "bridge",    label: "Koneksi Tanpa API Key" },
  { id: "hours",     label: "Jam Kerja" },
  { id: "escalation",label: "Eskalasi" },
  { id: "kb",        label: "Knowledge Base" },
  { id: "qa",        label: "Q&A" },
  { id: "test",      label: "Test Chatbot" },
] as const;

export function AiClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("general");
  return (
    <>
      <PageHeader title="AI Chatbot" description="Balas otomatis pakai AI + basis pengetahuan" />
      <div className="border-b border-border bg-white px-6">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "border-b-2 px-4 py-3 text-sm font-medium transition-colors " +
                (tab === t.id ? "border-primary text-primary-dark" : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6">
        {tab === "general" && <GeneralTab />}
        {tab === "flow" && <FlowTab />}
        {tab === "suggest" && <SuggestTab />}
        {tab === "bridge" && <BridgeTab />}
        {tab === "hours" && <HoursTab />}
        {tab === "escalation" && <EscalationTab />}
        {tab === "kb" && <KbTab />}
        {tab === "qa" && <QaTab />}
        {tab === "test" && <TestTab />}
      </div>
    </>
  );
}

const field = "mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary";

function GeneralTab() {
  const [s, setS] = useState<{
    enabled: boolean; provider: string; apiBaseUrl: string; hasApiKey: boolean;
    model: string; temperature: number; systemPrompt: string; wordFilter: string[];
    draftMode: boolean; alwaysActive: boolean; alwaysRules: string[]; neverRules: string[];
  } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [wordFilter, setWordFilter] = useState("");
  const [newAlways, setNewAlways] = useState("");
  const [newNever, setNewNever] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/ai/settings").then((r) => r.json()).then((d) => {
      setS({ ...d.settings, draftMode: d.settings.draftMode ?? false, alwaysActive: d.settings.alwaysActive ?? false, alwaysRules: d.settings.alwaysRules ?? [], neverRules: d.settings.neverRules ?? [] });
      setWordFilter((d.settings.wordFilter || []).join(", "));
    });
  }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    await fetch("/api/ai/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...s,
        apiKey: apiKey || undefined,
        wordFilter: wordFilter.split(",").map((x) => x.trim()).filter(Boolean),
        draftMode: s.draftMode,
        alwaysRules: s.alwaysRules,
        neverRules: s.neverRules,
      }),
    });
    setBusy(false);
    setApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    const d = await (await fetch("/api/ai/settings")).json();
    setS({ ...d.settings, alwaysActive: d.settings.alwaysActive ?? false, alwaysRules: d.settings.alwaysRules ?? [], neverRules: d.settings.neverRules ?? [] });
  }

  function addAlways() {
    const v = newAlways.trim();
    if (!v || !s) return;
    setS({ ...s, alwaysRules: [...s.alwaysRules, v] });
    setNewAlways("");
  }
  function removeAlways(i: number) {
    if (!s) return;
    setS({ ...s, alwaysRules: s.alwaysRules.filter((_, j) => j !== i) });
  }
  function addNever() {
    const v = newNever.trim();
    if (!v || !s) return;
    setS({ ...s, neverRules: [...s.neverRules, v] });
    setNewNever("");
  }
  function removeNever(i: number) {
    if (!s) return;
    setS({ ...s, neverRules: s.neverRules.filter((_, j) => j !== i) });
  }

  if (!s) return <div className="text-sm text-muted-foreground">Memuat...</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div>
          <div className="text-sm font-semibold">Aktifkan AI Auto-Reply</div>
          <div className="text-xs text-muted-foreground">Kalau aktif, chat masuk yang tak kena aturan kata kunci akan dijawab AI.</div>
        </div>
        <button
          onClick={() => setS({ ...s, enabled: !s.enabled })}
          className={"relative h-6 w-11 rounded-full transition-colors " + (s.enabled ? "bg-primary" : "bg-muted")}
        >
          <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " + (s.enabled ? "left-[22px]" : "left-0.5")} />
        </button>
      </div>

      <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Eye className="h-4 w-4 text-primary" /> Mode Draft (Agen Approve Dulu)
          </div>
          <div className="text-xs text-muted-foreground">
            Aktif: AI buat draft di kotak chat agen, agen klik kirim sendiri.<br />
            Nonaktif: AI langsung kirim otomatis.
          </div>
        </div>
        <button
          onClick={() => setS({ ...s, draftMode: !s.draftMode })}
          className={"relative h-6 w-11 rounded-full transition-colors " + (s.draftMode ? "bg-primary" : "bg-muted")}
        >
          <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " + (s.draftMode ? "left-[22px]" : "left-0.5")} />
        </button>
      </div>

      <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Clock className="h-4 w-4 text-primary" /> AI Aktif 24 Jam
          </div>
          <div className="text-xs text-muted-foreground">
            Aktif: AI tetap reply di luar jam kerja, pesan &quot;kami tutup&quot; tidak dikirim.<br />
            Nonaktif: Di luar jam kerja AI berhenti, pesan &quot;kami tutup&quot; dikirim (jika diisi).
          </div>
        </div>
        <button
          onClick={() => setS({ ...s, alwaysActive: !s.alwaysActive })}
          className={"relative h-6 w-11 rounded-full transition-colors " + (s.alwaysActive ? "bg-primary" : "bg-muted")}
        >
          <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " + (s.alwaysActive ? "left-[22px]" : "left-0.5")} />
        </button>
      </div>

      <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium">API Base URL</label>
            <input value={s.apiBaseUrl} onChange={(e) => setS({ ...s, apiBaseUrl: e.target.value })} placeholder="https://api.openai.com/v1" className={field} />
          </div>
          <div>
            <label className="text-xs font-medium">Model</label>
            <input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} placeholder="gpt-4o-mini" className={field} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium">API Key {s.hasApiKey && <span className="text-success">· tersimpan</span>}</label>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder={s.hasApiKey ? "•••••••• (isi untuk ganti)" : "sk-..."} className={field} />
          <p className="mt-1 text-[11px] text-muted-foreground">OpenAI-compatible (OpenAI, Groq, Gemini via proxy, dll). Key disimpan di server.</p>
        </div>
        <div>
          <label className="text-xs font-medium">Temperature ({s.temperature})</label>
          <input type="range" min={0} max={1.5} step={0.1} value={s.temperature} onChange={(e) => setS({ ...s, temperature: parseFloat(e.target.value) })} className="mt-1 w-full accent-[var(--primary)]" />
        </div>
        <div>
          <label className="text-xs font-medium">Persona / Instruksi</label>
          <textarea value={s.systemPrompt} onChange={(e) => setS({ ...s, systemPrompt: e.target.value })} rows={3} placeholder="Kamu asisten CS Aqma Clinic yang ramah dan singkat..." className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-medium">Kata filter (AI abaikan pesan mengandung ini)</label>
          <input value={wordFilter} onChange={(e) => setWordFilter(e.target.value)} placeholder="tf, transfer, bukti" className={field} />
        </div>
      </div>

      {/* Aturan ALWAYS */}
      <div className="rounded-[var(--radius-lg)] border border-green-200 bg-white p-4 space-y-2">
        <div className="text-sm font-semibold text-green-700">Selalu Lakukan (Always)</div>
        <p className="text-xs text-muted-foreground">AI wajib mengikuti aturan ini di setiap balasan.</p>
        <div className="space-y-1.5">
          {s.alwaysRules.map((r, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-green-50 border border-green-100 px-3 py-1.5">
              <span className="flex-1 text-sm text-green-800">{r}</span>
              <button onClick={() => removeAlways(i)} className="text-green-400 hover:text-danger"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newAlways} onChange={(e) => setNewAlways(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAlways()} placeholder="mis. Sapa pelanggan dengan Kak" className="h-9 flex-1 rounded-md border border-green-200 bg-green-50 px-3 text-sm outline-none focus:border-green-400" />
          <button onClick={addAlways} disabled={!newAlways.trim()} className="flex h-9 w-9 items-center justify-center rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Aturan NEVER */}
      <div className="rounded-[var(--radius-lg)] border border-red-200 bg-white p-4 space-y-2">
        <div className="text-sm font-semibold text-red-600">Tidak Boleh (Never)</div>
        <p className="text-xs text-muted-foreground">AI dilarang keras melakukan hal-hal ini.</p>
        <div className="space-y-1.5">
          {s.neverRules.map((r, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-red-50 border border-red-100 px-3 py-1.5">
              <span className="flex-1 text-sm text-red-800">{r}</span>
              <button onClick={() => removeNever(i)} className="text-red-300 hover:text-danger"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newNever} onChange={(e) => setNewNever(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNever()} placeholder="mis. Jangan sebut nama kompetitor" className="h-9 flex-1 rounded-md border border-red-200 bg-red-50 px-3 text-sm outline-none focus:border-red-400" />
          <button onClick={addNever} disabled={!newNever.trim()} className="flex h-9 w-9 items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
          {busy ? "Menyimpan..." : "Simpan"}
        </button>
        {saved && <span className="text-sm font-medium text-success">Tersimpan ✓</span>}
      </div>
    </div>
  );
}

type Kb = { id: string; title: string; content: string };
function KbTab() {
  const [items, setItems] = useState<Kb[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/ai/kb");
    if (r.ok) setItems((await r.json()).items);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function add() {
    setBusy(true);
    await fetch("/api/ai/kb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content }) });
    setBusy(false); setTitle(""); setContent(""); load();
  }
  async function del(id: string) { await fetch(`/api/ai/kb/${id}`, { method: "DELETE" }); load(); }
  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div className="text-sm font-semibold">Tambah pengetahuan</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul (mis. Jam Buka)" className={field} />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="Isi informasi..." className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary" />
        <button onClick={add} disabled={busy || !title.trim() || !content.trim()} className="inline-flex h-10 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
          <Plus className="h-4 w-4" /> Simpan
        </button>
      </div>
      <div className="space-y-2">
        {items.length === 0 && <div className="rounded-lg border border-dashed border-border bg-white p-6 text-center text-sm text-muted-foreground">Belum ada pengetahuan.</div>}
        {items.map((k) => (
          <div key={k.id} className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-white p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{k.title}</div>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{k.content}</p>
            </div>
            <button onClick={() => del(k.id)} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

type Qa = { id: string; question: string; answer: string };
function QaTab() {
  const [items, setItems] = useState<Qa[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/ai/qa");
    if (r.ok) setItems((await r.json()).items);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function add() {
    setBusy(true);
    await fetch("/api/ai/qa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, answer }) });
    setBusy(false); setQuestion(""); setAnswer(""); load();
  }
  async function del(id: string) { await fetch(`/api/ai/qa/${id}`, { method: "DELETE" }); load(); }
  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div className="text-sm font-semibold">Tambah Q&A</div>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Pertanyaan (mis. Berapa biaya scaling?)" className={field} />
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Jawaban" className={field} />
        <button onClick={add} disabled={busy || !question.trim() || !answer.trim()} className="inline-flex h-10 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
          <Plus className="h-4 w-4" /> Simpan
        </button>
      </div>
      <div className="space-y-2">
        {items.length === 0 && <div className="rounded-lg border border-dashed border-border bg-white p-6 text-center text-sm text-muted-foreground">Belum ada Q&A.</div>}
        {items.map((q) => (
          <div key={q.id} className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-white p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{q.question}</div>
              <p className="mt-0.5 text-sm text-muted-foreground">{q.answer}</p>
            </div>
            <button onClick={() => del(q.id)} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

type ChatEntry = { role: "user" | "bot"; text: string; isErr?: boolean };

function TestTab() {
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, busy]);

  async function run() {
    if (!msg.trim() || busy) return;
    const userMsg = msg.trim();
    setMsg("");
    setChat((c) => [...c, { role: "user", text: userMsg }]);
    setBusy(true);
    const r = await fetch("/api/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMsg }),
    });
    setBusy(false);
    const d = await r.json();
    if (r.ok) {
      setChat((c) => [...c, { role: "bot", text: d.reply }]);
    } else {
      setChat((c) => [...c, { role: "bot", text: d.error ?? "Gagal", isErr: true }]);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border" style={{ height: "calc(100vh - 240px)", maxWidth: "640px" }}>
      {/* Header mirip WA */}
      <div className="flex items-center gap-3 bg-primary px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white">AI Aqma</div>
          <div className="text-[11px] text-white/70">online • test mode</div>
        </div>
      </div>

      {/* Area percakapan */}
      <div className="flex-1 overflow-y-auto space-y-2 p-4" style={{ background: "#efeae2" }}>
        {chat.length === 0 && (
          <div className="flex justify-center">
            <div className="rounded-lg bg-[#ffffffcc] px-4 py-2 text-center text-xs text-muted-foreground shadow-sm">
              Coba tanya seperti pelanggan — AI menjawab pakai Persona + Knowledge Base + Q&A
            </div>
          </div>
        )}
        {chat.map((entry, i) => (
          <div key={i} className={"flex items-end gap-1.5 " + (entry.role === "user" ? "justify-end" : "justify-start")}>
            {entry.role === "bot" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary mb-0.5">
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}
            <div
              className={
                "max-w-[75%] px-3 py-2 text-sm shadow-sm whitespace-pre-wrap leading-relaxed " +
                (entry.role === "user"
                  ? "rounded-2xl rounded-br-sm bg-primary text-white"
                  : entry.isErr
                  ? "rounded-2xl rounded-bl-sm bg-red-50 text-red-600 border border-red-200"
                  : "rounded-2xl rounded-bl-sm bg-white text-foreground")
              }
            >
              {entry.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-end gap-1.5 justify-start">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary mb-0.5">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 shadow-sm">
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 border-t border-border bg-[#f0f2f5] px-3 py-2">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Ketik pesan..."
          className="h-10 flex-1 rounded-full border-0 bg-white px-4 text-sm outline-none shadow-sm"
        />
        <button
          onClick={run}
          disabled={busy || !msg.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-primary-dark disabled:opacity-40"
        >
          <Send className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}

// ─── Saran Jawaban Tab ────────────────────────────────────────────────────────

const DEFAULT_SUGGEST_PROMPT =
  "Kamu membantu agent customer service menyusun balasan yang tepat, singkat, dan ramah dalam Bahasa Indonesia. " +
  "Berdasarkan riwayat percakapan, berikan 1 saran jawaban terbaik untuk membalas pesan terakhir dari lead. " +
  "Tulis langsung teks balasannya saja, tanpa label, tanpa tanda kutip, tanpa penjelasan tambahan.";

function SuggestTab() {
  const [enabled, setEnabled] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/ai/settings").then((r) => r.json()).then((d) => {
      setEnabled(d.settings.suggestEnabled ?? true);
      setPrompt(d.settings.suggestSystemPrompt ?? "");
    });
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/ai/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestEnabled: enabled, suggestSystemPrompt: prompt }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-lg border p-5 space-y-4">
        <div>
          <p className="font-medium text-sm">Saran Jawaban untuk Agent</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tombol saran muncul di panel detail pelanggan saat conversation dalam mode Human (AI dimatikan).
            Agent klik tombol → AI baca riwayat chat → tampilkan satu saran balasan yang bisa langsung dicopy.
          </p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => setEnabled(!enabled)}
            className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
          <span className="text-sm font-medium">{enabled ? "Aktif" : "Nonaktif"}</span>
        </label>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            System Prompt untuk Saran Jawaban
          </label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
            Instruksi ke AI tentang bagaimana menyusun saran jawaban. Kosongkan untuk pakai default.
          </p>
          <textarea
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={DEFAULT_SUGGEST_PROMPT}
            className="w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary resize-none"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Placeholder default: AI diminta memberi 1 saran jawaban singkat + ramah tanpa label/tanda kutip.
          </p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Menyimpan..." : saved ? "Tersimpan!" : "Simpan"}
        </button>
      </div>
    </div>
  );
}

// ─── CLI Bridge Tab ───────────────────────────────────────────────────────────

const PROVIDERS = [
  { id: "chatgpt", label: "ChatGPT",    desc: "Pakai akun ChatGPT yang sudah login (Free/Plus)" },
  { id: "codex",   label: "Codex CLI",  desc: "ChatGPT Plus via Codex CLI yang sudah terinstall — tanpa setup tambahan" },
  { id: "claude",  label: "Claude",     desc: "Pakai Claude Code CLI yang sudah terinstall di server" },
  { id: "gemini",  label: "Gemini",     desc: "Gemini Flash — gratis 1.500 request/hari (butuh API key gratis)" },
  { id: "deepseek",label: "Deepseek",   desc: "Model canggih, biaya sangat murah ($0.14/1M token)" },
] as const;

type BridgeProvider = (typeof PROVIDERS)[number]["id"];

function BridgeTab() {
  const [s, setS] = useState<{
    bridgeEnabled: boolean; bridgeProvider: BridgeProvider;
    hasBridgeChatGptToken: boolean; hasBridgeGeminiKey: boolean; hasBridgeDeepseekKey: boolean;
  } | null>(null);

  const [chatGptToken, setChatGptToken] = useState("");
  const [geminiKey, setGeminiKey]       = useState("");
  const [deepseekKey, setDeepseekKey]   = useState("");
  const [showToken, setShowToken]        = useState(false);
  const [testStatus, setTestStatus]      = useState<"idle"|"loading"|"ok"|"error">("idle");
  const [testMsg, setTestMsg]            = useState("");
  const [busy, setBusy]                  = useState(false);
  const [saved, setSaved]                = useState(false);

  useEffect(() => {
    fetch("/api/ai/settings").then((r) => r.json()).then((d) => {
      setS({
        bridgeEnabled: d.settings.bridgeEnabled ?? false,
        bridgeProvider: d.settings.bridgeProvider ?? "chatgpt",
        hasBridgeChatGptToken: d.settings.hasBridgeChatGptToken ?? false,
        hasBridgeGeminiKey: d.settings.hasBridgeGeminiKey ?? false,
        hasBridgeDeepseekKey: d.settings.hasBridgeDeepseekKey ?? false,
      });
    });
  }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    await fetch("/api/ai/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bridgeEnabled: s.bridgeEnabled,
        bridgeProvider: s.bridgeProvider,
        bridgeChatGptToken: chatGptToken || undefined,
        bridgeGeminiKey: geminiKey || undefined,
        bridgeDeepseekKey: deepseekKey || undefined,
      }),
    });
    setBusy(false); setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    // refresh status token
    const d = await (await fetch("/api/ai/settings")).json();
    setS((prev) => prev && ({
      ...prev,
      hasBridgeChatGptToken: d.settings.hasBridgeChatGptToken,
      hasBridgeGeminiKey: d.settings.hasBridgeGeminiKey,
      hasBridgeDeepseekKey: d.settings.hasBridgeDeepseekKey,
    }));
    setChatGptToken(""); setGeminiKey(""); setDeepseekKey("");
  }

  async function testConn() {
    if (!s) return;
    setTestStatus("loading"); setTestMsg("");
    const r = await fetch("/api/ai/bridge/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: s.bridgeProvider,
        chatGptToken: chatGptToken || undefined,
        geminiKey: geminiKey || undefined,
        deepseekKey: deepseekKey || undefined,
      }),
    });
    const d = await r.json();
    if (d.ok) { setTestStatus("ok"); setTestMsg(d.reply); }
    else { setTestStatus("error"); setTestMsg(d.error ?? "Gagal"); }
  }

  if (!s) return <div className="text-sm text-muted-foreground">Memuat...</div>;

  const prov = s.bridgeProvider;

  return (
    <div className="max-w-2xl space-y-4">
      {/* Toggle aktif */}
      <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Link2 className="h-4 w-4 text-primary" /> Aktifkan Koneksi Tanpa API Key
          </div>
          <div className="text-xs text-muted-foreground">
            Kalau aktif, AI pakai provider yang dipilih di bawah (bukan API key di tab Pengaturan Umum).
          </div>
        </div>
        <button
          onClick={() => setS({ ...s, bridgeEnabled: !s.bridgeEnabled })}
          className={"relative h-6 w-11 rounded-full transition-colors " + (s.bridgeEnabled ? "bg-primary" : "bg-muted")}
        >
          <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " + (s.bridgeEnabled ? "left-[22px]" : "left-0.5")} />
        </button>
      </div>

      {/* Pilih provider */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4 space-y-2">
        <div className="text-sm font-semibold mb-3">Pilih Provider AI</div>
        {PROVIDERS.map((p) => (
          <label key={p.id} className={"flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition-colors " + (prov === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
            <input type="radio" name="provider" value={p.id} checked={prov === p.id}
              onChange={() => setS({ ...s, bridgeProvider: p.id })}
              className="mt-0.5 accent-[var(--primary)]" />
            <div>
              <div className="text-sm font-medium">{p.label}</div>
              <div className="text-xs text-muted-foreground">{p.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {/* Setup per provider */}
      {prov === "chatgpt" && (
        <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4 space-y-3">
          <div className="text-sm font-semibold">Setup ChatGPT</div>

          {/* Cara mudah via Console */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-2">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Cara mudah (via Console)</div>
            <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
              <li>Buka <strong className="text-foreground">chat.openai.com</strong> (pastikan sudah login)</li>
              <li>Tekan <kbd className="rounded bg-white border border-blue-200 px-1.5 py-0.5 text-xs font-mono">F12</kbd> → pilih tab <strong className="text-foreground">Console</strong></li>
              <li>Copy perintah di bawah, paste ke Console, tekan Enter</li>
              <li>Muncul kotak popup berisi token → tekan <kbd className="rounded bg-white border border-blue-200 px-1.5 py-0.5 text-xs font-mono">Ctrl+A</kbd> lalu <kbd className="rounded bg-white border border-blue-200 px-1.5 py-0.5 text-xs font-mono">Ctrl+C</kbd></li>
              <li>Paste hasilnya ke kolom Session Token di bawah</li>
            </ol>
            <div className="relative">
              <code className="block rounded bg-gray-900 text-green-400 text-xs px-3 py-2 pr-20 break-all leading-relaxed select-all">
                {`fetch('/api/auth/session').then(r=>r.json()).then(d=>prompt('Copy token:',d.accessToken))`}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`fetch('/api/auth/session').then(r=>r.json()).then(d=>prompt('Copy token:',d.accessToken))`);
                }}
                className="absolute right-2 top-2 rounded bg-gray-700 px-2 py-1 text-[10px] text-white hover:bg-gray-600"
              >
                Copy
              </button>
            </div>
            <p className="text-[11px] text-blue-600">Token ini bertahan ~1 jam. Kalau expired, ulangi langkah ini.</p>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> atau pakai session token (bertahan berminggu-minggu) <div className="h-px flex-1 bg-border" />
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Cara lanjutan: ambil session token dari DevTools</summary>
            <ol className="mt-2 space-y-1 text-sm text-muted-foreground list-decimal list-inside">
              <li>Tekan <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">F12</kbd> → tab <strong className="text-foreground">Application</strong> (Chrome) atau <strong className="text-foreground">Storage</strong> (Firefox)</li>
              <li>Klik <strong className="text-foreground">Cookies</strong> → <strong className="text-foreground">https://chat.openai.com</strong></li>
              <li>Cari baris <code className="rounded bg-muted px-1 text-xs">__Secure-next-auth.session-token</code></li>
              <li>Klik baris itu → double-click nilainya → copy (panjang ~500 karakter)</li>
            </ol>
          </details>

          <div>
            <label className="text-xs font-medium">
              Session Token {s.hasBridgeChatGptToken && <span className="text-success">· tersimpan</span>}
            </label>
            <div className="relative mt-1">
              <input
                type={showToken ? "text" : "password"}
                value={chatGptToken}
                onChange={(e) => setChatGptToken(e.target.value)}
                placeholder={s.hasBridgeChatGptToken ? "•••••• (isi untuk perbarui)" : "Paste token di sini..."}
                className="h-10 w-full rounded-md border border-input px-3 pr-10 text-sm outline-none focus:border-primary"
              />
              <button type="button" onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
                <Eye className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {prov === "codex" && (
        <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold">Setup Codex CLI</div>
          <p className="text-sm text-muted-foreground">
            Codex CLI pakai akun ChatGPT Plus yang sudah login di server. Tidak perlu setup tambahan —
            langsung klik <strong className="text-foreground">Uji Koneksi</strong> untuk memastikan Codex aktif dan siap.
          </p>
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 space-y-1">
            <div>Codex CLI sudah terinstall di: <code>/root/.local/bin/codex</code></div>
            <div>Model: <strong>gpt-5.4-mini</strong> (ChatGPT Plus)</div>
            <div>Catatan: respons mungkin sedikit lebih lambat (~5–15 detik) karena proses spawn subprocess.</div>
          </div>
        </div>
      )}

      {prov === "claude" && (
        <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4 space-y-2">
          <div className="text-sm font-semibold">Setup Claude</div>
          <p className="text-sm text-muted-foreground">
            Claude pakai Claude Code CLI yang sudah terinstall di server. Tidak perlu token tambahan —
            langsung klik <strong className="text-foreground">Uji Koneksi</strong> untuk cek apakah CLI aktif dan sudah login.
          </p>
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
            Pastikan Claude Code CLI sudah diinstall dan sudah login (<code>claude auth login</code>) di server Aqma.
          </div>
        </div>
      )}

      {prov === "gemini" && (
        <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4 space-y-3">
          <div className="text-sm font-semibold">Setup Gemini</div>
          <ol className="space-y-1 text-sm text-muted-foreground list-decimal list-inside">
            <li>Buka <strong className="text-foreground">aistudio.google.com</strong> → Get API key</li>
            <li>Buat API key baru (gratis)</li>
            <li>Paste di bawah</li>
          </ol>
          <div>
            <label className="text-xs font-medium">
              Gemini API Key {s.hasBridgeGeminiKey && <span className="text-success">· tersimpan</span>}
            </label>
            <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)}
              placeholder={s.hasBridgeGeminiKey ? "•••••• (isi untuk perbarui)" : "AIza..."}
              className="mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary" />
          </div>
        </div>
      )}

      {prov === "deepseek" && (
        <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4 space-y-3">
          <div className="text-sm font-semibold">Setup Deepseek</div>
          <ol className="space-y-1 text-sm text-muted-foreground list-decimal list-inside">
            <li>Buka <strong className="text-foreground">platform.deepseek.com</strong> → API Keys</li>
            <li>Buat API key baru</li>
            <li>Paste di bawah</li>
          </ol>
          <div>
            <label className="text-xs font-medium">
              Deepseek API Key {s.hasBridgeDeepseekKey && <span className="text-success">· tersimpan</span>}
            </label>
            <input type="password" value={deepseekKey} onChange={(e) => setDeepseekKey(e.target.value)}
              placeholder={s.hasBridgeDeepseekKey ? "•••••• (isi untuk perbarui)" : "sk-..."}
              className="mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary" />
          </div>
        </div>
      )}

      {/* Test + Save */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy}
          className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
          {busy ? "Menyimpan..." : "Simpan"}
        </button>
        <button onClick={testConn} disabled={testStatus === "loading"}
          className="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 flex items-center gap-1.5">
          {testStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Uji Koneksi
        </button>
        {saved && <span className="text-sm font-medium text-success">Tersimpan ✓</span>}
      </div>

      {testStatus === "ok" && (
        <div className="flex items-start gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <div><strong>Koneksi berhasil!</strong> Balasan AI: {testMsg}</div>
        </div>
      )}
      {testStatus === "error" && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div><strong>Koneksi gagal:</strong> {testMsg}</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
type WorkDay = { open: boolean; start: string; end: string };

function HoursTab() {
  const [enabled, setEnabled] = useState(false);
  const [tz, setTz] = useState("Asia/Jakarta");
  const [days, setDays] = useState<WorkDay[]>([]);
  const [outside, setOutside] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/ai/settings").then((r) => r.json()).then((d) => {
      setEnabled(d.settings.workHoursEnabled);
      setTz(d.settings.workTimezone || "Asia/Jakarta");
      setDays(d.settings.workDays);
      setOutside(d.settings.outsideMessage || "");
    });
  }, []);

  function setDay(i: number, patch: Partial<WorkDay>) {
    setDays((arr) => arr.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  async function save() {
    setBusy(true);
    await fetch("/api/ai/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workHoursEnabled: enabled, workTimezone: tz, workDays: days, outsideMessage: outside }),
    });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (days.length === 0) return <div className="text-sm text-muted-foreground">Memuat...</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div>
          <div className="text-sm font-semibold">Batasi jam kerja</div>
          <div className="text-xs text-muted-foreground">Zona waktu: WIB (Asia/Jakarta). Di luar jam ini, chat masuk dibalas pesan otomatis di bawah.</div>
        </div>
        <button onClick={() => setEnabled(!enabled)} className={"relative h-6 w-11 rounded-full transition-colors " + (enabled ? "bg-primary" : "bg-muted")}>
          <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all " + (enabled ? "left-[22px]" : "left-0.5")} />
        </button>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div className="mb-2 text-sm font-semibold">Jadwal per hari</div>
        <div className="space-y-1.5">
          {days.map((d, i) => (
            <div key={i} className="flex items-center gap-3">
              <button onClick={() => setDay(i, { open: !d.open })} className={"w-9 text-center " + (d.open ? "" : "opacity-40")}>
                <span className={"inline-block h-4 w-4 rounded " + (d.open ? "bg-primary" : "bg-muted")} />
              </button>
              <span className="w-16 text-sm">{DAY_NAMES[i]}</span>
              {d.open ? (
                <>
                  <input type="time" value={d.start} onChange={(e) => setDay(i, { start: e.target.value })} className="h-9 rounded-md border border-input px-2 text-sm outline-none focus:border-primary" />
                  <span className="text-muted-foreground">–</span>
                  <input type="time" value={d.end} onChange={(e) => setDay(i, { end: e.target.value })} className="h-9 rounded-md border border-input px-2 text-sm outline-none focus:border-primary" />
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Tutup</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <label className="text-xs font-medium">Pesan otomatis di luar jam kerja</label>
        <textarea value={outside} onChange={(e) => setOutside(e.target.value)} rows={2} placeholder="Terima kasih sudah menghubungi. Kami balas di jam kerja 08.00–17.00 WIB ya." className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary" />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan"}</button>
        {saved && <span className="text-sm font-medium text-success">Tersimpan ✓</span>}
      </div>
    </div>
  );
}

function EscalationTab() {
  const [keywords, setKeywords] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/ai/settings").then((r) => r.json()).then((d) => {
      setKeywords((d.settings.escalationKeywords || []).join(", "));
      setMessage(d.settings.escalationMessage || "");
    });
  }, []);

  async function save() {
    setBusy(true);
    await fetch("/api/ai/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ escalationKeywords: keywords.split(",").map((s) => s.trim()).filter(Boolean), escalationMessage: message }),
    });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div className="text-sm font-semibold">Eskalasi ke manusia</div>
        <p className="mt-1 text-xs text-muted-foreground">Kalau pesan pelanggan mengandung salah satu kata kunci ini, AI otomatis berhenti untuk chat itu dan ditandai supaya ditangani agen (ada tombol AI/Kamu handle di chat).</p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-medium">Kata kunci eskalasi (pisah koma)</label>
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="admin, manusia, cs, operator" className={field} />
          </div>
          <div>
            <label className="text-xs font-medium">Pesan saat dialihkan (opsional)</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Baik, kami hubungkan ke admin kami ya. Mohon tunggu sebentar." className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan"}</button>
        {saved && <span className="text-sm font-medium text-success">Tersimpan ✓</span>}
      </div>
    </div>
  );
}

// ─── Alur CS (ConversationFlow) ───────────────────────────────────────────────

type FlowStep = {
  id: string; order: number; stepType: string; name: string;
  keywords: string[]; message: string; mediaUrl: string | null; mediaName: string | null; isActive: boolean;
};
type MediaItem = { id: string; url: string; name: string; type: string };

const STEP_TYPES = [
  { id: "greeting", label: "Salam Pembuka", desc: "Dikirim saat chat baru", color: "bg-green-100 text-green-700" },
  { id: "keyword",  label: "Kondisi Keyword", desc: "Jika pesan mengandung kata tertentu", color: "bg-blue-100 text-blue-700" },
  { id: "fallback", label: "Pesan Default", desc: "Jika tidak ada kondisi cocok", color: "bg-gray-100 text-gray-600" },
] as const;

const EMPTY_FORM = { stepType: "keyword", name: "", keywords: "", message: "", mediaUrl: "", mediaName: "" };

function FlowTab() {
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/ai/flow");
    if (r.ok) setSteps((await r.json()).steps);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadMedia() {
    const r = await fetch("/api/media?limit=50");
    if (r.ok) setMediaItems((await r.json()).items ?? []);
  }

  function openAdd() { setForm({ ...EMPTY_FORM }); setEditId(null); setShowForm(true); }

  function openEdit(s: FlowStep) {
    setForm({ stepType: s.stepType, name: s.name, keywords: s.keywords.join(", "), message: s.message, mediaUrl: s.mediaUrl ?? "", mediaName: s.mediaName ?? "" });
    setEditId(s.id); setShowForm(true);
  }

  async function saveStep() {
    if (!form.name.trim() || !form.message.trim()) return;
    setBusy(true);
    const payload = { stepType: form.stepType, name: form.name.trim(), keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean), message: form.message.trim(), mediaUrl: form.mediaUrl.trim() || null, mediaName: form.mediaName.trim() || null };
    if (editId) {
      await fetch(`/api/ai/flow/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/ai/flow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setBusy(false); setShowForm(false); setEditId(null); load();
  }

  async function del(id: string) {
    if (!confirm("Hapus step ini?")) return;
    await fetch(`/api/ai/flow/${id}`, { method: "DELETE" }); load();
  }

  async function toggleActive(s: FlowStep) {
    await fetch(`/api/ai/flow/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !s.isActive }) }); load();
  }

  async function move(idx: number, dir: -1 | 1) {
    const next = [...steps]; const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setSteps(next);
    await fetch("/api/ai/flow", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: next.map((s) => s.id) }) });
  }

  function pickMedia(m: MediaItem) { setForm((f) => ({ ...f, mediaUrl: m.url, mediaName: m.name })); setShowMediaPicker(false); }

  const typeInfo = (t: string) => STEP_TYPES.find((x) => x.id === t) ?? STEP_TYPES[1];

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-[var(--radius-lg)] border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <strong>Alur CS</strong> — Skrip percakapan berurutan. Keyword match langsung dieksekusi (tanpa AI). Step lain dikompilasi ke instruksi AI.
      </div>

      <div className="space-y-2">
        {steps.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-white p-8 text-center text-sm text-muted-foreground">Belum ada alur CS. Tambah step pertama.</div>
        )}
        {steps.map((s, i) => {
          const ti = typeInfo(s.stepType);
          return (
            <div key={s.id} className={"flex items-start gap-3 rounded-[var(--radius-md)] border bg-white p-3 " + (s.isActive ? "border-border" : "border-border opacity-50")}>
              <div className="flex flex-col gap-0.5 pt-0.5">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-20"><ChevronUp className="h-3.5 w-3.5" /></button>
                <span className="text-center text-[10px] font-mono text-muted-foreground">{i + 1}</span>
                <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-20"><ChevronDown className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={"rounded-full px-2 py-0.5 text-[11px] font-medium " + ti.color}>{ti.label}</span>
                  <span className="text-sm font-medium">{s.name}</span>
                  {s.mediaUrl && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><ImageIcon className="h-3 w-3" /> media</span>}
                </div>
                {s.stepType === "keyword" && s.keywords.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.keywords.map((k) => <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{k}</span>)}
                  </div>
                )}
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{s.message}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggleActive(s)} className={"relative h-5 w-9 rounded-full transition-colors " + (s.isActive ? "bg-primary" : "bg-muted")} title={s.isActive ? "Nonaktifkan" : "Aktifkan"}>
                  <span className={"absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all " + (s.isActive ? "left-[18px]" : "left-0.5")} />
                </button>
                <button onClick={() => openEdit(s)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><GitBranch className="h-3.5 w-3.5" /></button>
                <button onClick={() => del(s.id)} className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={openAdd} className="flex items-center gap-2 rounded-md border border-dashed border-primary px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5">
        <Plus className="h-4 w-4" /> Tambah Step
      </button>

      {/* Modal form add/edit */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-[var(--radius-lg)] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="text-sm font-semibold">{editId ? "Edit Step" : "Tambah Step"}</div>
              <button onClick={() => setShowForm(false)} className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 p-5 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="text-xs font-medium">Tipe Step</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {STEP_TYPES.map((t) => (
                    <label key={t.id} className={"cursor-pointer rounded-lg border p-2.5 text-center transition-colors " + (form.stepType === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                      <input type="radio" name="stepType" value={t.id} checked={form.stepType === t.id} onChange={() => setForm((f) => ({ ...f, stepType: t.id }))} className="sr-only" />
                      <div className="text-xs font-medium">{t.label}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground leading-tight">{t.desc}</div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Nama Step</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="mis. Sambutan Awal" className={field} />
              </div>
              {form.stepType === "keyword" && (
                <div>
                  <label className="text-xs font-medium">Kata Kunci (pisah koma)</label>
                  <input value={form.keywords} onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))} placeholder="harga, treatment, facial, booking, jadwal" className={field} />
                  <p className="mt-1 text-[11px] text-muted-foreground">Jika pesan pelanggan mengandung salah satu kata ini, step langsung dieksekusi (tanpa AI).</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium">Teks Balasan</label>
                <textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} rows={4} placeholder="Halo Kak, selamat datang di Aqma Clinic..." className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-medium">Gambar / Media (opsional)</label>
                {form.mediaUrl ? (
                  <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                    <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                    <span className="flex-1 truncate text-sm">{form.mediaName || form.mediaUrl}</span>
                    <button onClick={() => setForm((f) => ({ ...f, mediaUrl: "", mediaName: "" }))} className="text-muted-foreground hover:text-danger"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <button onClick={async () => { await loadMedia(); setShowMediaPicker(true); }} className="mt-1 flex h-9 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground hover:border-primary hover:text-primary">
                    <ImageIcon className="h-4 w-4" /> Pilih dari Media Library
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button onClick={() => setShowForm(false)} className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">Batal</button>
              <button onClick={saveStep} disabled={busy || !form.name.trim() || !form.message.trim()} className="h-9 rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Media picker modal */}
      {showMediaPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-[var(--radius-lg)] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="text-sm font-semibold">Pilih Media</div>
              <button onClick={() => setShowMediaPicker(false)} className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-80 overflow-y-auto p-4">
              {mediaItems.filter((m) => m.type === "image").length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Belum ada gambar. Upload dulu di menu Media.</p>}
              <div className="grid grid-cols-3 gap-2">
                {mediaItems.filter((m) => m.type === "image").map((m) => (
                  <button key={m.id} onClick={() => pickMedia(m)} className="group relative overflow-hidden rounded-lg border border-border hover:border-primary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt={m.name} className="h-24 w-full object-cover" />
                    <div className="absolute inset-0 flex items-end bg-black/0 group-hover:bg-black/30 transition-colors">
                      <p className="w-full truncate bg-black/50 px-1.5 py-1 text-[10px] text-white opacity-0 group-hover:opacity-100">{m.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
