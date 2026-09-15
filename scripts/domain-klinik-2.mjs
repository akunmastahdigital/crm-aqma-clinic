// Pass kedua: sisa placeholder, komentar, header tabel, dan prompt AI.
import { readFileSync, writeFileSync } from "node:fs";

const EDITS = {
  "src/app/(app)/paket/paket-client.tsx": [
    ['className="px-3 py-2 text-center font-medium text-muted-foreground">Quad<', 'className="px-3 py-2 text-center font-medium text-muted-foreground">1x<'],
    ['className="px-3 py-2 text-center font-medium text-muted-foreground">Triple<', 'className="px-3 py-2 text-center font-medium text-muted-foreground">3x<'],
    ['className="px-3 py-2 text-center font-medium text-muted-foreground">Infant<', 'className="px-3 py-2 text-center font-medium text-muted-foreground">12x<'],
  ],
  "src/app/(app)/inbox/customer-panel.tsx": [
    ["pkgRoomType", "pkgSessionPack"],
    ["setPkgRoomType", "setPkgSessionPack"],
  ],
  "src/app/(app)/tracking/tracking-client.tsx": [
    ['placeholder="Promo Umroh Plus Thaif"', 'placeholder="Promo Facial Glow Desember"'],
    ['placeholder="promo-umroh-plus-thaif"', 'placeholder="promo-facial-glow-desember"'],
    ['placeholder="Halo, saya tertarik dengan Promo Umroh Plus Thaif"', 'placeholder="Halo, saya tertarik dengan Promo Facial Glow"'],
  ],
  "src/app/(app)/settings/minat/page.tsx": [
    ['placeholder="misal: Ramadhan, Program 10 Hari, Umroh+Turki..."', 'placeholder="misal: Anti-aging, Acne, Whitening, Slimming..."'],
  ],
  "src/app/(app)/ai/ai-client.tsx": [
    ['placeholder="paket, harga, umroh, biaya"', 'placeholder="harga, treatment, facial, booking, jadwal"'],
  ],
  "src/app/(app)/templates/templates-client.tsx": [
    ['placeholder="promo_umroh_plus_dubai"', 'placeholder="promo_facial_glow"'],
    ['placeholder="Promo Spesial Umroh"', 'placeholder="Promo Spesial Treatment"'],
  ],
  "src/app/api/package-variants/[id]/prices/route.ts": [
    ["// body: { Quad: 25000000, Triple: 27500000, Double: 30000000, Infant: 10000000 }",
     '// body: { "1x": 350000, "3x": 950000, "6x": 1800000, "12x": 3400000 }'],
  ],
  "prisma/schema.prisma": [
    ["potentialQty1x    Int?            // jumlah orang tipe Quad", "potentialQty1x    Int?            // jumlah paket sesi 1x yang diminati"],
    ["potentialQty3x  Int?            // jumlah orang tipe Triple", "potentialQty3x    Int?            // jumlah paket sesi 3x yang diminati"],
    ["potentialQty6x  Int?            // jumlah orang tipe Double", "potentialQty6x    Int?            // jumlah paket sesi 6x yang diminati"],
    ["potentialQty12x  Int?            // jumlah infant", "potentialQty12x   Int?            // jumlah paket sesi 12x yang diminati"],
    ['sessionPack      String         // "1x" | "3x" | "6x" | "12x"', 'sessionPack      String         // jumlah sesi dalam paket: "1x" | "3x" | "6x" | "12x"'],
    ['name          String         // "Bronze", "Silver", "Gold"', 'name          String         // nama paket treatment, mis. "Facial Acne", "Laser CO2"'],
  ],
};

let n = 0;
for (const [file, edits] of Object.entries(EDITS)) {
  let s = readFileSync(file, "utf8");
  const before = s;
  for (const [a, b] of edits) {
    if (!s.includes(a)) { console.warn("TIDAK KETEMU di", file, "->", a.slice(0, 60)); continue; }
    s = s.split(a).join(b);
  }
  if (s !== before) { writeFileSync(file, s); n++; console.log("updated", file); }
}
console.log("total file diubah:", n);
