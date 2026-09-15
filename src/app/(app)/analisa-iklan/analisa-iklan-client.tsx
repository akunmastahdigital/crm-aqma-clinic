"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Filter, ExternalLink, ChevronDown, X, Search, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type ClickSession = {
  utmSource:     string | null;
  utmMedium:     string | null;
  utmCampaign:   string | null;
  campaignName:  string | null;
  adsetName:     string | null;
  adName:        string | null;
  siteSourceName: string | null;
  fbclid:        string | null;
  createdAt:     string;
};

type Customer = {
  id:            string;
  name:          string | null;
  phone:         string | null;
  channel:       string;
  clickSessions: ClickSession[];
};

type EventRow = {
  id:        string;
  eventName: string;
  value:     number | null;
  currency:  string | null;
  sentAt:    string;
  campaignId: string | null;
  adId:      string | null;
  customerId: string | null;
  customer:  Customer | null;
};

type ApiData = {
  events:     EventRow[];
  total:      number;
  totalValue: number;
  eventTypes: string[];
  campaigns:  string[];
  sources:    string[];
};

const EVENT_COLOR: Record<string, string> = {
  Purchase:       "bg-green-100 text-green-700",
  Lead:           "bg-blue-100 text-blue-700",
  AddPaymentInfo: "bg-purple-100 text-purple-700",
  Subscribe:      "bg-orange-100 text-orange-700",
  CompleteRegistration: "bg-teal-100 text-teal-700",
  ViewContent:    "bg-gray-100 text-gray-600",
  InitiateCheckout: "bg-yellow-100 text-yellow-700",
};

function eventColor(name: string) {
  return EVENT_COLOR[name] ?? "bg-slate-100 text-slate-600";
}

function fmt(value: number, currency: string | null) {
  const c = currency?.toUpperCase() ?? "IDR";
  if (c === "IDR") return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(value);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function sourceLabel(cs: ClickSession | undefined) {
  if (!cs) return "—";
  const parts = [cs.utmSource, cs.utmMedium].filter(Boolean);
  return parts.length ? parts.join(" / ") : (cs.siteSourceName ?? "—");
}

function SelectFilter({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-md border border-border bg-white pl-3 pr-7 text-xs font-medium outline-none focus:border-primary"
      >
        <option value="">{label}: Semua</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export function AnalisaIklanClient() {
  const [data, setData]         = useState<ApiData | null>(null);
  const [loading, setLoading]   = useState(true);

  // filters
  const [event,    setEvent]    = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [campaign, setCampaign] = useState("");
  const [source,   setSource]   = useState("");
  const [search,   setSearch]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (event)    sp.set("event",    event);
    if (dateFrom) sp.set("dateFrom", dateFrom);
    if (dateTo)   sp.set("dateTo",   dateTo);
    if (campaign) sp.set("campaign", campaign);
    if (source)   sp.set("source",   source);
    const res = await fetch(`/api/analisa-iklan/events?${sp}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [event, dateFrom, dateTo, campaign, source]);

  useEffect(() => { void load(); }, [load]);

  const rows = (data?.events ?? []).filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.customer?.name?.toLowerCase().includes(q) ||
      e.customer?.phone?.toLowerCase().includes(q) ||
      e.eventName.toLowerCase().includes(q) ||
      e.customer?.clickSessions[0]?.campaignName?.toLowerCase().includes(q) ||
      false
    );
  });

  const hasFilter = event || dateFrom || dateTo || campaign || source;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border bg-white px-6 py-4 flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-base font-semibold">Analisa Iklan</h1>
          <p className="text-xs text-muted-foreground">Lacak konversi per event dan sumber iklan</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="border-b border-border bg-muted/30 px-6 py-3 flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

        {/* Event type */}
        <SelectFilter
          label="Event"
          value={event}
          options={data?.eventTypes ?? []}
          onChange={setEvent}
        />

        {/* Date range */}
        <input
          type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="h-8 rounded-md border border-border bg-white px-2 text-xs outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground">s/d</span>
        <input
          type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="h-8 rounded-md border border-border bg-white px-2 text-xs outline-none focus:border-primary"
        />

        {/* Campaign */}
        <SelectFilter
          label="Kampanye"
          value={campaign}
          options={data?.campaigns ?? []}
          onChange={setCampaign}
        />

        {/* Source */}
        <SelectFilter
          label="Sumber"
          value={source}
          options={data?.sources ?? []}
          onChange={setSource}
        />

        {hasFilter && (
          <button
            onClick={() => { setEvent(""); setDateFrom(""); setDateTo(""); setCampaign(""); setSource(""); }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3 w-3" /> Reset
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" placeholder="Cari nama / nomor..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 rounded-md border border-border bg-white pl-7 pr-3 text-xs outline-none focus:border-primary"
            />
          </div>
          <button onClick={load} className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-muted-foreground hover:bg-muted transition-colors">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {data && (
        <div className="border-b border-border bg-white px-6 py-2.5 flex items-center gap-6 text-xs text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{rows.length}</span> event ditemukan
          </span>
          {event && data.totalValue > 0 && (
            <span>
              Total nilai:{" "}
              <span className="font-semibold text-green-700">
                {fmt(rows.reduce((s, e) => s + (e.value ?? 0), 0), rows[0]?.currency ?? "IDR")}
              </span>
            </span>
          )}
          {!event && (
            <span className="italic">Pilih filter Event untuk melihat daftar lead per konversi</span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">Memuat data...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-8 w-8 opacity-20" />
            <p>{event ? "Belum ada data untuk filter ini" : "Pilih event di atas untuk mulai"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 border-b border-border z-10">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Lead</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Event</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Nilai</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Kampanye</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Ad Set</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Iklan</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Sumber</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Tanggal</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const cs = row.customer?.clickSessions[0];
                const name = row.customer?.name ?? row.customer?.phone ?? "—";
                return (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    {/* Lead */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-foreground truncate max-w-[160px]">{name}</div>
                      {row.customer?.phone && row.customer.name && (
                        <div className="text-xs text-muted-foreground">{row.customer.phone}</div>
                      )}
                    </td>

                    {/* Event */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", eventColor(row.eventName))}>
                        {row.eventName}
                      </span>
                    </td>

                    {/* Nilai */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">
                      {row.value ? (
                        <span className="text-green-700">{fmt(row.value, row.currency)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Kampanye */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs max-w-[180px] truncate block" title={cs?.campaignName ?? undefined}>
                        {cs?.campaignName ?? (row.campaignId ? <span className="font-mono text-[10px] text-muted-foreground">{row.campaignId}</span> : "—")}
                      </span>
                    </td>

                    {/* Ad Set */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-muted-foreground max-w-[160px] truncate block" title={cs?.adsetName ?? undefined}>
                        {cs?.adsetName ?? "—"}
                      </span>
                    </td>

                    {/* Iklan */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-muted-foreground max-w-[160px] truncate block" title={cs?.adName ?? undefined}>
                        {cs?.adName ?? (row.adId ? <span className="font-mono text-[10px]">{row.adId}</span> : "—")}
                      </span>
                    </td>

                    {/* Sumber */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {cs ? (
                        <div className="text-xs">
                          <span className="font-medium">{cs.utmSource ?? cs.siteSourceName ?? "—"}</span>
                          {cs.utmMedium && <span className="text-muted-foreground"> / {cs.utmMedium}</span>}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Tanggal */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {fmtDate(row.sentAt)}
                    </td>

                    {/* Aksi */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.customerId && (
                        <Link
                          href={`/customers/${row.customerId}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Profil
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
