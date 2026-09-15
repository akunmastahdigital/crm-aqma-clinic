"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, RefreshCw, ChevronLeft, ChevronRight, ExternalLink,
  Smartphone, Monitor, Tablet, Zap, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";

type CapiEventLog = { eventName: string; value: number | null; status: string; sentAt: string };
type Lead = {
  id: string; code: string; isCTWA: boolean; createdAt: string; matchedAt: string | null;
  linkName: string; linkSlug: string;
  customerName: string | null; customerPhone: string | null; customerId: string | null;
  customerTags: string[];
  campaignName: string | null; campaignId: string | null;
  adsetName: string | null; adsetId: string | null;
  adName: string | null; adId: string | null;
  placement: string | null; siteSourceName: string | null;
  fbclid: string | null; ip: string | null;
  device: string; lastEvent: string | null; events: CapiEventLog[];
};
type LinkOption = { id: string; name: string; slug: string };

const CAPI_EVENTS = [
  "Lead","CompleteRegistration","SubmitApplication","Contact","Schedule",
  "Purchase","Subscribe","StartTrial","Donate",
  "InitiateCheckout","AddPaymentInfo","AddToCart","AddToWishlist",
  "ViewContent","Search","FindLocation",
];

const EVENT_COLOR: Record<string, string> = {
  Purchase: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Lead: "bg-blue-50 text-blue-700 border-blue-200",
  CompleteRegistration: "bg-violet-50 text-violet-700 border-violet-200",
  AddPaymentInfo: "bg-orange-50 text-orange-700 border-orange-200",
  InitiateCheckout: "bg-amber-50 text-amber-700 border-amber-200",
  Subscribe: "bg-cyan-50 text-cyan-700 border-cyan-200",
  StartTrial: "bg-indigo-50 text-indigo-700 border-indigo-200",
};
function eventColor(e: string | null) {
  if (!e) return "bg-muted text-muted-foreground border-border";
  return EVENT_COLOR[e] ?? "bg-muted text-muted-foreground border-border";
}
function DeviceIcon({ device }: { device: string }) {
  if (device === "iPhone" || device === "Android") return <Smartphone size={12} className="text-blue-500" />;
  if (device === "iPad") return <Tablet size={12} className="text-violet-500" />;
  return <Monitor size={12} className="text-muted-foreground" />;
}
function fmtRp(v: number) { return "Rp " + v.toLocaleString("id-ID"); }

function EventLog({ events }: { events: CapiEventLog[] }) {
  if (!events.length) return <p className="text-xs text-muted-foreground italic">Belum ada event terkirim</p>;
  return (
    <table className="w-full text-xs">
      <thead><tr className="border-b">
        <th className="text-left py-1 pr-3 text-muted-foreground font-medium">Waktu</th>
        <th className="text-left py-1 pr-3 text-muted-foreground font-medium">Event</th>
        <th className="text-left py-1 pr-3 text-muted-foreground font-medium">Value</th>
        <th className="text-left py-1 text-muted-foreground font-medium">Status</th>
      </tr></thead>
      <tbody>
        {events.map((e, i) => (
          <tr key={i} className="border-b last:border-0">
            <td className="py-1 pr-3 text-muted-foreground whitespace-nowrap">
              {new Date(e.sentAt).toLocaleDateString("id-ID",{day:"2-digit",month:"short"})} {new Date(e.sentAt).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}
            </td>
            <td className="py-1 pr-3">
              <span className={"inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold " + eventColor(e.eventName)}>{e.eventName}</span>
            </td>
            <td className="py-1 pr-3 font-medium">{e.value ? fmtRp(e.value) : "—"}</td>
            <td className="py-1">
              {e.status === "sent"
                ? <span className="flex items-center gap-0.5 text-green-600"><CheckCircle size={10} /> sent</span>
                : <span className="flex items-center gap-0.5 text-red-500"><XCircle size={10} /> error</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LeadAttribution({ links }: { links: LinkOption[] }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [linkId, setLinkId] = useState("");
  const [source, setSource] = useState<"" | "ctwa" | "lpwa">("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [triggerLeadId, setTriggerLeadId] = useState<string | null>(null);
  const [triggerEvent, setTriggerEvent] = useState("Lead");
  const [purchaseModal, setPurchaseModal] = useState(false);
  const [purchaseValue, setPurchaseValue] = useState("");
  const [firing, setFiring] = useState(false);
  const [fireResult, setFireResult] = useState<Record<string, string>>({});
  const [perRowEvent, setPerRowEvent] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), filter });
    if (linkId) params.set("linkId", linkId);
    if (source) params.set("source", source);
    fetch("/api/tracking/leads?" + params)
      .then(r => r.json())
      .then(d => { setLeads(d.leads ?? []); setTotal(d.total ?? 0); setPages(d.pages ?? 1); })
      .finally(() => setLoading(false));
  }, [page, filter, linkId, source]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filter, linkId, source]);

  function fmt(dt: string) {
    const d = new Date(dt);
    return d.toLocaleDateString("id-ID",{day:"2-digit",month:"short"}) + " " +
      d.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});
  }

  function getRowEvent(leadId: string) { return perRowEvent[leadId] ?? "Lead"; }

  async function doTrigger(leadId: string, eventName: string, value?: string) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead?.customerId) return;
    setFiring(true);
    const body: Record<string, unknown> = { customerId: lead.customerId, eventName };
    if (value) body.value = parseFloat(value.replace(/\./g,"").replace(",","."));
    const r = await fetch("/api/tracking/leads/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    setFiring(false);
    setPurchaseModal(false);
    setPurchaseValue("");
    setTriggerLeadId(null);
    const label = d.labelSet ? " · label \u2192 " + d.labelSet : "";
    const msg = d.ok ? "\u2713 " + eventName + " terkirim" + label : "\u2717 Gagal";
    setFireResult(prev => ({ ...prev, [leadId]: msg }));
    load();
  }

  function handleFire(leadId: string) {
    const ev = getRowEvent(leadId);
    setTriggerLeadId(leadId);
    setTriggerEvent(ev);
    if (ev === "Purchase") { setPurchaseModal(true); }
    else { doTrigger(leadId, ev); }
  }

  return (
    <div className="space-y-4 max-w-7xl">
      {purchaseModal && triggerLeadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setPurchaseModal(false); setPurchaseValue(""); }}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-sm">Input Nilai Purchase</p>
            <p className="text-xs text-muted-foreground">
              Lead: <strong>{leads.find(l => l.id === triggerLeadId)?.customerName ?? leads.find(l => l.id === triggerLeadId)?.customerPhone ?? "—"}</strong>
            </p>
            <div>
              <label className="text-xs text-muted-foreground">Nominal (Rp)</label>
              <input autoFocus
                className="mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary font-mono"
                placeholder="25.000.000"
                value={purchaseValue}
                onChange={e => setPurchaseValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") doTrigger(triggerLeadId, "Purchase", purchaseValue); }}
              />
            </div>
            <div className="flex gap-2">
              <button disabled={firing} onClick={() => doTrigger(triggerLeadId, "Purchase", purchaseValue)}
                className="flex-1 h-9 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {firing ? "Mengirim..." : "Kirim Purchase"}
              </button>
              <button onClick={() => { setPurchaseModal(false); setPurchaseValue(""); setTriggerLeadId(null); }}
                className="h-9 px-3 rounded-md border text-sm hover:bg-muted">Batal</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border p-0.5 bg-muted/30">
          {(["all","matched","unmatched"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={"h-7 px-3 rounded-md text-xs font-medium transition-colors " + (filter === f ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {f === "all" ? "Semua" : f === "matched" ? "Terkonek WA" : "Belum Konek"}
            </button>
          ))}
        </div>
        <select value={source} onChange={e => setSource(e.target.value as "" | "ctwa" | "lpwa")}
          className="h-8 rounded-md border border-input px-2 text-xs outline-none bg-white">
          <option value="">Semua Sumber</option>
          <option value="ctwa">CTWA (Klik Iklan WA)</option>
          <option value="lpwa">LPWA (Landing Page)</option>
        </select>
        <select value={linkId} onChange={e => setLinkId(e.target.value)}
          className="h-8 rounded-md border border-input px-2 text-xs outline-none bg-white">
          <option value="">Semua Link</option>
          {links.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">{total} lead</span>
        <button onClick={load} className="h-7 w-7 flex items-center justify-center rounded-full border hover:bg-muted">
          <RefreshCw size={12} className={loading ? "animate-spin text-primary" : "text-muted-foreground"} />
        </button>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Memuat...</div>
        ) : leads.length === 0 ? (
          <div className="py-12 text-center">
            <Users size={32} className="mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Belum ada lead</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="w-6 px-2"></th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Waktu</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Kode</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Pelanggan</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Campaign</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Creative</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Placement</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Device</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Event Terakhir</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Trigger Manual</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(l => (
                  <>
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/10">
                      <td className="px-2 py-2.5">
                        <button onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                          className="text-muted-foreground hover:text-foreground">
                          {expanded === l.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{fmt(l.createdAt)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">{l.code}</span>
                          {l.isCTWA && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
                              CTWA
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {l.customerId ? (
                          <div>
                            <a href={"/customers/" + l.customerId}
                              className="flex items-center gap-1 text-primary hover:underline font-medium">
                              {l.customerName ?? l.customerPhone ?? "—"} <ExternalLink size={10} />
                            </a>
                            {l.customerTags.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">{l.customerTags.join(", ")}</span>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground italic">Belum chat</span>}
                      </td>
                      <td className="px-3 py-2.5 max-w-[120px]">
                        {l.campaignName
                          ? <span className="truncate block" title={l.campaignName}>{l.campaignName}</span>
                          : l.isCTWA && l.adId
                            ? <span className="font-mono text-[10px] text-muted-foreground" title={"Ad ID: " + l.adId}>Ad {l.adId.slice(-6)}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2.5 max-w-[120px]">
                        {l.adName ? <span className="truncate block text-xs" title={l.adName}>{l.adName}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {l.placement ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">{l.placement}</span>
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1"><DeviceIcon device={l.device} />{l.device}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={"inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold " + eventColor(l.lastEvent)}>
                          {l.lastEvent ?? "Belum ada"}
                        </span>
                        {l.events.length > 0 && (
                          <span className="ml-1 text-[10px] text-muted-foreground">{l.events.length}x</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {l.customerId ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <select
                                className="h-7 rounded border border-input px-1.5 text-xs outline-none bg-white focus:border-primary"
                                value={getRowEvent(l.id)}
                                onChange={e => setPerRowEvent(prev => ({ ...prev, [l.id]: e.target.value }))}>
                                {CAPI_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                              </select>
                              <button
                                disabled={firing && triggerLeadId === l.id}
                                onClick={() => handleFire(l.id)}
                                className="h-7 px-2 rounded bg-primary text-white text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-0.5 whitespace-nowrap">
                                <Zap size={10} /> Fire
                              </button>
                            </div>
                            {fireResult[l.id] && (
                              <p className={"text-[10px] " + (fireResult[l.id].startsWith("✓") ? "text-green-600" : "text-red-500")}>
                                {fireResult[l.id]}
                              </p>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                    </tr>
                    {expanded === l.id && (
                      <tr key={l.id + "-x"} className="border-b bg-blue-50/20">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-semibold mb-2">Event Log Meta CAPI</p>
                              <EventLog events={l.events} />
                            </div>
                            <div className="text-xs space-y-1.5">
                              <p className="font-semibold mb-2">Detail Tracking</p>
                              <p><span className="text-muted-foreground w-24 inline-block">Campaign ID</span>{l.campaignId ?? "—"}</p>
                              <p><span className="text-muted-foreground w-24 inline-block">Ad Set</span>{l.adsetName ?? "—"}</p>
                              <p><span className="text-muted-foreground w-24 inline-block">Ad</span>{l.adName ?? "—"}</p>
                              <p><span className="text-muted-foreground w-24 inline-block">Site Source</span>{l.siteSourceName ?? "—"}</p>
                              <p><span className="text-muted-foreground w-24 inline-block">IP</span>{l.ip ?? "—"}</p>
                              <p><span className="text-muted-foreground w-24 inline-block">fbclid</span><span className="font-mono">{l.fbclid ?? "—"}</span></p>
                              <p><span className="text-muted-foreground w-24 inline-block">Matched</span>{l.matchedAt ? fmt(l.matchedAt) : "—"}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="h-7 w-7 flex items-center justify-center rounded border hover:bg-muted disabled:opacity-40">
            <ChevronLeft size={13} />
          </button>
          <span className="text-xs text-muted-foreground">Hal {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
            className="h-7 w-7 flex items-center justify-center rounded border hover:bg-muted disabled:opacity-40">
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
