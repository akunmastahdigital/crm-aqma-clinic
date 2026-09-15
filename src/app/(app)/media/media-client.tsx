"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Trash2, FileText, FolderPlus, Folder, FolderOpen, ChevronRight, X, MoreVertical, CheckSquare, Square } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type Media = { id: string; url: string; name: string; type: string; size: number; createdAt: string; folderId?: string | null };
type MediaFolder = { id: string; name: string };

function fmtBytes(n: number) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

export function MediaClient({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<Media[]>([]);
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [used, setUsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = semua, "root" = tanpa folder
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null); // id media yang sedang dipindah
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  // bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const qs = activeFolder ? `?folderId=${activeFolder}` : "";
    const r = await fetch(`/api/media${qs}`);
    if (r.ok) {
      const d = await r.json();
      setItems(d.items);
      setFolders(d.folders ?? []);
      setUsed(d.used);
    }
  }, [activeFolder]);

  useEffect(() => { load(); }, [load]);

  // reset selection when folder changes or select mode off
  useEffect(() => { setSelectedIds(new Set()); }, [activeFolder, selectMode]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const qs = activeFolder && activeFolder !== "root" ? `?folderId=${activeFolder}` : "";
    await fetch(`/api/media${qs}`, { method: "POST", body: fd });
    setUploading(false);
    e.target.value = "";
    load();
  }

  async function del(id: string) {
    if (!confirm("Hapus file ini?")) return;
    await fetch(`/api/media/${id}`, { method: "DELETE" });
    load();
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Hapus ${selectedIds.size} file yang dipilih?`)) return;
    setBulkDeleting(true);
    await fetch("/api/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    setBulkDeleting(false);
    setSelectedIds(new Set());
    setSelectMode(false);
    load();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((m) => m.id)));
    }
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    await fetch("/api/media/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName.trim() }),
    });
    setNewFolderName("");
    setShowNewFolder(false);
    load();
  }

  async function deleteFolder(id: string) {
    if (!confirm("Hapus folder? Semua file akan dipindah ke root.")) return;
    await fetch(`/api/media/folders/${id}`, { method: "DELETE" });
    if (activeFolder === id) setActiveFolder(null);
    setFolderMenuId(null);
    load();
  }

  async function moveMedia(mediaId: string, folderId: string | null) {
    await fetch(`/api/media/${mediaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
    setMovingId(null);
    load();
  }

  const CAP = 500 * 1024 * 1024;
  const pct = Math.min(100, Math.round((used / CAP) * 100));

  const folderLabel = activeFolder === "root"
    ? "Tanpa Folder"
    : activeFolder
    ? folders.find((f) => f.id === activeFolder)?.name ?? "Folder"
    : "Semua Media";

  const allSelected = items.length > 0 && selectedIds.size === items.length;

  return (
    <>
      <PageHeader
        title="Media Library"
        description="Simpan & kelola gambar/file untuk pesan"
        action={
          <div className="flex items-center gap-2">
            {canManage && items.length > 0 && (
              <button
                onClick={() => setSelectMode((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition-colors ${
                  selectMode
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-white text-foreground hover:bg-muted"
                }`}
              >
                <CheckSquare className="h-4 w-4" />
                {selectMode ? "Batalkan" : "Pilih"}
              </button>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50">
              <Upload className="h-4 w-4" /> {uploading ? "Mengunggah..." : "Upload"}
            </button>
          </div>
        }
      />
      <input ref={fileRef} type="file" multiple onChange={onFiles} className="hidden" />

      <div className="flex h-full">
        {/* Sidebar folder */}
        <aside className="w-52 shrink-0 border-r border-border bg-white flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Penyimpanan</span><span>{fmtBytes(used)} / 500 MB</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {/* Semua */}
            <button onClick={() => setActiveFolder(null)}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-colors ${activeFolder === null ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground/80"}`}>
              <FolderOpen className="h-4 w-4 shrink-0" />
              Semua Media
            </button>
            {/* Tanpa folder */}
            <button onClick={() => setActiveFolder("root")}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-colors ${activeFolder === "root" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground/80"}`}>
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              Tanpa Folder
            </button>

            <div className="my-1 border-t border-border" />

            {/* Buat folder baru */}
            {canManage && (
              showNewFolder ? (
                <div className="flex gap-1 px-1 py-1">
                  <input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createFolder()}
                    placeholder="Nama folder..." className="flex-1 rounded-md border border-border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary min-w-0" />
                  <button onClick={createFolder} className="rounded-md bg-primary px-2 py-1 text-xs text-white hover:bg-primary-dark">OK</button>
                  <button onClick={() => { setShowNewFolder(false); setNewFolderName(""); }} className="rounded-md p-1 hover:bg-muted">
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowNewFolder(true)}
                  className="w-full flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors font-medium border border-dashed border-primary/30">
                  <FolderPlus className="h-3.5 w-3.5" /> + Buat Folder
                </button>
              )
            )}

            {folders.length > 0 && <div className="my-1" />}

            {folders.map((f) => (
              <div key={f.id} className="relative group">
                <button onClick={() => setActiveFolder(f.id)}
                  className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-colors pr-8 ${activeFolder === f.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground/80"}`}>
                  <Folder className="h-4 w-4 shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
                {canManage && (
                  <button onClick={(e) => { e.stopPropagation(); setFolderMenuId(folderMenuId === f.id ? null : f.id); }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-muted transition">
                    <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
                {folderMenuId === f.id && (
                  <div className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-border bg-white shadow-lg py-1">
                    <button onClick={() => deleteFolder(f.id)}
                      className="w-full text-left px-3 py-1.5 text-xs text-danger hover:bg-muted">
                      Hapus Folder
                    </button>
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Konten */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Toolbar bulk select */}
          {selectMode && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
              <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-dark">
                {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {allSelected ? "Batal Semua" : "Pilih Semua"}
              </button>
              <span className="text-sm text-muted-foreground">
                {selectedIds.size > 0 ? `${selectedIds.size} dipilih` : "Belum ada yang dipilih"}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <button
                    onClick={bulkDelete}
                    disabled={bulkDeleting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {bulkDeleting ? (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" className="opacity-25"/><path d="M4 12a8 8 0 018-8" className="opacity-75"/></svg>
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Hapus ({selectedIds.size})
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <ChevronRight className="h-4 w-4" />
            <span className="font-medium text-foreground">{folderLabel}</span>
            <span>({items.length} file)</span>
          </div>

          {items.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-white p-10 text-center text-sm text-muted-foreground">
              Belum ada media di sini. Klik Upload untuk menambah.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {items.map((m) => {
                const isSelected = selectedIds.has(m.id);
                return (
                  <div
                    key={m.id}
                    className={`group relative overflow-hidden rounded-[var(--radius-md)] border bg-white transition-all ${
                      selectMode
                        ? isSelected
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border hover:border-primary/50 cursor-pointer"
                        : "border-border"
                    }`}
                    onClick={selectMode ? () => toggleSelect(m.id) : undefined}
                  >
                    {/* Checkbox overlay saat select mode */}
                    {selectMode && (
                      <div className="absolute left-2 top-2 z-10">
                        <div className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                          isSelected ? "border-primary bg-primary" : "border-white bg-white/80 shadow"
                        }`}>
                          {isSelected && (
                            <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      </div>
                    )}

                    <a
                      href={selectMode ? undefined : m.url}
                      target={selectMode ? undefined : "_blank"}
                      className={`block ${selectMode ? "pointer-events-none" : ""}`}
                      onClick={(e) => selectMode && e.preventDefault()}
                    >
                      {m.type === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt={m.name} className={`aspect-square w-full object-cover transition-opacity ${isSelected ? "opacity-80" : ""}`} />
                      ) : (
                        <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-muted/40 p-2 text-center">
                          <FileText className="h-8 w-8 text-muted-foreground" />
                          <span className="line-clamp-2 text-[11px]">{m.name}</span>
                        </div>
                      )}
                    </a>
                    <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                      <span className="truncate text-[11px] text-muted-foreground">{fmtBytes(m.size)}</span>
                      {!selectMode && (
                        <div className="flex items-center gap-0.5">
                          {/* Pindah folder */}
                          {canManage && (
                            <div className="relative opacity-0 group-hover:opacity-100 transition">
                              <button onClick={() => setMovingId(movingId === m.id ? null : m.id)}
                                title="Pindah folder" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                                <Folder className="h-3.5 w-3.5" />
                              </button>
                              {movingId === m.id && (
                                <div className="absolute bottom-8 right-0 z-20 w-44 rounded-lg border border-border bg-white shadow-lg py-1">
                                  <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase">Pindah ke</div>
                                  <button onClick={() => moveMedia(m.id, null)}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted">Root (tanpa folder)</button>
                                  {folders.map((f) => (
                                    <button key={f.id} onClick={() => moveMedia(m.id, f.id)}
                                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted ${m.folderId === f.id ? "font-semibold text-primary" : ""}`}>
                                      {f.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Hapus */}
                          <button onClick={() => del(m.id)} title="Hapus file" className="rounded p-1 text-muted-foreground/60 hover:bg-danger/10 hover:text-danger transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tutup dropdown saat klik di luar */}
      {(movingId || folderMenuId) && (
        <div className="fixed inset-0 z-10" onClick={() => { setMovingId(null); setFolderMenuId(null); }} />
      )}
    </>
  );
}
