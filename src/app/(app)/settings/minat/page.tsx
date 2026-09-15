"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Sparkles } from "lucide-react";

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#64748b",
];

type Tag = { id: string; name: string; color: string };

export default function MinatSettingsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await fetch("/api/lead-tags");
    if (r.ok) { const d = await r.json(); setTags(d.tags); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addTag() {
    if (!newName.trim()) return;
    setAdding(true);
    await fetch("/api/lead-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    setNewName("");
    setAdding(false);
    load();
  }

  async function deleteTag(id: string) {
    if (!confirm("Hapus jenis minat ini? Data penandaan pada lead tidak akan terhapus.")) return;
    await fetch(`/api/lead-tags/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-5 w-5 text-violet-500" />
        <h1 className="text-xl font-semibold">Tanda Minat Lead</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Kelola kategori minat produk yang bisa ditandai agent saat chat dengan lead. Hasilnya muncul di laporan Analitik.
      </p>

      {/* Form tambah */}
      <div className="rounded-lg border border-border bg-white p-4 mb-6">
        <p className="text-sm font-medium mb-3">Tambah Jenis Minat Baru</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Nama</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              placeholder="misal: Anti-aging, Acne, Whitening, Slimming..."
              className="mt-1 h-9 w-full rounded-md border border-input px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Warna</label>
            <div className="mt-1 flex gap-1">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: c, borderColor: newColor === c ? "#1e293b" : "transparent" }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={addTag}
            disabled={adding || !newName.trim()}
            className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
          >
            <Plus className="h-4 w-4" />
            {adding ? "Menyimpan..." : "Tambah"}
          </button>
        </div>
      </div>

      {/* Daftar */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Memuat...</p>
      ) : tags.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Belum ada jenis minat. Tambah di atas untuk mulai.
        </div>
      ) : (
        <div className="space-y-2">
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3">
              <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
              <span className="flex-1 text-sm font-medium">{tag.name}</span>
              <button
                onClick={() => deleteTag(tag.id)}
                className="text-muted-foreground hover:text-danger transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
