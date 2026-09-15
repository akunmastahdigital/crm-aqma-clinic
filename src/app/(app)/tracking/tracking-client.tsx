"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus, Pencil, Trash2, Copy, Check, Link2,
  ToggleLeft, ToggleRight, ExternalLink, Globe,
  Wifi, WifiOff, Info, Code, Activity, CheckCircle2, XCircle, BarChart2, Users,
} from "lucide-react";
import { AttributionAnalytics } from "./attribution-analytics";
import { LeadAttribution } from "./lead-attribution";

function SnippetBox() {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://crm.klinikaqma.com";
  const snippet = `<script src="${origin}/api/tracking/snippet" async></script>`;
  const copy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-md bg-slate-900 text-slate-100 text-xs font-mono p-3 pr-10 overflow-x-auto">
      <code>{snippet}</code>
      <button onClick={copy} className="absolute right-2 top-2 p-1 hover:text-white text-slate-400 transition-colors">
        {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

type Channel = { id: string; label: string; sub: string | null; type: string };
type CapiEventRow = {
  id: string; eventName: string; status: string; sentAt: string;
  fbclid?: string; campaignId?: string; adId?: string; value?: number;
  customer?: { name?: string; phone?: string } | null;
};

type TrackingLink = {
  id: string; slug: string; name: string; greetingTemplate: string;
  codePosition: string; channelId: string | null; isActive: boolean;
  createdAt: string;
  _count: { clickSessions: number };
  channel: { id?: string; label: string; displayPhone: string | null } | null;
};
type TrackingDomain = { id: string; domain: string; label: string | null; createdAt: string };



const EMPTY_LINK = {
  slug: "", name: "", greetingTemplate: "", codePosition: "after", channelId: "",
};

const SERVER_IP = "185.227.135.206";
const TABS = [
  { id: "tracking", label: "Tracking Links" },
  { id: "leads", label: "Leads" },
  { id: "analytics", label: "Analytics" },
] as const;
type TabId = typeof TABS[number]["id"];

export function TrackingClient() {
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [capiEvents, setCapiEvents] = useState<CapiEventRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("tracking");
  const [domains, setDomains] = useState<TrackingDomain[]>([]);
  const [domainStatus, setDomainStatus] = useState<Record<string, "checking" | "ok" | "fail">>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<TrackingLink> & typeof EMPTY_LINK>(EMPTY_LINK);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedUtm, setCopiedUtm] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [newDomainLabel, setNewDomainLabel] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [activeDomainForLink, setActiveDomainForLink] = useState("");

  const loadLinks = useCallback(async () => {
    const r = await fetch("/api/tracking/links");
    if (r.ok) setLinks((await r.json()).links);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLinks();
    fetch("/api/tracking/events").then(r => r.json()).then(d => setCapiEvents(d.events ?? []));
    fetch("/api/inbox/accounts").then(r => r.json()).then(d => setChannels((d.accounts ?? []).filter((a: Channel) => a.type === "WA_CLOUD")));
    fetch("/api/tracking/domains").then(r => r.json()).then(d => {
      const list: TrackingDomain[] = d.domains ?? [];
      setDomains(list);
      if (list.length > 0) setActiveDomainForLink(list[0].domain);
    });
  }, [loadLinks]);

  async function checkDomain(d: TrackingDomain) {
    setDomainStatus(p => ({ ...p, [d.id]: "checking" }));
    try {
      const r = await fetch(`${d.domain}/api/tracking/ping`, { signal: AbortSignal.timeout(5000) });
      const json = await r.json().catch(() => ({}));
      const ok = r.ok && json.service === "aqma-crm-tracking";
      setDomainStatus(p => ({ ...p, [d.id]: ok ? "ok" : "fail" }));
    } catch {
      setDomainStatus(p => ({ ...p, [d.id]: "fail" }));
    }
  }

  async function addDomain() {
    if (!newDomain.trim()) return;
    setAddingDomain(true);
    const r = await fetch("/api/tracking/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: newDomain.trim(), label: newDomainLabel.trim() || null }),
    });
    if (r.ok) {
      setNewDomain(""); setNewDomainLabel("");
      const d = await fetch("/api/tracking/domains").then(r => r.json());
      const list = d.domains ?? [];
      setDomains(list);
      if (list.length === 1) setActiveDomainForLink(list[0].domain);
    } else {
      const err = await r.json();
      alert(err.error ?? "Gagal menambahkan domain");
    }
    setAddingDomain(false);
  }

  async function delDomain(d: TrackingDomain) {
    if (!confirm(`Hapus domain "${d.domain}"?`)) return;
    await fetch(`/api/tracking/domains/${d.id}`, { method: "DELETE" });
    setDomains(p => p.filter(x => x.id !== d.id));
  }

  function openCreate() { setEditing({ ...EMPTY_LINK }); setShowModal(true); }
  function openEdit(link: TrackingLink) {
    setEditing({ ...link, channelId: link.channelId ?? "" });
    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    const isNew = !editing.id;
    const url = isNew ? "/api/tracking/links" : `/api/tracking/links/${editing.id}`;
    const r = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    if (r.ok) { setShowModal(false); loadLinks(); }
    else { const d = await r.json(); alert(d.error ?? "Gagal menyimpan"); }
    setSaving(false);
  }

  async function toggle(link: TrackingLink) {
    await fetch(`/api/tracking/links/${link.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...link, channelId: link.channelId, isActive: !link.isActive }),
    });
    loadLinks();
  }

  async function del(link: TrackingLink) {
    if (!confirm(`Hapus link "${link.name}"?`)) return;
    await fetch(`/api/tracking/links/${link.id}`, { method: "DELETE" });
    loadLinks();
  }

  function copyLink(link: TrackingLink) {
    const base = activeDomainForLink || (domains[0]?.domain ?? window.location.origin);
    navigator.clipboard.writeText(`${base}/c/${link.slug}`);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(p => p === link.id ? null : p), 1500);
  }

  const previewGreeting = (tpl: string, pos: string) => {
    const code = "[T-A3B7C]";
    return pos === "before" ? `${code} ${tpl}` : `${tpl} ${code}`;
  };

  const field = "mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="p-6">
      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 border-b">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as TabId)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.id === "analytics" && <BarChart2 size={14} />}
            {t.id === "leads" && <Users size={14} />}
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "analytics" && <AttributionAnalytics />}
      {activeTab === "leads" && <LeadAttribution links={links.map(l => ({ id: l.id, name: l.name, slug: l.slug }))} />}
      {activeTab === "tracking" && <div className="space-y-6 max-w-3xl">

      {/* ── Domain Management ── */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div className="mb-3 font-semibold text-sm flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" /> Redirect Domains
        </div>

        {/* DNS instruction */}
        <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <strong>Setup DNS:</strong> Arahkan A Record domain ke IP server{" "}
          <span className="font-mono font-bold">{SERVER_IP}</span>, lalu klik "Cek Status" untuk verifikasi.
        </div>

        {/* Domain list */}
        {domains.length > 0 && (
          <div className="mb-3 space-y-2">
            {domains.map(d => {
              const st = domainStatus[d.id];
              return (
                <div key={d.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs truncate">{d.domain}</div>
                    {d.label && <div className="text-[11px] text-muted-foreground">{d.label}</div>}
                  </div>
                  {st === "ok" && <span className="flex items-center gap-1 text-emerald-600 text-xs"><Wifi className="h-3.5 w-3.5" /> Terhubung</span>}
                  {st === "fail" && <span className="flex items-center gap-1 text-red-500 text-xs"><WifiOff className="h-3.5 w-3.5" /> Belum terhubung</span>}
                  {st === "checking" && <span className="text-xs text-muted-foreground animate-pulse">Mengecek...</span>}
                  <button onClick={() => checkDomain(d)} className="text-xs text-primary hover:underline whitespace-nowrap">Cek Status</button>
                  <a href={`${d.domain}/c/test`} target="_blank" rel="noopener noreferrer" title="Buka" className="text-muted-foreground hover:text-primary">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button onClick={() => delDomain(d)} className="text-muted-foreground hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add domain */}
        <div className="flex gap-2">
          <input value={newDomain} onChange={e => setNewDomain(e.target.value)}
            placeholder="https://crm.klinikaqma.com"
            className="h-9 flex-1 rounded-md border border-input px-3 text-sm outline-none focus:border-primary font-mono" />
          <input value={newDomainLabel} onChange={e => setNewDomainLabel(e.target.value)}
            placeholder="Label (opsional)"
            className="h-9 w-36 rounded-md border border-input px-3 text-sm outline-none focus:border-primary" />
          <button onClick={addDomain} disabled={addingDomain || !newDomain.trim()}
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
            {addingDomain ? "..." : "Tambah"}
          </button>
        </div>

        {/* Domain selector for copy link */}
        {domains.length > 1 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3 w-3" />
            Domain untuk copy link:
            <select value={activeDomainForLink} onChange={e => setActiveDomainForLink(e.target.value)}
              className="h-7 rounded border border-input px-2 text-xs outline-none focus:border-primary">
              {domains.map(d => <option key={d.id} value={d.domain}>{d.label ?? d.domain}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Tracking Links ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-semibold">Tracking Links ({links.length})</span>
          <button onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark">
            <Plus className="h-4 w-4" /> Buat Link
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Memuat...</div>
        ) : links.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-white p-10 text-center">
            <Link2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Belum ada tracking link.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {links.map(link => (
              <div key={link.id} className="rounded-[var(--radius-md)] border border-border bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{link.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${link.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        {link.isActive ? "Aktif" : "Nonaktif"}
                      </span>

                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {link._count.clickSessions} klik
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">/c/{link.slug}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      WA: <span className="text-foreground">{link.channel?.label ?? "—"}</span>
                      {link.channel?.displayPhone && <span className="ml-1 text-muted-foreground">({link.channel.displayPhone})</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Preview: <span className="text-foreground">{previewGreeting(link.greetingTemplate, link.codePosition)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => copyLink(link)} title="Salin link"
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary">
                      {copiedId === link.id ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <button onClick={() => toggle(link)} title={link.isActive ? "Nonaktifkan" : "Aktifkan"}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary">
                      {link.isActive ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4" />}
                    </button>
                    <button onClick={() => openEdit(link)} title="Edit"
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => del(link)} title="Hapus"
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal Create/Edit ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] bg-white p-5 shadow-xl">
            <h3 className="mb-4 font-semibold">{editing.id ? "Edit Link" : "Buat Link Baru"}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Nama Campaign</label>
                <input value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                  placeholder="Promo Facial Glow Desember" className={field} />
              </div>
              <div>
                <label className="text-xs font-medium">Slug (URL)</label>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-muted-foreground shrink-0">/c/</span>
                  <input
                    value={editing.slug}
                    onChange={e => setEditing(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))}
                    placeholder="promo-facial-glow-desember"
                    disabled={!!editing.id}
                    className="h-10 flex-1 rounded-md border border-input px-3 text-sm outline-none focus:border-primary font-mono disabled:bg-muted" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium">Nomor WA (Channel)</label>
                <select value={editing.channelId ?? ""} onChange={e => setEditing(p => ({ ...p, channelId: e.target.value }))} className={field}>
                  <option value="">— Pilih channel WA —</option>
                  {channels.map(ch => (
                    <option key={ch.id} value={ch.id}>
                      {ch.label}{ch.sub ? ` (${ch.sub})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Greeting Text</label>
                <textarea
                  value={editing.greetingTemplate}
                  onChange={e => setEditing(p => ({ ...p, greetingTemplate: e.target.value }))}
                  placeholder="Halo, saya tertarik dengan Promo Facial Glow"
                  rows={3}
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium">Posisi Kode [T-XXXXX]</label>
                <select value={editing.codePosition} onChange={e => setEditing(p => ({ ...p, codePosition: e.target.value }))} className={field}>
                  <option value="before">Sebelum teks</option>
                  <option value="after">Setelah teks</option>
                </select>
              </div>

              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                Preview: <span className="font-medium text-foreground">{previewGreeting(editing.greetingTemplate, editing.codePosition)}</span>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="h-9 rounded-md border border-border px-4 text-sm hover:bg-muted">Batal</button>
              <button
                onClick={save}
                disabled={saving || !editing.name || !editing.slug || !editing.channelId || !editing.greetingTemplate}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LP Tracker Script ── */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Code size={16} className="text-primary" />
          <span className="font-semibold">LP Tracker Script</span>
          <span className="ml-auto text-xs text-muted-foreground">Tempel di &lt;head&gt; landing page</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Snippet ini otomatis mencatat <strong>LP view</strong> dan <strong>klik CTA WhatsApp</strong>
          beserta fbclid, UTM, dan parameter Meta Ads lainnya.
          Data tersimpan di CRM dan dipakai untuk atribusi lead.
        </p>
        <SnippetBox />
        <p className="text-xs text-muted-foreground">
          Kode ini aman ditempel di semua landing page — termasuk domain custom. Tidak ada dependency eksternal.
        </p>
      </div>

      {/* ── Template URL Parameters ── */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-primary" />
          <span className="font-semibold">Template URL Parameters (Meta Ads)</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Tempel sebagai <strong>URL Parameters</strong> di iklan Meta Ads. Ganti{" "}
          <code className="bg-muted px-1 rounded">YOUR_AD_ACCOUNT_ID</code> dengan ID akun ads kamu.
        </p>
        <div className="relative">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 pr-20 text-[11px] font-mono leading-relaxed break-all select-all text-foreground">
            {"utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&campaign_name={{campaign.name}}&adset_name={{adset.name}}&ad_name={{ad.name}}&site_source_name={{site_source_name}}&ad_meta={{placement}}&ad_account_id=YOUR_AD_ACCOUNT_ID"}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText("utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}&campaign_name={{campaign.name}}&adset_name={{adset.name}}&ad_name={{ad.name}}&site_source_name={{site_source_name}}&ad_meta={{placement}}&ad_account_id=YOUR_AD_ACCOUNT_ID");
              setCopiedUtm(true);
              setTimeout(() => setCopiedUtm(false), 1500);
            }}
            className="absolute right-2 top-2 flex items-center gap-1 rounded border border-border bg-white px-2 py-1 text-xs hover:bg-muted"
          >
            {copiedUtm ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            {copiedUtm ? "Tersalin!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Setelah dipasang di iklan, semua data kampanye (campaign, adset, ad) akan otomatis terkirim ke CRM dan CAPI Meta.
        </p>
      </div>

      {/* ── CAPI Event Log ── */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-primary" />
          <span className="font-semibold">CAPI Event Log</span>
          <span className="ml-auto text-xs text-muted-foreground">{capiEvents.length} event terakhir</span>
          <button onClick={() => { setLoadingEvents(true); fetch("/api/tracking/events").then(r=>r.json()).then(d=>{setCapiEvents(d.events??[]);setLoadingEvents(false);}); }} className="text-xs text-primary hover:underline">{loadingEvents ? ".." : "Refresh"}</button>
        </div>
        {capiEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground">Belum ada event yang dikirim ke Meta CAPI.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b text-muted-foreground">
                <th className="text-left py-1.5 pr-3 font-medium">Event</th>
                <th className="text-left py-1.5 pr-3 font-medium">Pelanggan</th>
                <th className="text-left py-1.5 pr-3 font-medium">Campaign</th>
                <th className="text-left py-1.5 pr-3 font-medium">Status</th>
                <th className="text-left py-1.5 font-medium">Waktu</th>
              </tr></thead>
              <tbody>
                {capiEvents.map(e => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-1.5 pr-3 font-medium">{e.eventName}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{e.customer?.name ?? e.customer?.phone ?? "-"}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground font-mono">{e.campaignId?.slice(0,12) ?? "-"}</td>
                    <td className="py-1.5 pr-3">
                      {e.status === "sent" ? <span className="inline-flex items-center gap-0.5 text-green-700"><CheckCircle2 size={11} /> sent</span> : <span className="inline-flex items-center gap-0.5 text-red-600"><XCircle size={11} /> error</span>}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{new Date(e.sentAt).toLocaleString("id-ID", {dateStyle:"short",timeStyle:"short"})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>}
    </div>
  );
}
