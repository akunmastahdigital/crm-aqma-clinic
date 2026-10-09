"use client";

import { useState, useEffect, useCallback } from "react";
import { ExternalLink, RefreshCw, Calendar, MessageSquare, CheckCheck, Tag, Users } from "lucide-react";

type ConvRow = {
  id: string;
  createdAt: string;
  lastMessageAt: string | null;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerTags: string[];
  closedAt: string | null;
  messageCount: number;
  inboundCount: number;
  outboundCount: number;
  hasFollowUp: boolean;
  description: string;
};

type Group = {
  tag: string;
  count: number;
  conversations: ConvRow[];
};

type ReportData = {
  dateFrom: string;
  dateTo: string;
  totalChats: number;
  totalFollowUp: number;
  groups: Group[];
};

const TAG_META: Record<string, { color: string; desc: string }> = {
  "Deal":           { color: "#4F7A5B", desc: "Pasien yang sudah closing atau booking terkonfirmasi." },
  "Reservasi":      { color: "#4F7A5B", desc: "Lead sudah buat janji/booking jadwal dengan klinik." },
  "Potensi":        { color: "#0ea5e9", desc: "Lead masih aktif dan berpotensi closing — perlu follow-up personal." },
  "Respon Panjang": { color: "#0ea5e9", desc: "Lead terlibat percakapan panjang dan detail — sinyal minat tinggi." },
  "Drop":           { color: "#f59e0b", desc: "Lead sempat aktif tapi menghilang setelah dapat info — perlu pendekatan baru." },
  "Respon Pendek":  { color: "#f59e0b", desc: "Lead merespons singkat — belum dapat info cukup untuk closing." },
  "Gagal Closing":  { color: "#B4534B", desc: "Lead secara eksplisit menolak (harga, jarak, ragu efek samping, dll)." },
  "Greeting text":  { color: "#8b5cf6", desc: "Lead hanya membalas greeting awal dan belum lanjut." },
  "Tanpa Label":    { color: "#78716c", desc: "Percakapan yang belum diberi label oleh agen — perlu ditinjau." },
};

function getTagColor(tag: string) {
  return TAG_META[tag]?.color ?? "#6b7280";
}
function getTagDesc(tag: string) {
  return TAG_META[tag]?.desc ?? `Kelompok lead dengan label "${tag}".`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short",
  });
}

export function ReportClient() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const today = new Date();
  const defaultTo   = today.toISOString().slice(0, 10);
  const defaultFrom = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo,   setDateTo]   = useState(defaultTo);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/monthly?from=${dateFrom}&to=${dateTo}`);
      if (!res.ok) throw new Error("Gagal memuat data");
      const json: ReportData = await res.json();
      setData(json);
      setActiveTab(json.groups[0]?.tag ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error tidak diketahui");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const activeGroup = data?.groups.find((g) => g.tag === activeTab) ?? null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="max-w-4xl mx-auto px-4 py-8 pb-20">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Laporan Lead Bulanan</h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Semua percakapan yang masuk dikelompokkan per label agen. Klik tab untuk berpindah kelompok.
            Deskripsi per lead dihasilkan otomatis dari isi percakapan.
          </p>
        </div>

        {/* Filter bar */}
        <div className="bg-white border border-zinc-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end shadow-sm">
          <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <label className="text-xs font-medium text-zinc-500">Dari tanggal</label>
            <input
              type="date" value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <label className="text-xs font-medium text-zinc-500">Sampai tanggal</label>
            <input
              type="date" value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <button
            onClick={load} disabled={loading}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "Memuat…" : "Tampilkan"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6 text-sm">{error}</div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20 gap-3 text-zinc-400 text-sm">
            <RefreshCw size={16} className="animate-spin" />Memuat data…
          </div>
        )}

        {data && (
          <>
            {/* Date badge + stats */}
            <div className="inline-flex items-center gap-2 bg-violet-50 text-violet-700 text-xs font-semibold px-3 py-1.5 rounded-lg mb-4">
              <Calendar size={12} />
              {formatDate(data.dateFrom)} – {formatDate(data.dateTo)}
            </div>

            <div className="flex flex-wrap gap-3 mb-8">
              {[
                { icon: <MessageSquare size={12}/>, label: "Total chat masuk",    val: data.totalChats },
                { icon: <CheckCheck size={12}/>,    label: "Di-follow up",         val: data.totalFollowUp },
                { icon: <Tag size={12}/>,           label: "Kelompok label",       val: data.groups.length },
                { icon: <Users size={12}/>,         label: "Belum di-follow up",   val: data.totalChats - data.totalFollowUp },
              ].map(({ icon, label, val }) => (
                <div key={label} className="bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-sm min-w-[130px]">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-0.5">{icon}{label}</div>
                  <div className="text-2xl font-bold">{val}</div>
                </div>
              ))}
            </div>

            {/* Tab bar */}
            {data.groups.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-0 pb-0">
                {data.groups.map((g) => {
                  const color = getTagColor(g.tag);
                  const isActive = activeTab === g.tag;
                  return (
                    <button
                      key={g.tag}
                      onClick={() => setActiveTab(g.tag)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-t-lg border border-b-0 text-xs font-semibold transition-all"
                      style={{
                        background: isActive ? "white" : "#f4f4f5",
                        borderColor: isActive ? "#e4e4e7" : "transparent",
                        color: isActive ? color : "#71717a",
                        borderBottom: isActive ? "2px solid " + color : "2px solid transparent",
                        boxShadow: isActive ? "0 -1px 3px rgba(0,0,0,0.04)" : "none",
                      }}
                    >
                      <span
                        className="inline-flex items-center justify-center rounded-full text-[10px] font-bold min-w-[18px] h-[18px] px-1"
                        style={{ background: isActive ? color : "#d4d4d8", color: "#fff" }}
                      >
                        {g.count}
                      </span>
                      {g.tag}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tab panel */}
            {activeGroup && (
              <div className="bg-white border border-zinc-200 rounded-b-xl rounded-tr-xl shadow-sm">
                {/* Panel header */}
                <div
                  className="px-5 py-4 border-b border-zinc-100"
                  style={{ borderTop: `3px solid ${getTagColor(activeGroup.tag)}` }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ background: getTagColor(activeGroup.tag) }}
                    >
                      {activeGroup.count} lead
                    </span>
                    <span className="font-semibold text-sm">{activeGroup.tag}</span>
                  </div>
                  <p className="text-xs text-zinc-500">{getTagDesc(activeGroup.tag)}</p>
                </div>

                {/* Cards */}
                <div className="divide-y divide-zinc-100">
                  {activeGroup.conversations.map((conv) => (
                    <div key={conv.id} className="px-5 py-4 flex items-start gap-4 flex-wrap hover:bg-zinc-50 transition-colors">
                      <div className="flex-1 min-w-[200px]">
                        {/* Name + phone */}
                        <div className="font-semibold text-sm text-zinc-900">
                          {conv.customerName ?? conv.customerPhone ?? "Tidak diketahui"}
                        </div>
                        <div className="flex flex-wrap gap-x-2 text-xs text-zinc-400 mt-0.5">
                          {conv.customerName && <span>{conv.customerPhone}</span>}
                          <span>·</span>
                          <span>{formatDateShort(conv.createdAt)}</span>
                          {conv.lastMessageAt && conv.lastMessageAt !== conv.createdAt && (
                            <><span>s/d</span><span>{formatDateShort(conv.lastMessageAt)}</span></>
                          )}
                          <span>·</span>
                          <span>{conv.messageCount} pesan</span>
                          {conv.customerTags.length > 0 && (
                            <><span>·</span><span>{conv.customerTags.join(", ")}</span></>
                          )}
                          {conv.hasFollowUp
                            ? <span className="text-green-600 font-medium">· sudah dibalas</span>
                            : <span className="text-orange-500 font-medium">· belum dibalas</span>
                          }
                        </div>

                        {/* Auto-generated description */}
                        <div className="mt-2 text-xs text-zinc-600 leading-relaxed bg-zinc-50 rounded-lg px-3 py-2 border border-zinc-100">
                          {conv.description}
                        </div>
                      </div>

                      <a
                        href={`/inbox?c=${conv.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap transition-colors self-start mt-1"
                      >
                        Buka Chat <ExternalLink size={11} />
                      </a>
                    </div>
                  ))}

                  {activeGroup.conversations.length === 0 && (
                    <div className="px-5 py-10 text-center text-zinc-400 text-sm">
                      Tidak ada percakapan di kelompok ini.
                    </div>
                  )}
                </div>
              </div>
            )}

            {data.groups.length === 0 && (
              <div className="text-center text-zinc-400 py-16 text-sm">
                Tidak ada data percakapan untuk rentang tanggal ini.
              </div>
            )}

            <div className="text-center text-zinc-400 text-xs mt-8">
              Data live dari CRM · {data.totalChats} percakapan · {formatDate(data.dateFrom)} – {formatDate(data.dateTo)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
