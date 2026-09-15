# CRM Aqma Clinic

CRM & omnichannel untuk **Aqma Aesthetic Clinic** (klinik kecantikan).

Basis kode diadaptasi dari CRM Taiba Medina, lalu di-rebrand dan domainnya
diganti dari travel umrah ke klinik kecantikan. Detail analisa repo asal ada
di `docs/analisa-repo-taiba.md`, panduan brand di `docs/brand.md`,
riwayat pekerjaan di `SESSION.md`.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 (semua warna lewat CSS variable di `src/app/globals.css`)
- Prisma 6 + PostgreSQL
- Auth sendiri: bcrypt + JWT (jose) di cookie httpOnly, gerbang di `src/proxy.ts`

## Identitas visual

Diambil dari logo: navy `#2F4157` dan sage `#A1A692`. Aturan lengkap di
`docs/brand.md`. Ganti brand cukup lewat variabel di `globals.css`.

## Setup lokal

```bash
cp .env.example .env    # lalu isi DATABASE_URL, JWT_SECRET, dst
npm install
npx prisma generate
npm run db:push         # HANYA ke database milik CRM Aqma
SEED_OWNER_PASSWORD=... SEED_AGENT_PASSWORD=... npm run db:seed
npm run dev
```

> **Peringatan.** Server ini menjalankan banyak aplikasi milik klien lain.
> `db:push` dan `db:seed` hanya boleh diarahkan ke database khusus CRM Aqma.
> Jangan pernah menunjuk `DATABASE_URL` ke database aplikasi lain.

`npm run db:seed:demo` hanya untuk data contoh — jangan dijalankan di produksi.

## Struktur

```
src/app/(app)/      halaman CRM (dilindungi login)
src/app/api/        route handler (120 endpoint)
src/app/login/      halaman login
src/app/c/          halaman publik tracking link
src/lib/            semua logika bisnis (auth, rbac, inbox, ai, waba, ...)
src/components/     app shell, sidebar, komponen ui
prisma/schema.prisma
worker/wa-qr.mjs    worker WhatsApp QR (butuh proses terpisah)
docs/               brand, analisa repo asal
```

## Role

`OWNER`, `SUPERADMIN`, `SUPERVISOR`, `AGENT`, `GUEST`, `VIEWER`.
Izin diatur di satu tempat: `src/lib/rbac.ts`. Menu sidebar
(`src/lib/nav.ts`) otomatis mengikuti izin tersebut.

## Status

Tahap rebrand + penyesuaian domain. Kebutuhan spesifik Aqma (daftar treatment,
alur booking, peran tim, jumlah cabang) belum dikonfirmasi — lihat bagian
"Belum diputuskan" di `SESSION.md`.
