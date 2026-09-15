"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, X, Eye, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type Template = {
  id: string; wabaId: string; name: string; language: string; metaId: string | null;
  category: string | null; status: string | null; bodyText: string | null;
  components: unknown;
};
type Channel = { wabaId: string; label: string };
type BtnItem =
  | { kind: "QUICK_REPLY"; text: string }
  | { kind: "URL"; text: string; url: string }
  | { kind: "PHONE_NUMBER"; text: string; phone: string };

type MetaComp =
  | { type: "HEADER"; format?: string; text?: string }
  | { type: "BODY"; text?: string }
  | { type: "FOOTER"; text?: string }
  | { type: "BUTTONS"; buttons?: MetaBtn[] };
type MetaBtn =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url?: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number?: string };

function statusClass(s: string | null) {
  if (s === "APPROVED") return "bg-success/10 text-success";
  if (s === "REJECTED") return "bg-danger/10 text-danger";
  return "bg-warning/10 text-warning";
}

function parseComponents(components: unknown) {
  const comps = Array.isArray(components) ? (components as MetaComp[]) : [];
  const header = comps.find((c) => c.type === "HEADER") as Extract<MetaComp, { type: "HEADER" }> | undefined;
  const body   = comps.find((c) => c.type === "BODY")   as Extract<MetaComp, { type: "BODY" }>   | undefined;
  const footer = comps.find((c) => c.type === "FOOTER") as Extract<MetaComp, { type: "FOOTER" }> | undefined;
  const btns   = comps.find((c) => c.type === "BUTTONS") as Extract<MetaComp, { type: "BUTTONS" }> | undefined;

  const buttons: BtnItem[] = (btns?.buttons ?? []).map((b): BtnItem | null => {
    if (b.type === "QUICK_REPLY")  return { kind: "QUICK_REPLY", text: b.text };
    if (b.type === "URL")          return { kind: "URL", text: b.text, url: (b as { type: "URL"; text: string; url?: string }).url ?? "" };
    if (b.type === "PHONE_NUMBER") return { kind: "PHONE_NUMBER", text: b.text, phone: (b as { type: "PHONE_NUMBER"; text: string; phone_number?: string }).phone_number ?? "" };
    return null;
  }).filter((b): b is BtnItem => b !== null);

  return {
    headerText: header?.text ?? "",
    bodyText:   body?.text ?? "",
    footerText: footer?.text ?? "",
    buttons,
  };
}

// ─── View Panel ───────────────────────────────────────────────────────────────

function ViewPanel({ template, channels, onClose, onEdit }: {
  template: Template; channels: Channel[]; onClose: () => void; onEdit: () => void;
}) {
  const { headerText, bodyText, footerText, buttons } = parseComponents(template.components);
  const channelLabel = channels.find((c) => c.wabaId === template.wabaId)?.label ?? template.wabaId;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-sm flex-col overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold text-sm">Detail Template</h2>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{template.name}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Meta */}
          <div className="flex flex-wrap gap-2">
            <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + statusClass(template.status)}>
              {template.status ?? "-"}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{template.category ?? "-"}</span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{template.language}</span>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{channelLabel}</span>
          </div>

          {/* WhatsApp preview */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview Pesan</p>
            <div className="rounded-xl bg-[#e5ddd5] p-3">
              <div className="max-w-[240px] rounded-xl rounded-tl-sm bg-white shadow-sm overflow-hidden">
                {headerText && (
                  <div className="px-3 pt-3 pb-1 font-semibold text-sm text-foreground leading-snug">
                    {headerText}
                  </div>
                )}
                <div className="px-3 py-2 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {bodyText || template.bodyText || "(tidak ada body)"}
                </div>
                {footerText && (
                  <div className="px-3 pb-2 text-xs text-muted-foreground">{footerText}</div>
                )}
                <div className="px-2 pb-1 text-right">
                  <span className="text-[10px] text-muted-foreground">10:30 ✓✓</span>
                </div>
                {buttons.length > 0 && (
                  <div className="border-t border-border">
                    {buttons.map((btn, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-center gap-1.5 border-b border-border py-2 text-xs font-medium text-primary last:border-0 ${
                          btn.kind === "QUICK_REPLY" ? "text-primary" :
                          btn.kind === "URL" ? "text-blue-600" : "text-green-600"
                        }`}
                      >
                        {btn.kind === "URL" && <span>🔗</span>}
                        {btn.kind === "PHONE_NUMBER" && <span>📞</span>}
                        {btn.text}
                        {btn.kind === "URL" && (
                          <span className="ml-1 truncate max-w-[100px] text-[10px] opacity-60">{btn.url}</span>
                        )}
                        {btn.kind === "PHONE_NUMBER" && (
                          <span className="ml-1 text-[10px] opacity-60">{btn.phone}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Raw components */}
          {template.components && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Komponen</p>
              <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs text-foreground whitespace-pre-wrap">
                {JSON.stringify(template.components, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-5 py-4">
          <button
            onClick={onEdit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            <Pencil className="h-4 w-4" /> Edit Template
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

function TemplateModal({ channels, onClose, onDone, editTemplate }: {
  channels: Channel[];
  onClose: () => void;
  onDone: () => void;
  editTemplate?: Template;
}) {
  const isEdit = !!editTemplate;
  const parsed = editTemplate ? parseComponents(editTemplate.components) : null;

  const [wabaId, setWabaId]     = useState(editTemplate?.wabaId ?? channels[0]?.wabaId ?? "");
  const [name, setName]         = useState(editTemplate?.name ?? "");
  const [category, setCategory] = useState(editTemplate?.category ?? "MARKETING");
  const [language, setLanguage] = useState(editTemplate?.language ?? "id");
  const [header, setHeader]     = useState(parsed?.headerText ?? "");
  const [body, setBody]         = useState(parsed?.bodyText ?? editTemplate?.bodyText ?? "");
  const [footer, setFooter]     = useState(parsed?.footerText ?? "");
  const [buttons, setButtons]   = useState<BtnItem[]>(parsed?.buttons ?? []);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState("");

  const normName = name.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/__+/g, "_").replace(/^_|_$/g, "");

  const qrCount  = buttons.filter((b) => b.kind === "QUICK_REPLY").length;
  const hasUrl   = buttons.some((b) => b.kind === "URL");
  const hasPhone = buttons.some((b) => b.kind === "PHONE_NUMBER");

  function addBtn(kind: BtnItem["kind"]) {
    if (kind === "QUICK_REPLY")  setButtons((p) => [...p, { kind, text: "" }]);
    if (kind === "URL")          setButtons((p) => [...p, { kind, text: "", url: "" }]);
    if (kind === "PHONE_NUMBER") setButtons((p) => [...p, { kind, text: "", phone: "" }]);
  }
  function removeBtn(i: number) { setButtons((p) => p.filter((_, idx) => idx !== i)); }
  function updateBtn(i: number, patch: Partial<BtnItem>) {
    setButtons((p) => p.map((b, idx) => idx === i ? { ...b, ...patch } as BtnItem : b));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) { setErr("Body wajib diisi"); return; }
    if (!isEdit && !normName) { setErr("Nama template wajib diisi"); return; }
    for (const b of buttons) {
      if (!b.text.trim()) { setErr("Teks semua tombol wajib diisi"); return; }
      if (b.kind === "URL" && !b.url.trim()) { setErr("URL tombol wajib diisi"); return; }
      if (b.kind === "PHONE_NUMBER" && !b.phone.trim()) { setErr("Nomor telepon tombol wajib diisi"); return; }
    }
    setBusy(true); setErr("");

    const payload = {
      wabaId, name: normName, language, category,
      header: header.trim() || null,
      bodyText: body.trim(),
      footer: footer.trim() || null,
      buttons: buttons.length ? buttons : undefined,
    };

    const url    = isEdit ? `/api/templates/${editTemplate!.id}` : "/api/templates";
    const method = isEdit ? "PATCH" : "POST";

    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(d.error ?? "Gagal simpan template"); return; }
    onDone();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
      <div className="w-full max-w-lg rounded-[var(--radius-xl)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{isEdit ? "Edit Template" : "Buat Template Baru"}</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          {channels.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium">Channel WABA</label>
              <select value={wabaId} onChange={(e) => setWabaId(e.target.value)} disabled={isEdit}
                className="w-full rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted/50">
                {channels.map((c) => <option key={c.wabaId} value={c.wabaId}>{c.label}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Kategori</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="MARKETING">MARKETING</option>
                <option value="UTILITY">UTILITY</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Bahasa</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={isEdit}
                className="w-full rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted/50">
                <option value="id">🇮🇩 Bahasa Indonesia</option>
                <option value="en_US">🇺🇸 English (US)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Nama Template</label>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={isEdit}
              placeholder="promo_facial_glow"
              className="w-full rounded-[var(--radius-md)] border border-border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted/50"
              required />
            {!isEdit && name && normName !== name && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Akan dikirim sebagai: <span className="font-mono font-medium">{normName}</span>
              </p>
            )}
            {isEdit && (
              <p className="mt-0.5 text-xs text-muted-foreground">Nama tidak dapat diubah setelah template dibuat.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Header <span className="font-normal text-muted-foreground">(opsional, maks 60 karakter)</span>
            </label>
            <input value={header} onChange={(e) => setHeader(e.target.value)} maxLength={60}
              placeholder="Promo Spesial Treatment"
              className="w-full rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Body <span className="text-danger">*</span>
            </label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
              placeholder={"Assalamualaikum {{1}},\n\nKami dari Aqma Aesthetic Clinic ingin menginformasikan..."}
              className="w-full resize-y rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              required />
            <p className="mt-0.5 text-xs text-muted-foreground">
              Gunakan{" "}
              <code className="rounded bg-muted px-1">{"{{1}}"}</code>,{" "}
              <code className="rounded bg-muted px-1">{"{{2}}"}</code>{" "}
              untuk variabel yang diisi saat broadcast.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Footer <span className="font-normal text-muted-foreground">(opsional, maks 60 karakter)</span>
            </label>
            <input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={60}
              placeholder="Aqma Aesthetic Clinic"
              className="w-full rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          {/* Tombol */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              Tombol <span className="font-normal text-muted-foreground">(opsional — maks 3 Quick Reply + 1 URL + 1 Telepon)</span>
            </label>
            {buttons.length > 0 && (
              <div className="mb-2 space-y-2">
                {buttons.map((btn, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-muted/30 px-3 py-2">
                    {btn.kind === "QUICK_REPLY"  && <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">QR</span>}
                    {btn.kind === "URL"           && <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">URL</span>}
                    {btn.kind === "PHONE_NUMBER"  && <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">Tel</span>}
                    <input
                      value={btn.text}
                      onChange={(e) => updateBtn(i, { text: e.target.value } as Partial<BtnItem>)}
                      placeholder="Teks tombol" maxLength={25}
                      className="min-w-0 flex-1 rounded border border-border bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
                    {btn.kind === "URL" && (
                      <input value={btn.url}
                        onChange={(e) => updateBtn(i, { url: e.target.value } as Partial<BtnItem>)}
                        placeholder="https://contoh.com/{{1}}"
                        className="min-w-0 flex-[2] rounded border border-border bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
                    )}
                    {btn.kind === "PHONE_NUMBER" && (
                      <input value={btn.phone}
                        onChange={(e) => updateBtn(i, { phone: e.target.value } as Partial<BtnItem>)}
                        placeholder="+628xxxxxxxxxx"
                        className="min-w-0 flex-[1.5] rounded border border-border bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
                    )}
                    <button type="button" onClick={() => removeBtn(i)}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {qrCount < 3 && (
                <button type="button" onClick={() => addBtn("QUICK_REPLY")}
                  className="rounded-[var(--radius-md)] border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                  + Quick Reply
                </button>
              )}
              {!hasUrl && (
                <button type="button" onClick={() => addBtn("URL")}
                  className="rounded-[var(--radius-md)] border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100">
                  + Buka URL
                </button>
              )}
              {!hasPhone && (
                <button type="button" onClick={() => addBtn("PHONE_NUMBER")}
                  className="rounded-[var(--radius-md)] border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100">
                  + Telepon
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              URL bisa pakai variabel dinamis: <code className="rounded bg-muted px-1">{"{{1}}"}</code>
            </p>
          </div>

          {err && (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={onClose}
              className="rounded-[var(--radius-md)] border border-border px-4 py-2 text-sm hover:bg-muted">
              Batal
            </button>
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
              {busy
                ? (isEdit ? "Menyimpan..." : "Mengirim ke Meta...")
                : (isEdit ? "Simpan Perubahan" : "Submit ke Meta")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirm({ template, onClose, onDeleted }: {
  template: Template; onClose: () => void; onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");

  async function confirm() {
    setBusy(true); setErr("");
    const r = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(d.error ?? "Gagal hapus"); return; }
    onDeleted();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-xl)] bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold text-danger">Hapus Template?</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Tindakan ini tidak dapat dibatalkan.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-foreground">
            Template <span className="font-mono font-medium">{template.name}</span> akan dihapus dari Meta dan database. Semua bahasa ({template.language}) dengan nama ini akan ikut terhapus.
          </p>
          {err && <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{err}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose}
              className="rounded-[var(--radius-md)] border border-border px-4 py-2 text-sm hover:bg-muted">
              Batal
            </button>
            <button onClick={confirm} disabled={busy}
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50">
              {busy ? "Menghapus..." : <><Trash2 className="h-4 w-4" /> Hapus</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TemplatesClient() {
  const [templates, setTemplates]   = useState<Template[]>([]);
  const [channels, setChannels]     = useState<Channel[]>([]);
  const [wabaFilter, setWabaFilter] = useState("all");
  const [busy, setBusy]             = useState(false);
  const [msg, setMsg]               = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [viewTarget, setViewTarget] = useState<Template | null>(null);
  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/templates");
    if (r.ok) {
      const d = await r.json();
      setTemplates(d.templates);
      const chs: Channel[] = Object.entries(d.wabaLabel as Record<string, string>)
        .map(([wabaId, label]) => ({ wabaId, label }));
      setChannels(chs);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function sync() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/templates/sync", { method: "POST" });
    const d = await r.json();
    setBusy(false);
    if (r.ok) { setMsg(`Tersinkron ${d.count} template.`); load(); }
    else setMsg(d.error ?? "Gagal sinkron");
    setTimeout(() => setMsg(""), 5000);
  }

  function showSuccess(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(""), 8000);
  }

  const filtered  = wabaFilter === "all" ? templates : templates.filter((t) => t.wabaId === wabaFilter);
  const multiWaba = channels.length > 1;

  return (
    <>
      {/* Modals */}
      {showCreate && (
        <TemplateModal
          channels={channels}
          onClose={() => setShowCreate(false)}
          onDone={() => { load(); showSuccess("Template berhasil disubmit ke Meta. Klik Sinkron setelah beberapa menit untuk refresh status."); }}
        />
      )}
      {editTarget && (
        <TemplateModal
          channels={channels}
          editTemplate={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => { load(); showSuccess("Template berhasil diperbarui. Status kembali ke PENDING selama Meta mereview ulang."); }}
        />
      )}
      {viewTarget && (
        <ViewPanel
          template={viewTarget}
          channels={channels}
          onClose={() => setViewTarget(null)}
          onEdit={() => { setEditTarget(viewTarget); setViewTarget(null); }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          template={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { load(); showSuccess("Template berhasil dihapus."); }}
        />
      )}

      <PageHeader
        title="Template"
        description="Template pesan WhatsApp resmi (buat broadcast / di luar window 24 jam)"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-muted">
              <Plus className="h-4 w-4" /> Buat Template
            </button>
            <button onClick={sync} disabled={busy}
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
              <RefreshCw className={"h-4 w-4 " + (busy ? "animate-spin" : "")} /> Sinkron dari Meta
            </button>
          </div>
        }
      />

      <div className="p-6">
        {msg && (
          <div className="mb-4 rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-dark">{msg}</div>
        )}

        {multiWaba && (
          <div className="mb-4 flex border-b border-border">
            {[{ wabaId: "all", label: "Semua" }, ...channels].map((c) => (
              <button key={c.wabaId} onClick={() => setWabaFilter(c.wabaId)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  wabaFilter === c.wabaId
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Nama</th>
                  <th className="px-4 py-3 font-medium">Kategori</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Bahasa</th>
                  {multiWaba && <th className="px-4 py-3 font-medium">Nomor</th>}
                  <th className="px-4 py-3 font-medium">Isi Body</th>
                  <th className="px-4 py-3 font-medium text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={multiWaba ? 7 : 6}
                      className="px-4 py-12 text-center text-muted-foreground">
                      Belum ada template. Klik &quot;Buat Template&quot; untuk membuat baru, atau &quot;Sinkron dari Meta&quot; untuk menarik yang sudah ada.
                    </td>
                  </tr>
                )}
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{t.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t.category ?? "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + statusClass(t.status)}>
                        {t.status ?? "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.language}</td>
                    {multiWaba && (
                      <td className="px-4 py-3 text-muted-foreground">
                        {channels.find((c) => c.wabaId === t.wabaId)?.label ?? "-"}
                      </td>
                    )}
                    <td className="max-w-xs px-4 py-3">
                      <span className="line-clamp-2 text-muted-foreground">{t.bodyText ?? "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setViewTarget(t)}
                          title="Lihat"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditTarget(t)}
                          title="Edit"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-amber-50 hover:text-amber-600 transition-colors">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(t)}
                          title="Hapus"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
