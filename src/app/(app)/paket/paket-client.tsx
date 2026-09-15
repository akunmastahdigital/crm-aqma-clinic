"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, X, Check, ChevronDown, ChevronUp, Users, Banknote, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const SESSION_PACKS = ["1x", "3x", "6x", "12x"] as const;

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear + 1, currentYear + 2];

type PackagePrice = { sessionPack: string; price: number };
type PackageVariant = {
  id: string; name: string; order: number;
  prices: PackagePrice[];
  _count: { customers: number };
};
type PackageType = {
  id: string; name: string; order: number;
  variants: PackageVariant[];
  _count: { customers: number };
};
type LeadRow = {
  id: string; name: string | null; externalId: string; channel: string;
  packageMonth: number | null; packageYear: number | null;
  potentialQty1x: number | null; potentialQty3x: number | null;
  potentialQty6x: number | null; potentialQty12x: number | null; potentialValue: number | null;
  assignedTo: { name: string } | null;
};
type MonthGroup = {
  month: number | null; year: number | null;
  leads: LeadRow[]; totalPaket: number; totalValue: number;
};

function formatRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatRpFull(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export function PaketClient() {
  const [packageTypes, setPackageTypes] = useState<PackageType[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected
  const [selectedPkg, setSelectedPkg] = useState<PackageType | null>(null);
  const [tab, setTab] = useState<"config" | "tabulasi">("config");

  // Add/edit package type form
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editTypeTarget, setEditTypeTarget] = useState<PackageType | null>(null);
  const [typeFormName, setTypeFormName] = useState("");
  const [savingType, setSavingType] = useState(false);

  // Variant management
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [editVariantTarget, setEditVariantTarget] = useState<PackageVariant | null>(null);
  const [variantFormName, setVariantFormName] = useState("");
  const [savingVariant, setSavingVariant] = useState(false);

  // Price editing (per variant)
  const [editingPrices, setEditingPrices] = useState<string | null>(null); // variantId
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);

  // Tabulasi
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [filterMonth, setFilterMonth] = useState("");
  const [filterYear, setFilterYear] = useState("");

  const loadPackageTypes = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/package-types");
    if (r.ok) {
      const d = await r.json();
      setPackageTypes(d.packageTypes ?? []);
      // Refresh selected
      if (selectedPkg) {
        const refreshed = (d.packageTypes ?? []).find((p: PackageType) => p.id === selectedPkg.id);
        if (refreshed) setSelectedPkg(refreshed);
      }
    }
    setLoading(false);
  }, [selectedPkg]);

  useEffect(() => { loadPackageTypes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadLeads(pkg: PackageType) {
    setLeadsLoading(true);
    setLeads([]);
    setExpandedGroups(new Set());
    const sp = new URLSearchParams({ packageTypeId: pkg.id, take: "500" });
    const r = await fetch(`/api/customers?${sp}`);
    if (r.ok) {
      const d = await r.json();
      setLeads(d.customers ?? []);
    }
    setLeadsLoading(false);
  }

  async function selectPkg(pkg: PackageType) {
    setSelectedPkg(pkg);
    setTab("config");
    setEditingPrices(null);
    await loadLeads(pkg);
  }

  // Package type CRUD
  function openAddType() { setEditTypeTarget(null); setTypeFormName(""); setShowTypeForm(true); }
  function openEditType(pkg: PackageType) { setEditTypeTarget(pkg); setTypeFormName(pkg.name); setShowTypeForm(true); }

  async function submitTypeForm() {
    if (!typeFormName.trim()) return;
    setSavingType(true);
    if (editTypeTarget) {
      await fetch(`/api/package-types/${editTypeTarget.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: typeFormName.trim() }),
      });
    } else {
      await fetch("/api/package-types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: typeFormName.trim() }),
      });
    }
    setSavingType(false);
    setShowTypeForm(false);
    await loadPackageTypes();
  }

  async function deleteType(pkg: PackageType) {
    if (!confirm(`Hapus paket "${pkg.name}"? Semua varian dan data lead yang terkait akan direset.`)) return;
    await fetch(`/api/package-types/${pkg.id}`, { method: "DELETE" });
    if (selectedPkg?.id === pkg.id) { setSelectedPkg(null); setLeads([]); }
    await loadPackageTypes();
  }

  // Variant CRUD
  function openAddVariant() { setEditVariantTarget(null); setVariantFormName(""); setShowVariantForm(true); }
  function openEditVariant(v: PackageVariant) { setEditVariantTarget(v); setVariantFormName(v.name); setShowVariantForm(true); }

  async function submitVariantForm() {
    if (!variantFormName.trim() || !selectedPkg) return;
    setSavingVariant(true);
    if (editVariantTarget) {
      await fetch(`/api/package-variants/${editVariantTarget.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: variantFormName.trim() }),
      });
    } else {
      await fetch(`/api/package-types/${selectedPkg.id}/variants`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: variantFormName.trim() }),
      });
    }
    setSavingVariant(false);
    setShowVariantForm(false);
    await loadPackageTypes();
  }

  async function deleteVariant(v: PackageVariant) {
    if (!confirm(`Hapus varian "${v.name}"?`)) return;
    await fetch(`/api/package-variants/${v.id}`, { method: "DELETE" });
    await loadPackageTypes();
  }

  // Price editing
  function startEditPrices(v: PackageVariant) {
    setEditingPrices(v.id);
    const inputs: Record<string, string> = {};
    for (const rt of SESSION_PACKS) {
      const found = v.prices.find((p) => p.sessionPack === rt);
      inputs[rt] = found ? String(found.price) : "";
    }
    setPriceInputs(inputs);
  }

  async function savePrices(variantId: string) {
    setSavingPrices(true);
    const body: Record<string, number> = {};
    for (const rt of SESSION_PACKS) {
      body[rt] = Number(priceInputs[rt]?.replace(/\D/g, "") || "0");
    }
    await fetch(`/api/package-variants/${variantId}/prices`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSavingPrices(false);
    setEditingPrices(null);
    await loadPackageTypes();
  }

  // Tabulasi grouping
  const filteredLeads = leads.filter((l) => {
    if (filterMonth && l.packageMonth !== Number(filterMonth)) return false;
    if (filterYear && l.packageYear !== Number(filterYear)) return false;
    return true;
  });

  const groups: MonthGroup[] = [];
  const groupMap = new Map<string, MonthGroup>();
  for (const l of filteredLeads) {
    const key = `${l.packageYear ?? 0}-${String(l.packageMonth ?? 0).padStart(2, "0")}`;
    if (!groupMap.has(key)) {
      const g: MonthGroup = { month: l.packageMonth, year: l.packageYear, leads: [], totalPaket: 0, totalValue: 0 };
      groupMap.set(key, g);
      groups.push(g);
    }
    const g = groupMap.get(key)!;
    g.leads.push(l);
    g.totalPaket += (l.potentialQty1x ?? 0) + (l.potentialQty3x ?? 0) + (l.potentialQty6x ?? 0) + (l.potentialQty12x ?? 0);
    g.totalValue += l.potentialValue ?? 0;
  }
  groups.sort((a, b) => {
    if (!a.year && !b.year) return 0;
    if (!a.year) return 1; if (!b.year) return -1;
    if (a.year !== b.year) return a.year - b.year;
    return (a.month ?? 0) - (b.month ?? 0);
  });

  const totalPaketAll = filteredLeads.reduce((s, l) => s + (l.potentialQty1x ?? 0) + (l.potentialQty3x ?? 0) + (l.potentialQty6x ?? 0) + (l.potentialQty12x ?? 0), 0);
  const totalValueAll = filteredLeads.reduce((s, l) => s + (l.potentialValue ?? 0), 0);

  return (
    <div className="flex gap-6">
      {/* Left: Daftar jenis paket */}
      <div className="w-64 shrink-0">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-semibold text-sm">Jenis Paket</h2>
            <button onClick={openAddType} className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {showTypeForm && (
            <div className="border-b border-border p-3">
              <input autoFocus value={typeFormName} onChange={(e) => setTypeFormName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitTypeForm(); if (e.key === "Escape") setShowTypeForm(false); }}
                placeholder="Nama jenis paket"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              <div className="mt-2 flex gap-2">
                <button onClick={submitTypeForm} disabled={savingType || !typeFormName.trim()}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">
                  {savingType ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  {editTypeTarget ? "Simpan" : "Tambah"}
                </button>
                <button onClick={() => setShowTypeForm(false)} className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted">Batal</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : packageTypes.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Belum ada jenis paket</p>
          ) : (
            <ul className="divide-y divide-border">
              {packageTypes.map((pkg) => (
                <li key={pkg.id}>
                  <button onClick={() => selectPkg(pkg)}
                    className={cn("flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50", selectedPkg?.id === pkg.id && "bg-primary-soft")}>
                    <div className="flex-1 min-w-0">
                      <p className={cn("truncate text-sm font-medium", selectedPkg?.id === pkg.id && "text-primary")}>{pkg.name}</p>
                      <p className="text-xs text-muted-foreground">{pkg.variants.length} varian · {pkg._count.customers} lead</p>
                    </div>
                    <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground", selectedPkg?.id === pkg.id && "text-primary")} />
                  </button>
                  {selectedPkg?.id === pkg.id && (
                    <div className="flex gap-1 border-t border-border px-4 py-1.5 bg-primary-soft/50">
                      <button onClick={(e) => { e.stopPropagation(); openEditType(pkg); }}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Pencil className="h-3 w-3" /> Edit nama
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteType(pkg); }}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-3 w-3" /> Hapus
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="flex-1 min-w-0">
        {!selectedPkg ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            Pilih jenis paket di sebelah kiri
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">{selectedPkg.name}</h2>
              <div className="flex rounded-lg border border-border bg-muted/30 p-0.5 ml-auto">
                <button onClick={() => setTab("config")}
                  className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", tab === "config" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  Konfigurasi
                </button>
                <button onClick={() => setTab("tabulasi")}
                  className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", tab === "tabulasi" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  Tabulasi ({leads.length})
                </button>
              </div>
            </div>

            {/* TAB: Konfigurasi Varian */}
            {tab === "config" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Varian paket dan harga per ukuran paket</p>
                  <button onClick={openAddVariant}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90">
                    <Plus className="h-3.5 w-3.5" /> Tambah Varian
                  </button>
                </div>

                {showVariantForm && (
                  <div className="rounded-lg border border-primary/30 bg-primary-soft/20 p-3">
                    <p className="mb-2 text-xs font-medium">{editVariantTarget ? "Edit Varian" : "Tambah Varian Baru"}</p>
                    <input autoFocus value={variantFormName} onChange={(e) => setVariantFormName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitVariantForm(); if (e.key === "Escape") setShowVariantForm(false); }}
                      placeholder="Contoh: Bronze, Silver, Gold"
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                    <div className="mt-2 flex gap-2">
                      <button onClick={submitVariantForm} disabled={savingVariant || !variantFormName.trim()}
                        className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">
                        {savingVariant ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Simpan
                      </button>
                      <button onClick={() => setShowVariantForm(false)} className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted">Batal</button>
                    </div>
                  </div>
                )}

                {selectedPkg.variants.length === 0 ? (
                  <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                    Belum ada varian — tambahkan Bronze, Silver, Gold, dll.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedPkg.variants.map((v) => {
                      const isEditing = editingPrices === v.id;
                      return (
                        <div key={v.id} className="overflow-hidden rounded-xl border border-border bg-card">
                          <div className="flex items-center gap-3 px-4 py-3">
                            <span className="font-semibold">{v.name}</span>
                            <span className="text-xs text-muted-foreground">{v._count.customers} lead</span>
                            <div className="ml-auto flex gap-1">
                              {!isEditing && (
                                <button onClick={() => startEditPrices(v)}
                                  className="flex items-center gap-1 rounded-md border border-input px-2.5 py-1 text-xs hover:bg-muted">
                                  <Pencil className="h-3 w-3" /> Set Harga
                                </button>
                              )}
                              <button onClick={() => openEditVariant(v)}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => deleteVariant(v)}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Price rows */}
                          {isEditing ? (
                            <div className="border-t border-border p-4 space-y-2">
                              <p className="text-xs text-muted-foreground mb-3">Harga per orang (Rupiah)</p>
                              <div className="grid grid-cols-2 gap-3">
                                {SESSION_PACKS.map((rt) => (
                                  <div key={rt}>
                                    <label className="mb-0.5 block text-xs font-medium text-muted-foreground">{rt}</label>
                                    <input
                                      type="text" inputMode="numeric"
                                      value={priceInputs[rt] ? Number(priceInputs[rt]).toLocaleString("id-ID") : ""}
                                      onChange={(e) => setPriceInputs((prev) => ({ ...prev, [rt]: e.target.value.replace(/\D/g, "") }))}
                                      placeholder="0"
                                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="flex gap-2 mt-3">
                                <button onClick={() => savePrices(v.id)} disabled={savingPrices}
                                  className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
                                  {savingPrices ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                  Simpan Harga
                                </button>
                                <button onClick={() => setEditingPrices(null)} className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : v.prices.length > 0 ? (
                            <div className="border-t border-border divide-y divide-border">
                              {SESSION_PACKS.map((rt) => {
                                const p = v.prices.find((pr) => pr.sessionPack === rt);
                                return (
                                  <div key={rt} className="flex items-center justify-between px-4 py-2 text-sm">
                                    <span className="text-muted-foreground">{rt}</span>
                                    <span className="font-medium">{p && p.price > 0 ? formatRpFull(p.price) : <span className="text-muted-foreground text-xs">belum diset</span>}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                              Harga belum diset — klik "Set Harga"
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB: Tabulasi */}
            {tab === "tabulasi" && (
              <div className="space-y-4">
                {/* Filter */}
                <div className="flex gap-2 items-center">
                  <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                    <option value="">Semua Bulan</option>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                  <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                    <option value="">Semua Tahun</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  {(filterMonth || filterYear) && (
                    <button onClick={() => { setFilterMonth(""); setFilterYear(""); }}>
                      <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>

                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Total Lead</p>
                    <p className="mt-1 text-2xl font-bold">{filteredLeads.length}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Total Paket</p>
                    <p className="mt-1 text-2xl font-bold">{totalPaketAll}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-xs text-muted-foreground">Potensi Nilai</p>
                    <p className="mt-1 text-xl font-bold">{totalValueAll > 0 ? formatRp(totalValueAll) : "-"}</p>
                  </div>
                </div>

                {leadsLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : groups.length === 0 ? (
                  <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                    Belum ada lead di paket ini
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groups.map((g) => {
                      const key = `${g.year}-${g.month}`;
                      const label = g.month && g.year ? `${MONTHS[g.month - 1]} ${g.year}` : g.year ? `${g.year}` : "Belum ditentukan";
                      const expanded = expandedGroups.has(key);
                      return (
                        <div key={key} className="overflow-hidden rounded-xl border border-border bg-card">
                          <button
                            onClick={() => setExpandedGroups((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                            className="flex w-full items-center gap-4 px-4 py-3 hover:bg-muted/30">
                            <div className="flex-1 text-left">
                              <span className="font-semibold">{label}</span>
                              <span className="ml-2 text-sm text-muted-foreground">{g.leads.length} lead</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{g.totalPaket} paket</span>
                              {g.totalValue > 0 && <span className="flex items-center gap-1"><Banknote className="h-3.5 w-3.5" />{formatRp(g.totalValue)}</span>}
                            </div>
                            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                          </button>
                          {expanded && (
                            <div className="border-t border-border">
                              <table className="w-full text-sm">
                                <thead className="border-b border-border bg-muted/30">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Lead</th>
                                    <th className="px-3 py-2 text-center font-medium text-muted-foreground">1x</th>
                                    <th className="px-3 py-2 text-center font-medium text-muted-foreground">3x</th>
                                    <th className="px-3 py-2 text-center font-medium text-muted-foreground">Double</th>
                                    <th className="px-3 py-2 text-center font-medium text-muted-foreground">12x</th>
                                    <th className="px-4 py-2 text-right font-medium text-muted-foreground">Nilai</th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Agent</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {g.leads.map((l) => (
                                    <tr key={l.id} className="hover:bg-muted/20">
                                      <td className="px-4 py-2">
                                        <Link href={`/inbox?customer=${l.id}`} className="font-medium hover:text-primary hover:underline">
                                          {l.name ?? l.externalId}
                                        </Link>
                                      </td>
                                      <td className="px-3 py-2 text-center">{l.potentialQty1x ?? "-"}</td>
                                      <td className="px-3 py-2 text-center">{l.potentialQty3x ?? "-"}</td>
                                      <td className="px-3 py-2 text-center">{l.potentialQty6x ?? "-"}</td>
                                      <td className="px-3 py-2 text-center">{l.potentialQty12x ?? "-"}</td>
                                      <td className="px-4 py-2 text-right">{l.potentialValue ? formatRpFull(l.potentialValue) : "-"}</td>
                                      <td className="px-4 py-2 text-muted-foreground">{l.assignedTo?.name ?? "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
