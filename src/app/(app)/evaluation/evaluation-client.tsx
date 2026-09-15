"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, Users, BarChart2, Download, Loader2, ChevronDown, ExternalLink, MessageSquare, History, Trash2, ChevronRight, TrendingUp } from "lucide-react";
import type { ConvRef } from "@/app/api/evaluation/route";

type HistoryItem = {
  id: string;
  scope: string;
  agentName: string | null;
  startDate: string | null;
  endDate: string | null;
  convCount: number;
  createdAt: string;
  refs: ConvRef[];
  result: string;
};

type Agent = { id: string; name: string; role: string };
type Conv = {
  id: string;
  lastMessageAt: string | null;
  customer: { name: string | null; phone: string; leadStatus: string | null } | null;
};

type Props = { agents: Agent[]; conversations: Conv[] };
type Tab = "conversation" | "agent" | "team" | "leads";
type MainTab = "generate" | "history";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "conversation", label: "Per Percakapan", icon: <Bot size={16} /> },
  { id: "agent", label: "Per Agent", icon: <Users size={16} /> },
  { id: "team", label: "Keseluruhan Tim", icon: <BarChart2 size={16} /> },
  { id: "leads", label: "Analisis Lead", icon: <TrendingUp size={16} /> },
];

function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(n: number) { return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10); }

export function EvaluationClient({ agents, conversations }: Props) {
  const [mainTab, setMainTab] = useState<MainTab>("generate");
  const [tab, setTab] = useState<Tab>("conversation");
  const [convId, setConvId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [startDate, setStartDate] = useState(daysAgoStr(30));
  const [endDate, setEndDate] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [refs, setRefs] = useState<ConvRef[]>([]);
  const [error, setError] = useState<string | null>(null);

  // History state
  const [histories, setHistories] = useState<HistoryItem[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [openHistId, setOpenHistId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHistories = useCallback(async () => {
    setHistLoading(true);
    try {
      const r = await fetch("/api/evaluation");
      if (r.ok) {
        const d = await r.json();
        setHistories(d.histories ?? []);
      }
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mainTab === "history") loadHistories();
  }, [mainTab, loadHistories]);

  async function deleteHistory(id: string) {
    setDeletingId(id);
    await fetch("/api/evaluation", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setHistories((prev) => prev.filter((h) => h.id !== id));
    if (openHistId === id) setOpenHistId(null);
    setDeletingId(null);
  }

  async function generate() {
    setLoading(true);
    setResult(null);
    setRefs([]);
    setError(null);

    const body: Record<string, string> = { scope: tab };
    if (tab === "conversation") body.conversationId = convId;
    if (tab === "agent") { body.agentId = agentId; body.startDate = startDate; body.endDate = endDate; }
    if (tab === "team") { body.startDate = startDate; body.endDate = endDate; }
    if (tab === "leads") { body.startDate = startDate; body.endDate = endDate; }

    try {
      const r = await fetch("/api/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gagal generate evaluasi");
      setResult(d.result);
      setRefs(d.refs ?? []);
      // Refresh history count di background
      fetch("/api/evaluation").then((r) => r.json()).then((d) => setHistories(d.histories ?? [])).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    if (!result) return;
    const tabLabel = TABS.find((t) => t.id === tab)?.label ?? "Evaluasi";
    const agentName = tab === "agent" ? agents.find((a) => a.id === agentId)?.name : null;
    const dateRange = tab !== "conversation" ? `Periode: ${startDate} s/d ${endDate}` : "";

    const refsHtml = refs.length > 0 ? `
<h2 style="margin-top:32px">Referensi Percakapan</h2>
<table>
<thead><tr><th>Customer</th><th>Status</th><th>Link</th></tr></thead>
<tbody>
${refs.map((r) => `<tr><td>${r.customerName}</td><td>${r.status ?? "-"}</td><td>${window.location.origin}/inbox?c=${r.id}</td></tr>`).join("")}
</tbody>
</table>` : "";

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Laporan Evaluasi AI — ${tabLabel}</title>
<style>
  body{font-family:Georgia,serif;max-width:800px;margin:40px auto;color:#1a1a1a;line-height:1.75;font-size:14px}
  h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px;margin:0 0 4px}
  h2{font-size:16px;margin:28px 0 6px;color:#111;border-left:3px solid #6d28d9;padding-left:8px}
  h3{font-size:14px;margin:16px 0 4px;color:#333}
  h4{font-size:13px;margin:12px 0 4px;font-style:italic}
  ul{margin:6px 0 6px 20px;padding:0}
  li{margin:3px 0}
  table{border-collapse:collapse;width:100%;margin:12px 0}
  th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px}
  th{background:#f5f5f5;font-weight:600}
  code{background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px}
  hr{border:none;border-top:1px solid #ddd;margin:20px 0}
  p{margin:6px 0}
  strong{font-weight:600}
  .meta{color:#666;font-size:12px;margin-bottom:24px}
  @media print{body{margin:20px}}
</style>
</head>
<body>
<h1>Laporan Evaluasi AI — ${tabLabel}</h1>
<div class="meta">
  ${agentName ? `<div>Agent: ${agentName}</div>` : ""}
  ${dateRange ? `<div>${dateRange}</div>` : ""}
  <div>Dibuat: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</div>
</div>
${markdownToHtml(result)}
${refsHtml}
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  }

  const canGenerate =
    (tab === "conversation" && convId) ||
    (tab === "agent" && agentId) ||
    tab === "team" ||
    tab === "leads";

  const SCOPE_LABEL: Record<string, string> = {
    conversation: "Per Percakapan",
    agent: "Per Agent",
    team: "Keseluruhan Tim",
    leads: "Analisis Lead",
  };

  return (
    <div className="space-y-6">
      {/* Main tab toggle: Generate vs Riwayat */}
      <div className="flex gap-2">
        <button
          onClick={() => setMainTab("generate")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
            mainTab === "generate"
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 hover:border-violet-400"
          }`}
        >
          <Bot size={15} /> Generate Baru
        </button>
        <button
          onClick={() => setMainTab("history")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
            mainTab === "history"
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 hover:border-violet-400"
          }`}
        >
          <History size={15} /> Riwayat Evaluasi
          {histories.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 rounded-full">
              {histories.length}
            </span>
          )}
        </button>
      </div>

      {/* ── RIWAYAT ── */}
      {mainTab === "history" && (
        <div className="space-y-3">
          {histLoading && (
            <div className="flex items-center gap-2 text-sm text-zinc-400 py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Memuat riwayat...
            </div>
          )}
          {!histLoading && histories.length === 0 && (
            <div className="text-center py-12 text-zinc-400 text-sm">
              Belum ada riwayat evaluasi. Generate evaluasi pertama kamu!
            </div>
          )}
          {!histLoading && histories.map((h) => {
            const isOpen = openHistId === h.id;
            const hRefs = (h.refs ?? []) as ConvRef[];
            const dateLabel = h.startDate
              ? `${new Date(h.startDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" })} – ${new Date(h.endDate!).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" })}`
              : null;
            return (
              <div key={h.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                {/* Header row */}
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    className="flex items-center gap-3 flex-1 text-left"
                    onClick={() => setOpenHistId(isOpen ? null : h.id)}
                  >
                    <ChevronRight size={15} className={`text-zinc-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300">
                          {SCOPE_LABEL[h.scope] ?? h.scope}
                        </span>
                        {h.agentName && (
                          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{h.agentName}</span>
                        )}
                        {h.convCount > 0 && (
                          <span className="text-xs text-zinc-400">{h.convCount} percakapan</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-zinc-400">
                          {new Date(h.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })}
                        </span>
                        {dateLabel && (
                          <span className="text-xs text-zinc-400">· Periode: {dateLabel}</span>
                        )}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => deleteHistory(h.id)}
                    disabled={deletingId === h.id}
                    className="p-1.5 text-zinc-400 hover:text-red-500 transition-colors rounded"
                    title="Hapus"
                  >
                    {deletingId === h.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>

                {/* Expanded content */}
                {isOpen && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800">
                    <div
                      className="p-6 evaluation-result"
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(h.result) }}
                    />
                    {hRefs.length > 0 && (
                      <div className="border-t border-zinc-100 dark:border-zinc-800">
                        <div className="px-5 py-2 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                          Percakapan ({hRefs.length})
                        </div>
                        <div className="divide-y divide-zinc-50 dark:divide-zinc-800">
                          {hRefs.map((r) => (
                            <div key={r.id} className="flex items-center justify-between px-5 py-2.5">
                              <div>
                                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{r.customerName}</p>
                                {r.phone && <p className="text-xs text-zinc-400">{r.phone}</p>}
                              </div>
                              <div className="flex items-center gap-2">
                                {r.status && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{r.status}</span>
                                )}
                                <a href={`/inbox?c=${r.id}`} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 font-medium">
                                  Buka Chat <ExternalLink size={10} />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── GENERATE ── */}
      {mainTab === "generate" && <>
      {/* Scope Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setResult(null); setRefs([]); setError(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-violet-500 text-violet-600 dark:text-violet-400"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5 space-y-4">
        {tab === "conversation" && (
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Pilih Percakapan</label>
            <div className="relative">
              <select
                value={convId}
                onChange={(e) => setConvId(e.target.value)}
                className="w-full appearance-none bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg px-3 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">-- Pilih percakapan --</option>
                {conversations.map((c) => {
                  const name = c.customer?.name ?? c.customer?.phone ?? "Unknown";
                  const status = c.customer?.leadStatus ? ` [${c.customer.leadStatus}]` : "";
                  const date = c.lastMessageAt
                    ? new Date(c.lastMessageAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })
                    : "";
                  return <option key={c.id} value={c.id}>{name}{status} — {date}</option>;
                })}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-3 text-zinc-400 pointer-events-none" />
            </div>
            <p className="mt-1.5 text-xs text-zinc-400">Menampilkan 100 percakapan terbaru</p>
          </div>
        )}

        {tab === "agent" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Pilih Agent</label>
              <div className="relative">
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="w-full appearance-none bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg px-3 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">-- Pilih agent --</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-3 text-zinc-400 pointer-events-none" />
              </div>
            </div>
            <DateRangePicker startDate={startDate} endDate={endDate} onStart={setStartDate} onEnd={setEndDate} />
          </div>
        )}

        {tab === "team" && (
          <DateRangePicker startDate={startDate} endDate={endDate} onStart={setStartDate} onEnd={setEndDate} />
        )}

        {tab === "leads" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-violet-100 bg-violet-50 p-3 text-xs text-violet-700">
              AI akan menganalisis 10 lead terbaru dalam rentang tanggal yang dipilih, lalu mengelompokkan mana yang berpotensi closing dan mana yang berisiko gagal — lengkap dengan langkah konkret per lead. Gunakan rentang pendek (1-3 hari) untuk hasil lebih akurat.
            </div>
            <DateRangePicker startDate={startDate} endDate={endDate} onStart={setStartDate} onEnd={setEndDate} />
          </div>
        )}

        <button
          onClick={generate}
          disabled={loading || !canGenerate}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />}
          {loading ? "Sedang menganalisis..." : "Generate Evaluasi AI"}
        </button>

        {loading && (
          <p className="text-xs text-zinc-400">Proses analisis bisa memakan 15–30 detik tergantung jumlah percakapan...</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <Bot size={15} className="text-violet-500" />
                Hasil Evaluasi AI
              </div>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-violet-600 border border-zinc-300 dark:border-zinc-600 rounded-lg transition-colors"
              >
                <Download size={13} />
                Download / Print
              </button>
            </div>
            <div
              className="p-6 evaluation-result"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(result) }}
            />
          </div>

          {/* Referensi Percakapan */}
          {refs.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <MessageSquare size={15} className="text-violet-500" />
                Percakapan yang Dianalisis ({refs.length})
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {refs.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{r.customerName}</p>
                      {r.phone && <p className="text-xs text-zinc-400">{r.phone}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      {r.status && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          {r.status}
                        </span>
                      )}
                      <a
                        href={`/inbox?c=${r.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 font-medium"
                      >
                        Buka Chat <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      </> /* end generate */}

      <style>{`
        .evaluation-result h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #e4e4e7; color: #18181b; }
        .evaluation-result h2 { font-size: 1rem; font-weight: 700; margin: 1.5rem 0 0.5rem; padding: 0.35rem 0.75rem; background: #f5f3ff; border-left: 3px solid #7c3aed; border-radius: 0 4px 4px 0; color: #3b0764; }
        .evaluation-result h3 { font-size: 0.9rem; font-weight: 600; margin: 1rem 0 0.35rem; color: #3f3f46; }
        .evaluation-result h4 { font-size: 0.875rem; font-weight: 600; margin: 0.75rem 0 0.25rem; color: #52525b; font-style: italic; }
        .evaluation-result p { font-size: 0.875rem; line-height: 1.7; margin: 0.35rem 0; color: #3f3f46; }
        .evaluation-result ul { margin: 0.4rem 0 0.4rem 1.25rem; padding: 0; }
        .evaluation-result li { font-size: 0.875rem; line-height: 1.65; margin: 0.2rem 0; color: #3f3f46; }
        .evaluation-result table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; font-size: 0.8125rem; }
        .evaluation-result th, .evaluation-result td { border: 1px solid #e4e4e7; padding: 0.4rem 0.75rem; text-align: left; }
        .evaluation-result th { background: #fafafa; font-weight: 600; color: #27272a; }
        .evaluation-result td { color: #3f3f46; }
        .evaluation-result hr { border: none; border-top: 1px solid #e4e4e7; margin: 1rem 0; }
        .evaluation-result strong { font-weight: 700; color: #18181b; }
        .evaluation-result em { font-style: italic; }
        .evaluation-result code { background: #f4f4f5; padding: 1px 5px; border-radius: 3px; font-size: 0.8rem; font-family: monospace; }
        @media (prefers-color-scheme: dark) {
          .evaluation-result h2 { background: #2e1065; color: #ddd6fe; border-color: #7c3aed; }
          .evaluation-result h1, .evaluation-result h3, .evaluation-result h4 { color: #f4f4f5; }
          .evaluation-result p, .evaluation-result li, .evaluation-result td { color: #a1a1aa; }
          .evaluation-result th { background: #27272a; color: #e4e4e7; }
          .evaluation-result th, .evaluation-result td { border-color: #3f3f46; }
          .evaluation-result strong { color: #f4f4f5; }
          .evaluation-result hr { border-color: #3f3f46; }
          .evaluation-result code { background: #27272a; color: #d4d4d8; }
        }
      `}</style>
    </div>
  );
}

const DATE_PRESETS = [
  { label: "Hari Ini", start: () => todayStr(), end: () => todayStr() },
  { label: "Kemarin", start: () => daysAgoStr(1), end: () => daysAgoStr(1) },
  { label: "7 Hari", start: () => daysAgoStr(7), end: () => todayStr() },
  { label: "30 Hari", start: () => daysAgoStr(30), end: () => todayStr() },
  { label: "60 Hari", start: () => daysAgoStr(60), end: () => todayStr() },
  { label: "Semua Waktu", start: () => "2020-01-01", end: () => todayStr() },
];

function DateRangePicker({
  startDate, endDate, onStart, onEnd,
}: {
  startDate: string; endDate: string;
  onStart: (v: string) => void; onEnd: (v: string) => void;
}) {
  function applyPreset(p: typeof DATE_PRESETS[number]) {
    onStart(p.start());
    onEnd(p.end());
  }

  const activePreset = DATE_PRESETS.find(
    (p) => p.start() === startDate && p.end() === endDate
  );

  return (
    <div className="space-y-3">
      {/* Preset buttons */}
      <div>
        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Rentang Cepat</label>
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                activePreset?.label === p.label
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 hover:border-violet-400 hover:text-violet-600"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {/* Manual date inputs */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-36">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Dari</label>
          <input
            type="date" value={startDate} max={endDate}
            onChange={(e) => onStart(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="flex-1 min-w-36">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Sampai</label>
          <input
            type="date" value={endDate} min={startDate} max={todayStr()}
            onChange={(e) => onEnd(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>
    </div>
  );
}

// Line-by-line markdown → HTML renderer
function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let tableLines: string[] = [];
  let inTable = false;
  let pBuffer: string[] = [];

  function flushParagraph() {
    if (!pBuffer.length) return;
    out.push(`<p>${pBuffer.join(" ")}</p>`);
    pBuffer = [];
  }
  function flushList() {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  }
  function flushTable() {
    if (!tableLines.length) return;
    const rows = tableLines.filter((r) => !/^\|[-| :]+\|$/.test(r.trim()));
    if (!rows.length) { tableLines = []; inTable = false; return; }
    const [head, ...body] = rows;
    const ths = head.split("|").filter(Boolean).map((c) => `<th>${inlineHtml(c.trim())}</th>`).join("");
    const trs = body.map((r) => {
      const tds = r.split("|").filter(Boolean).map((c) => `<td>${inlineHtml(c.trim())}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
    out.push(`<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`);
    tableLines = [];
    inTable = false;
  }

  for (const raw of lines) {
    const line = raw;

    // Table row
    if (/^\|.+\|$/.test(line.trim())) {
      flushParagraph();
      flushList();
      inTable = true;
      tableLines.push(line);
      continue;
    }
    if (inTable) flushTable();

    // Headings
    if (/^#### /.test(line)) {
      flushParagraph(); flushList();
      out.push(`<h4>${inlineHtml(line.slice(5))}</h4>`);
    } else if (/^### /.test(line)) {
      flushParagraph(); flushList();
      out.push(`<h3>${inlineHtml(line.slice(4))}</h3>`);
    } else if (/^## /.test(line)) {
      flushParagraph(); flushList();
      out.push(`<h2>${inlineHtml(line.slice(3))}</h2>`);
    } else if (/^# /.test(line)) {
      flushParagraph(); flushList();
      out.push(`<h1>${inlineHtml(line.slice(2))}</h1>`);
    }
    // Unordered list
    else if (/^\s*[-*] /.test(line)) {
      flushParagraph();
      if (inOl) { out.push("</ol>"); inOl = false; }
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${inlineHtml(line.replace(/^\s*[-*] /, ""))}</li>`);
    }
    // Ordered list
    else if (/^\s*\d+\. /.test(line)) {
      flushParagraph();
      if (inUl) { out.push("</ul>"); inUl = false; }
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push(`<li>${inlineHtml(line.replace(/^\s*\d+\. /, ""))}</li>`);
    }
    // HR
    else if (/^---+$/.test(line.trim())) {
      flushParagraph(); flushList();
      out.push("<hr>");
    }
    // Empty line
    else if (line.trim() === "") {
      flushParagraph(); flushList();
    }
    // Regular text — buffer for paragraph
    else {
      pBuffer.push(inlineHtml(line));
    }
  }

  flushParagraph();
  flushList();
  flushTable();

  return out.join("\n");
}

function inlineHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
