"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X, Trash2, Paperclip, FileText, ImageIcon, Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type Media = { url: string; type: string; name: string };
type QuickReply = {
  id: string;
  shortcut: string;
  category: string | null;
  title: string | null;
  text: string | null;
  attachments: Media[] | null;
};

const TABS = [
  { id: "quick", label: "Balasan Cepat" },
  { id: "autoreply", label: "Balas Otomatis" },
  { id: "tag", label: "Tag Otomatis" },
  { id: "rules", label: "Rule Engine" },
] as const;

export function AutomationClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("quick");
  return (
    <>
      <PageHeader
        title="Automasi"
        description="Balasan cepat, balas otomatis, dan tag otomatis"
      />
      <div className="border-b border-border bg-white px-6">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                "border-b-2 px-4 py-3 text-sm font-medium transition-colors " +
                (tab === t.id
                  ? "border-primary text-primary-dark"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6">
        {tab === "quick" && <QuickRepliesTab />}
        {tab === "autoreply" && <AutoReplyTab />}
        {tab === "tag" && <AutoTagTab />}
        {tab === "rules" && <RuleEngineTab />}
      </div>
    </>
  );
}

type AutoReply = {
  id: string;
  name: string;
  trigger: "KEYWORD" | "FIRST_MESSAGE";
  keywords: string[];
  replyText: string | null;
  active: boolean;
};

function AutoReplyTab() {
  const [items, setItems] = useState<AutoReply[]>([]);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<"KEYWORD" | "FIRST_MESSAGE">("KEYWORD");
  const [keywords, setKeywords] = useState("");
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/auto-replies");
    if (r.ok) setItems((await r.json()).items);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setErr("");
    setBusy(true);
    const r = await fetch("/api/auto-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        trigger,
        keywords: keywords.split(",").map((s) => s.trim()).filter(Boolean),
        replyText,
      }),
    });
    setBusy(false);
    if (r.ok) { setName(""); setKeywords(""); setReplyText(""); load(); }
    else setErr((await r.json()).error ?? "Gagal simpan");
  }
  async function toggle(it: AutoReply) {
    await fetch(`/api/auto-replies/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !it.active }) });
    load();
  }
  async function del(id: string) {
    await fetch(`/api/auto-replies/${id}`, { method: "DELETE" });
    load();
  }

  const field = "mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div className="mb-3 text-sm font-semibold">Aturan baru</div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Nama aturan</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Tanya Harga" className={field} />
            </div>
            <div>
              <label className="text-xs font-medium">Pemicu</label>
              <select value={trigger} onChange={(e) => setTrigger(e.target.value as "KEYWORD" | "FIRST_MESSAGE")} className={field}>
                <option value="KEYWORD">Pesan mengandung kata</option>
                <option value="FIRST_MESSAGE">Chat pertama (salam)</option>
              </select>
            </div>
          </div>
          {trigger === "KEYWORD" && (
            <div>
              <label className="text-xs font-medium">Kata kunci (pisah koma)</label>
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="harga, biaya, tarif" className={field} />
            </div>
          )}
          <div>
            <label className="text-xs font-medium">Balasan otomatis</label>
            <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Halo, berikut daftar harga kami..." className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          {err && <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
          <button onClick={add} disabled={busy || !name.trim()} className="inline-flex h-10 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
            <Plus className="h-4 w-4" /> Simpan aturan
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {items.length === 0 && <div className="rounded-lg border border-dashed border-border bg-white p-6 text-center text-sm text-muted-foreground">Belum ada aturan balas otomatis.</div>}
        {items.map((it) => (
          <div key={it.id} className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-white p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{it.name}</span>
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-dark">
                  {it.trigger === "KEYWORD" ? "Kata kunci" : "Chat pertama"}
                </span>
                {!it.active && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Nonaktif</span>}
              </div>
              {it.trigger === "KEYWORD" && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {it.keywords.map((k) => <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{k}</span>)}
                </div>
              )}
              {it.replyText && <p className="mt-1 truncate text-sm text-muted-foreground">{it.replyText}</p>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => toggle(it)} className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">
                {it.active ? "Matikan" : "Aktifkan"}
              </button>
              <button onClick={() => del(it.id)} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type AutoTag = { id: string; tag: string; keywords: string[] };

function AutoTagTab() {
  const [items, setItems] = useState<AutoTag[]>([]);
  const [tag, setTag] = useState("");
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/auto-tags");
    if (r.ok) setItems((await r.json()).items);
  }, []);
  useEffect(() => { load(); }, [load]);


  async function add() {
    setErr("");
    setBusy(true);
    const r = await fetch("/api/auto-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, keywords: keywords.split(",").map((s) => s.trim()).filter(Boolean) }),
    });
    setBusy(false);
    if (r.ok) { setTag(""); setKeywords(""); load(); }
    else setErr((await r.json()).error ?? "Gagal simpan");
  }
  async function del(id: string) {
    await fetch(`/api/auto-tags/${id}`, { method: "DELETE" });
    load();
  }

  const field = "mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4">
        <div className="mb-1 text-sm font-semibold">Aturan tag otomatis</div>
        <p className="mb-3 text-xs text-muted-foreground">Kalau pesan masuk mengandung salah satu kata kunci, pelanggan otomatis diberi tag ini.</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Nama tag</label>
              <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="mis. KOMPLAIN" className={field} />
            </div>
            <div>
              <label className="text-xs font-medium">Kata kunci (pisah koma)</label>
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="komplain, kecewa, refund" className={field} />
            </div>
          </div>
          {err && <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
          <button onClick={add} disabled={busy || !tag.trim()} className="inline-flex h-10 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
            <Plus className="h-4 w-4" /> Simpan
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {items.length === 0 && <div className="rounded-lg border border-dashed border-border bg-white p-6 text-center text-sm text-muted-foreground">Belum ada tag otomatis.</div>}
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-dark">{it.tag}</span>
              <span className="text-xs text-muted-foreground">←</span>
              {it.keywords.map((k) => <span key={k} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{k}</span>)}
            </div>
            <button onClick={() => del(it.id)} className="rounded p-1 text-muted-foreground hover:bg-danger/10 hover:text-danger">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickRepliesTab() {
  const [items, setItems]       = useState<QuickReply[]>([]);
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing]   = useState<QuickReply | null>(null);
  const [showAdd, setShowAdd]   = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/quick-replies");
    if (r.ok) setItems((await r.json()).items);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function del(id: string) {
    await fetch(`/api/quick-replies/${id}`, { method: "DELETE" });
    if (expanded === id) setExpanded(null);
    load();
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? items.filter(it =>
        it.shortcut.toLowerCase().includes(q) ||
        it.title?.toLowerCase().includes(q) ||
        it.text?.toLowerCase().includes(q) ||
        it.category?.toLowerCase().includes(q),
      )
    : items;

  const grouped = filtered.reduce<Record<string, QuickReply[]>>((acc, it) => {
    const k = it.category || "Tanpa Kategori";
    (acc[k] ??= []).push(it);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl">
      {/* toolbar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari shortcut, judul, atau isi..."
            className="w-full rounded-[var(--radius-md)] border border-border bg-white py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button onClick={() => setShowAdd(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark">
          <Plus className="h-4 w-4" /> Tambah
        </button>
      </div>

      {/* hint */}
      <p className="mb-4 text-xs text-muted-foreground">
        Pintasan pesan (bisa teks + gambar + file). Ketik shortcut-nya di kotak chat untuk menyisipkan.
        {filtered.length > 0 && <span className="ml-2 font-medium text-foreground">{filtered.length} shortcut</span>}
      </p>

      {items.length === 0 && (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-white p-8 text-center text-sm text-muted-foreground">
          Belum ada balasan cepat. Klik &quot;Tambah&quot; untuk membuat baru.
        </div>
      )}

      {items.length > 0 && filtered.length === 0 && (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-white p-8 text-center text-sm text-muted-foreground">
          Tidak ada shortcut yang cocok dengan &quot;{search}&quot;.
        </div>
      )}

      {Object.entries(grouped).map(([cat, list]) => (
        <div key={cat} className="mb-4">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{list.length}</span>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white">
            {list.map((it, idx) => {
              const isOpen = expanded === it.id;
              const hasAttach = (it.attachments?.length ?? 0) > 0;
              const preview = it.text
                ? (it.text.length > 80 ? it.text.slice(0, 80) + "…" : it.text).replace(/\n/g, " ")
                : hasAttach ? `📎 ${it.attachments!.length} lampiran` : "–";

              return (
                <div key={it.id} className={idx > 0 ? "border-t border-border" : ""}>
                  {/* baris kompak */}
                  <div
                    className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : it.id)}
                  >
                    <span className="shrink-0 rounded bg-primary-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-primary-dark">
                      {it.shortcut}
                    </span>
                    {it.title && (
                      <span className="shrink-0 text-sm font-medium">{it.title}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{preview}</span>
                    {hasAttach && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">📎{it.attachments!.length}</span>
                    )}
                    {/* aksi */}
                    <div className="flex shrink-0 items-center gap-0.5" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setEditing(it)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-primary-soft hover:text-primary-dark">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => del(it.id)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* chevron */}
                    <svg className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </div>

                  {/* expanded: konten penuh */}
                  {isOpen && (
                    <div className="border-t border-border bg-muted/20 px-4 py-3">
                      {it.text && (
                        <p className="whitespace-pre-wrap text-sm text-foreground/80">{it.text}</p>
                      )}
                      {hasAttach && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {it.attachments!.map((a, i) =>
                            a.type === "image" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={a.url} alt={a.name}
                                className="h-20 w-20 rounded-md border border-border object-cover" />
                            ) : (
                              <a key={i} href={a.url} target="_blank"
                                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1 text-xs">
                                <FileText className="h-3.5 w-3.5" /> {a.name}
                              </a>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {showAdd && (
        <AddQuickReply onClose={() => setShowAdd(false)} onDone={async () => { setShowAdd(false); await load(); }} />
      )}
      {editing && (
        <EditQuickReply item={editing} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); await load(); }} />
      )}
    </div>
  );
}

function AddQuickReply({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [shortcut, setShortcut] = useState("/");
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Media[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const r = await fetch("/api/media", { method: "POST", body: fd });
    setUploading(false);
    if (r.ok) {
      const d = await r.json();
      setAttachments((a) => [...a, ...d.media]);
    } else {
      setErr((await r.json()).error ?? "Gagal upload");
    }
    e.target.value = "";
  }

  async function submit() {
    setErr("");
    setBusy(true);
    const r = await fetch("/api/quick-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcut, category, title, text, attachments }),
    });
    setBusy(false);
    if (r.ok) onDone();
    else setErr((await r.json()).error ?? "Gagal simpan");
  }

  const field = "mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--radius-lg)] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Tambah Balasan Cepat</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Shortcut</label>
              <input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="/closing" className={field} />
            </div>
            <div>
              <label className="text-xs font-medium">Kategori</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="mis. Sales" className={field} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Judul (opsional)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
          </div>
          <div>
            <label className="text-xs font-medium">Teks</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder="Isi pesan..." className="mt-1 w-full resize-y rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary" />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Variabel:</span>
              {(["{{nama}}", "{{nama_agent}}", "{{hari_ini}}", "{{tanggal_fu}}"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setText((t) => t + v)}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-primary-dark hover:bg-primary-soft"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Lampiran (gambar/file)</label>
            <label className="mt-1 flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground hover:border-primary">
              <Paperclip className="h-4 w-4" />
              {uploading ? "Mengunggah..." : "Pilih gambar atau file"}
              <input type="file" multiple onChange={onFiles} className="hidden" />
            </label>
            {attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <div key={i} className="relative">
                    {a.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.name} className="h-14 w-14 rounded-md border border-border object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 flex-col items-center justify-center rounded-md border border-border p-1 text-center">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="mt-0.5 line-clamp-1 text-[9px]">{a.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-white"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {err && <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
          <button
            onClick={submit}
            disabled={busy || uploading}
            className="h-10 w-full rounded-md bg-primary font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────
// Rule Engine Tab — CAPI automation rules
// ─────────────────────────────────────────────
type Condition = { type: string; operator?: string; value: string };
type Action    = { type: string; eventName?: string; extractValue?: boolean; oneTime?: boolean; status?: string };
type CrmRule   = {
  id: string; name: string; isActive: boolean;
  conditions: Condition[]; actions: Action[];
  runCount: number; lastRunAt?: string | null;
};

const COND_TYPES = [
  { value: "keyword",             label: "Pesan mengandung kata" },
  { value: "purchase_regex",      label: "Pesan mengandung nominal Rp" },
  { value: "label",               label: "Pelanggan punya label" },
  { value: "status",              label: "Status percakapan" },
  { value: "on_page_view",        label: "Saat halaman LP dibuka" },
  { value: "on_link_click",       label: "Saat tombol WA diklik" },
  { value: "ctwa_first_message",  label: "Pesan pertama dari iklan CTWA" },
];
const ACTION_TYPES = [
  { value: "send_capi_event", label: "Kirim CAPI Event ke Meta" },
  { value: "set_meta_status", label: "Set Meta Event Status pelanggan" },
];
const CAPI_EVENTS: { value: string; label: string }[] = [
  // Core conversion events
  { value: "Lead",                  label: "Lead — prospek baru masuk" },
  { value: "CompleteRegistration",  label: "CompleteRegistration — selesai daftar" },
  { value: "SubmitApplication",     label: "SubmitApplication — submit formulir/aplikasi" },
  { value: "Contact",               label: "Contact — menghubungi bisnis" },
  { value: "Schedule",              label: "Schedule — booking/jadwal" },
  // Purchase & payment
  { value: "Purchase",              label: "Purchase — transaksi berhasil" },
  { value: "Subscribe",             label: "Subscribe — berlangganan layanan" },
  { value: "StartTrial",            label: "StartTrial — mulai trial gratis" },
  { value: "Donate",                label: "Donate — donasi" },
  // Checkout funnel
  { value: "InitiateCheckout",      label: "InitiateCheckout — mulai checkout" },
  { value: "AddPaymentInfo",        label: "AddPaymentInfo — isi info pembayaran" },
  { value: "AddToCart",             label: "AddToCart — tambah ke keranjang" },
  { value: "AddToWishlist",         label: "AddToWishlist — tambah ke wishlist" },
  // Engagement
  { value: "ViewContent",           label: "ViewContent — lihat konten/produk" },
  { value: "Search",                label: "Search — melakukan pencarian" },
  { value: "CustomizeProduct",      label: "CustomizeProduct — kustomisasi produk" },
  { value: "FindLocation",          label: "FindLocation — cari lokasi toko" },
];
const STATUSES    = ["OPEN","PENDING","CLOSED"];

const EMPTY_RULE = { name: "", conditions: [] as Condition[], actions: [] as Action[] };

function RuleEngineTab() {
  const [trackingLinks, setTrackingLinks] = useState<{id:string;name:string;slug:string}[]>([]);
  const [crmLabels, setCrmLabels] = useState<{name:string;color:string}[]>([]);
  const [rules, setRules] = useState<CrmRule[]>([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_RULE);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/crm/rules").then(r => r.json()).then(d => setRules(d.rules ?? []));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/tracking/links").then(r => r.json()).then(d => setTrackingLinks(d.links ?? []));
    fetch("/api/crm/settings").then(r => r.json()).then(d => setCrmLabels(d.settings?.journal_labels ?? []));
  }, []);


  function addCond() {
    setForm(f => ({ ...f, conditions: [...f.conditions, { type: "keyword", value: "" }] }));
  }
  function setCond(i: number, patch: Partial<Condition>) {
    setForm(f => ({ ...f, conditions: f.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c) }));
  }
  function delCond(i: number) {
    setForm(f => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }));
  }
  function addAction() {
    setForm(f => ({ ...f, actions: [...f.actions, { type: "send_capi_event", eventName: "Lead" }] }));
  }
  function setAction(i: number, patch: Partial<Action>) {
    setForm(f => ({ ...f, actions: f.actions.map((a, idx) => idx === i ? { ...a, ...patch } : a) }));
  }
  function delAction(i: number) {
    setForm(f => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }));
  }

  async function save() {
    if (!form.name || !form.conditions.length || !form.actions.length) return;
    setSaving(true);
    await fetch("/api/crm/rules", {
      method: editId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editId ? { ...form, id: editId } : form),
    });
    setSaving(false);
    setModal(false);
    setEditId(null);
    setForm(EMPTY_RULE);
    load();
  }

  async function toggle(r: CrmRule) {
    await fetch("/api/crm/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, isActive: !r.isActive }),
    });
    load();
  }

  async function del(r: CrmRule) {
    if (!confirm(`Hapus rule "${r.name}"?`)) return;
    await fetch("/api/crm/rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id }),
    });
    load();
  }

  const inp = "h-8 rounded border border-input px-2 text-xs outline-none focus:border-primary";
  const sel = inp + " bg-white";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Rule Engine — CAPI Automation</p>
          <p className="text-xs text-muted-foreground">Trigger CAPI event otomatis berdasarkan kondisi pesan masuk</p>
        </div>
        <button onClick={() => setModal(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90">
          <Plus size={13} /> Buat Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Belum ada rule. Buat rule pertama untuk otomatisasi CAPI event.
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(r => (
            <div key={r.id} className="rounded-lg border bg-white p-4 flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${r.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {r.isActive ? "Aktif" : "Nonaktif"}
                  </span>
                  <span className="font-medium text-sm">{r.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Berjalan: {r.runCount}×</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div><span className="text-foreground font-medium">JIKA</span> {r.conditions.map((c, i) => (
                    <span key={i}>{i > 0 && " DAN "}<span className="font-mono bg-muted px-1 rounded">{c.type === "keyword" ? `"${c.value}"` : c.type === "purchase_regex" ? "ada nominal Rp" : c.type === "on_page_view" ? `LP dibuka: ${c.value||"*"}` : c.type === "on_link_click" ? `WA diklik: ${c.value||"*"}` : c.type === "ctwa_first_message" ? "Pesan pertama CTWA" : `${c.type}=${c.value}`}</span></span>
                  ))}</div>
                  <div><span className="text-foreground font-medium">MAKA</span> {r.actions.map((a, i) => (
                    <span key={i}>{i > 0 && ", "}<span className="font-mono bg-blue-50 text-blue-700 px-1 rounded">{a.type === "send_capi_event" ? `Send ${a.eventName}${a.extractValue ? " (ambil nilai Rp)" : ""}` : `Set status=${a.status}`}</span></span>
                  ))}</div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => { setEditId(r.id); setForm({ name: r.name, conditions: r.conditions, actions: r.actions }); setModal(true); }} className="h-7 px-2 rounded text-xs border hover:bg-muted flex items-center gap-1 justify-center">
                  <Pencil size={11} /> Edit
                </button>
                <button onClick={() => toggle(r)} className="h-7 px-2 rounded text-xs border hover:bg-muted">
                  {r.isActive ? "Nonaktifkan" : "Aktifkan"}
                </button>
                <button onClick={() => del(r)} className="h-7 px-2 rounded text-xs text-red-500 hover:bg-red-50 border border-red-100">
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Panduan snippet */}
      <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-xs space-y-2">
        <p className="font-semibold text-blue-800">Cara pakai kondisi LP / Tombol WA</p>
        <p className="text-blue-700">Pasang 1 baris ini di <code className="bg-white px-1 rounded">&lt;head&gt;</code> semua landing page — berlaku untuk semua link sekaligus:</p>
        <code className="block bg-white border border-blue-200 rounded p-2 text-[11px] text-gray-700 select-all break-all">
          {`<script src="https://crm.klinikaqma.com/api/tracking/snippet" async></script>`}
        </code>
        <p className="text-blue-700">Rule <strong>Saat tombol WA diklik</strong> aktif otomatis tanpa script — terpicu saat lead klik tracking link.</p>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{editId ? "Edit Rule" : "Buat Rule Baru"}</p>
              <button onClick={() => { setModal(false); setEditId(null); setForm(EMPTY_RULE); }} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Nama Rule</label>
              <input className={inp + " w-full mt-1"} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Contoh: Purchase dari FB Ads" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">KONDISI (semua harus terpenuhi)</label>
                <button onClick={addCond} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus size={11} /> Tambah</button>
              </div>
              {form.conditions.map((c, i) => (
                <div key={i} className="flex gap-1.5 items-start">
                  <select className={sel} value={c.type} onChange={e => setCond(i, { type: e.target.value, value: "" })}>
                    {COND_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                  </select>
                  {c.type === "status" ? (
                    <select className={sel} value={c.value} onChange={e => setCond(i, { value: e.target.value })}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : c.type === "purchase_regex" ? (
                    <span className="text-xs text-muted-foreground self-center px-2">auto-detect Rp</span>
                  ) : c.type === "ctwa_first_message" ? (
                    <span className="text-xs text-muted-foreground self-center px-2">auto-detect dari iklan CTWA</span>
                  ) : (c.type === "on_page_view" || c.type === "on_link_click") ? (
                    <select className={sel + " flex-1"} value={c.value} onChange={e => setCond(i, { value: e.target.value })}>
                      <option value="*">Semua tracking link</option>
                      {trackingLinks.map(l => <option key={l.slug} value={l.slug}>{l.name} ({l.slug})</option>)}
                    </select>
                  ) : c.type === "label" ? (
                    <select className={sel + " flex-1"} value={c.value} onChange={e => setCond(i, { value: e.target.value })}>
                      <option value="">-- pilih label --</option>
                      {crmLabels.map(l => (
                        <option key={l.name} value={l.name}>{l.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input className={inp + " flex-1"} value={c.value} onChange={e => setCond(i, { value: e.target.value })} placeholder="kata kunci..." />
                  )}
                  <button onClick={() => delCond(i)} className="text-muted-foreground hover:text-red-500 mt-1"><X size={13} /></button>
                </div>
              ))}
              {form.conditions.length === 0 && <p className="text-xs text-muted-foreground italic">Tambah minimal 1 kondisi</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">AKSI</label>
                <button onClick={addAction} className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus size={11} /> Tambah</button>
              </div>
              {form.actions.map((a, i) => (
                <div key={i} className="border rounded-md p-2.5 space-y-1.5">
                  <div className="flex gap-1.5">
                    <select className={sel + " flex-1"} value={a.type} onChange={e => setAction(i, { type: e.target.value })}>
                      {ACTION_TYPES.map(at => <option key={at.value} value={at.value}>{at.label}</option>)}
                    </select>
                    <button onClick={() => delAction(i)} className="text-muted-foreground hover:text-red-500"><X size={13} /></button>
                  </div>
                  {a.type === "send_capi_event" && (
                    <div className="space-y-1">
                      <select className={sel + " w-full"} value={a.eventName ?? "Lead"} onChange={e => setAction(i, { eventName: e.target.value })}>
                        {CAPI_EVENTS.map(ev => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
                      </select>
                      {(a.eventName ?? "Lead") === "Purchase" && (
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={a.extractValue ?? false} onChange={e => setAction(i, { extractValue: e.target.checked })} />
                        Otomatis ambil nilai nominal Rp dari pesan
                      </label>
                      )}
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer text-muted-foreground">
                        <input type="checkbox" checked={a.oneTime ?? false} onChange={e => setAction(i, { oneTime: e.target.checked })} />
                        Kirim sekali per customer (tidak berulang)
                      </label>
                    </div>
                  )}
                  {a.type === "set_meta_status" && (
                    <input className={inp + " w-full"} value={a.status ?? ""} onChange={e => setAction(i, { status: e.target.value })} placeholder="Nilai status, misal: contacted" />
                  )}
                </div>
              ))}
              {form.actions.length === 0 && <p className="text-xs text-muted-foreground italic">Tambah minimal 1 aksi</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={save} disabled={saving || !form.name || !form.conditions.length || !form.actions.length} className="flex-1 h-9 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Menyimpan..." : "Simpan Rule"}
              </button>
              <button onClick={() => { setModal(false); setEditId(null); setForm(EMPTY_RULE); }} className="h-9 px-4 rounded-md border text-sm">Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function EditQuickReply({ item, onClose, onDone }: { item: QuickReply; onClose: () => void; onDone: () => void }) {
  const [shortcut, setShortcut] = useState(item.shortcut);
  const [category, setCategory] = useState(item.category || "");
  const [title, setTitle] = useState(item.title || "");
  const [text, setText] = useState(item.text || "");
  const [attachments, setAttachments] = useState<Media[]>((item.attachments as Media[]) || []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const r = await fetch("/api/media", { method: "POST", body: fd });
    setUploading(false);
    if (r.ok) {
      const d = await r.json();
      setAttachments((a) => [...a, ...d.media]);
    } else {
      setErr((await r.json()).error ?? "Gagal upload");
    }
    e.target.value = "";
  }

  async function submit() {
    setErr("");
    setBusy(true);
    const r = await fetch(`/api/quick-replies/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortcut, category, title, text, attachments }),
    });
    setBusy(false);
    if (r.ok) onDone();
    else setErr((await r.json()).error ?? "Gagal simpan");
  }

  const field = "mt-1 h-10 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--radius-lg)] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Edit Balasan Cepat</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Shortcut</label>
              <input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="/closing" className={field} />
            </div>
            <div>
              <label className="text-xs font-medium">Kategori</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="mis. Sales" className={field} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Judul (opsional)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
          </div>
          <div>
            <label className="text-xs font-medium">Teks</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder="Isi pesan..." className="mt-1 w-full resize-y rounded-md border border-input px-3 py-2 text-sm outline-none focus:border-primary" />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Variabel:</span>
              {(["{{nama}}", "{{nama_agent}}", "{{hari_ini}}", "{{tanggal_fu}}"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setText((t) => t + v)}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-primary-dark hover:bg-primary-soft"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Lampiran (gambar/file)</label>
            <label className="mt-1 flex h-10 cursor-pointer items-center gap-2 rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground hover:border-primary">
              <Paperclip className="h-4 w-4" />
              {uploading ? "Mengunggah..." : "Pilih gambar atau file"}
              <input type="file" multiple onChange={onFiles} className="hidden" />
            </label>
            {attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <div key={i} className="relative">
                    {a.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.name} className="h-14 w-14 rounded-md border border-border object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 flex-col items-center justify-center rounded-md border border-border p-1 text-center">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="mt-0.5 line-clamp-1 text-[9px]">{a.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-white"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {err && <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
          <button
            onClick={submit}
            disabled={busy || uploading}
            className="h-10 w-full rounded-md bg-primary font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </div>
      </div>
    </div>
  );
}
