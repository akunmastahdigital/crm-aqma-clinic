// Ganti domain umrah -> domain klinik kecantikan.
//
// Pemetaan yang dipakai (asumsi, mudah diubah nanti):
//   PackageType    = Kategori Treatment  (Facial, Laser, Injeksi, Body, ...)
//   PackageVariant = Paket Treatment     (Facial Acne, Laser CO2, ...)
//   PackagePrice.roomType -> sessionPack = jumlah sesi dalam satu paket
//                                          ("1x", "3x", "6x", "12x")
//   Customer.potentialQuad/Triple/Double/Infant
//     -> potentialQty1x / Qty3x / Qty6x / Qty12x = berapa paket yang diminati
//   "jamaah" -> "paket" / "pasien"
//
// Jalankan dari root project: node scripts/domain-klinik.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".next", ".git", "reference", "docs", "assets", "scripts"]);
const EXT = /\.(ts|tsx|mjs|prisma)$/;

const RULES = [
  // --- field Prisma & TS ---
  ["potentialQuad", "potentialQty1x"],
  ["potentialTriple", "potentialQty3x"],
  ["potentialDouble", "potentialQty6x"],
  ["potentialInfant", "potentialQty12x"],
  ["roomType", "sessionPack"],
  // --- state lokal di customer-panel ---
  ["pkgQuad", "pkgQty1x"],
  ["setPkgQuad", "setPkgQty1x"],
  ["pkgTriple", "pkgQty3x"],
  ["setPkgTriple", "setPkgQty3x"],
  ["pkgDouble", "pkgQty6x"],
  ["setPkgDouble", "setPkgQty6x"],
  ["pkgInfant", "pkgQty12x"],
  ["setPkgInfant", "setPkgQty12x"],
  // --- nilai literal tipe kamar -> paket sesi ---
  ['"Quad"', '"1x"'],
  ['"Triple"', '"3x"'],
  ['"Double"', '"6x"'],
  ['"Infant"', '"12x"'],
  ["ROOM_TYPES", "SESSION_PACKS"],
  // --- istilah UI ---
  ["totalJamaahAll", "totalPaketAll"],
  ["totalJamaah", "totalPaket"],
  ["Total Jamaah Potensial", "Total Paket Potensial"],
  ["Total Jamaah", "Total Paket"],
  ["Jamaah per tipe kamar", "Jumlah paket per ukuran paket"],
  ["Tabel jamaah per tipe kamar", "Tabel jumlah paket per ukuran paket"],
  ["jamaah", "paket"],
  ["Jamaah", "Paket"],
  ["calon jamaah", "calon pasien"],
  ["tipe kamar", "ukuran paket"],
  ["Tipe Kamar", "Ukuran Paket"],
];

let changed = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!EXT.test(name)) continue;
    const before = readFileSync(p, "utf8");
    let after = before;
    for (const [from, to] of RULES) after = after.split(from).join(to);
    if (after !== before) { writeFileSync(p, after); changed++; console.log("updated", p.slice(ROOT.length + 1)); }
  }
}
walk(ROOT);
console.log("total file diubah:", changed);
