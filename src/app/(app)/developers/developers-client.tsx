"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Copy, Check, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { relativeTime } from "@/lib/format";

const BASE = "https://crm.klinikaqma.com";

const TABS = [
  { id: "keys", label: "API Keys" },
  { id: "endpoint", label: "Endpoint & Contoh" },
  { id: "webhook", label: "Webhook Keluar" },
] as const;

export function DevelopersClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("keys");
  return (
    <>
      <PageHeader title="API & Webhook" description="Integrasikan CRM dengan tools lain" />
      <div className="border-b border-border bg-white px-6">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={"border-b-2 px-4 py-3 text-sm font-medium transition-colors " + (tab === t.id ? "border-primary text-primary-dark" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6">
        {tab === "keys" && <KeysTab />}
        {tab === "endpoint" && <EndpointTab />}
        {tab === "webhook" && <WebhookTab />}
      </div>
    </>
  );
}

type Key = { id: string; name: string; prefix: string; active: boolean; lastUsedAt: string | null; createdAt: string };

function KeysTab() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/dev/keys");
    if (r.ok) setKeys((await r.json()).keys);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    const r = await fetch("/api/dev/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setBusy(false);
    if (r.ok) { setNewKey((await r.json()).key); setName(""); load(); }
  }
  async function del(id: string) { await fetch(`/api/dev/keys/${id}`, { method: "DELETE" }); load(); }

  return (
    <div className="max-w-2xl space-y-4">
      {newKey && (
        <div className="rounded-[var(--radius-lg)] border border-primary/40 bg-primary-soft p-4">
          <div className="mb-1 text-sm font-semibold text-primary-dark">API Key baru — simpan sekarang, cuma muncul sekali!</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-white px-3 py-2 font-mono text-xs">{newKey}</code>
            <button onClick={() => { navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div className="flex-1">
          <label className="text-xs font-medium">Nama key baru</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Integrasi Scalev" className="mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary" />
        </div>
        <button onClick={create} disabled={busy || !name.trim()} className="inline-flex h-10 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
          <Plus className="h-4 w-4" /> Buat
        </button>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white">
        {keys.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Belum ada API key.</div>}
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
            <div className="flex items-center gap-3">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{k.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{k.prefix}••••••••</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{k.lastUsedAt ? `dipakai ${relativeTime(k.lastUsedAt)}` : "belum dipakai"}</span>
              <button onClick={() => del(k.id)} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-[#1c1c1e] p-3 text-xs text-white">
      <code>{children}</code>
    </pre>
  );
}

function EndpointTab() {
  return (
    <div className="max-w-3xl space-y-5">
      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-5">
        <div className="text-sm font-semibold">Base URL</div>
        <code className="mt-1 block rounded-md bg-muted px-3 py-2 text-sm">{BASE}/api/v1</code>
        <p className="mt-2 text-xs text-muted-foreground">Semua request pakai header <code className="rounded bg-muted px-1">Authorization: Bearer &lt;API_KEY&gt;</code></p>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-5">
        <div className="mb-2 text-sm font-semibold">Kirim pesan WhatsApp</div>
        <Code>{`curl -X POST ${BASE}/api/v1/messages \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "628123456789",
    "text": "Halo dari integrasi!"
  }'`}</Code>
        <p className="mt-2 text-xs text-muted-foreground">Kirim template (buat di luar window 24 jam): tambahkan <code className="rounded bg-muted px-1">{`"type":"template","template":"nama_template","language":"id"`}</code>. Opsional <code className="rounded bg-muted px-1">{`"from":"<phone_number_id>"`}</code> buat pilih nomor pengirim.</p>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-5">
        <div className="mb-2 text-sm font-semibold">Ambil daftar pelanggan</div>
        <Code>{`curl ${BASE}/api/v1/customers \\
  -H "Authorization: Bearer YOUR_API_KEY"`}</Code>
      </div>
    </div>
  );
}

type Endpoint = { id: string; url: string; events: string[]; active: boolean };
const EVENTS = ["message.received", "message.sent"];

function WebhookTab() {
  const [items, setItems] = useState<Endpoint[]>([]);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["message.received"]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/dev/webhooks");
    if (r.ok) setItems((await r.json()).endpoints);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!url.trim()) return;
    setBusy(true);
    await fetch("/api/dev/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, events }) });
    setBusy(false); setUrl(""); load();
  }
  async function del(id: string) { await fetch(`/api/dev/webhooks/${id}`, { method: "DELETE" }); load(); }
  function toggleEvent(e: string) { setEvents((arr) => arr.includes(e) ? arr.filter((x) => x !== e) : [...arr, e]); }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div className="text-sm font-semibold">Tambah webhook keluar</div>
        <p className="text-xs text-muted-foreground">CRM akan kirim POST JSON ke URL ini tiap ada event terpilih. Contoh event pesan masuk bakal diteruskan ke tools Master.</p>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://tools-lain.com/webhook" className="h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary" />
        <div className="flex flex-wrap gap-2">
          {EVENTS.map((e) => (
            <button key={e} onClick={() => toggleEvent(e)} className={"rounded-full border px-3 py-1 text-xs font-medium " + (events.includes(e) ? "border-primary bg-primary-soft text-primary-dark" : "border-border text-muted-foreground")}>{e}</button>
          ))}
        </div>
        <button onClick={add} disabled={busy || !url.trim() || events.length === 0} className="inline-flex h-10 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"><Plus className="h-4 w-4" /> Tambah</button>
      </div>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white">
        {items.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Belum ada webhook keluar.</div>}
        {items.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{w.url}</div>
              <div className="text-xs text-muted-foreground">{w.events.join(", ")}</div>
            </div>
            <button onClick={() => del(w.id)} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
