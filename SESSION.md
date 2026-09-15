# Session Log — CRM Aqma Clinic

Catatan berjalan. Selalu di-update tiap ada task/aktivitas, supaya kalau bot
restart atau error, konteks tidak hilang.

---

## 2026-09-15 — Sesi 1

Status: belum ada kode aplikasi. Baru fondasi brand.

Yang diketahui tentang bisnis:
- Aqma Clinic = klinik kecantikan (aesthetic clinic).
- Nama resmi di logo: "AQMA AESTHETIC CLINIC".
- Selain itu belum ada info: layanan/treatment, cabang, jumlah user, sumber
  lead, alur penjualan, siapa pemakai CRM. MASIH PERLU DITANYAKAN.

Aktivitas:
1. Operator kirim file logo via Telegram
   (/root/telegram-crm-aqma-clinic-bot/downloads/429619781/5_photosize_5.jpg).
   Instruksi: UI CRM harus berpatokan pada logo ini.
2. Logo dianalisis, warna diekstrak dari pixel asli:
   - navy latar  #2F4157
   - sage huruf  #A1A692
3. Dibuat docs/brand.md — palet turunan lengkap (skala 50–900), netral,
   semantic, aturan pemakaian, tipografi, bentuk/radius, rencana dark mode.
4. Logo di-resize & dioptimasi ke assets/brand/logo-navy-512.png dan -192.png
   (file asli tidak diubah / tetap di folder downloads).

Keputusan yang sudah diambil:
- Arah visual: navy + sage, tenang & premium. Tidak pakai pink/ungu/gradient.
- Serif untuk display, sans-serif uppercase spaced untuk label/nav.

Belum diputuskan:
- Stack (usulan default: Next.js + Postgres + Prisma). Belum di-ACC operator.
- Data model, role/permission, modul apa saja.
- Database: proyek ini BELUM punya DB. Tidak boleh bikin/konek DB sendiri —
  operator yang provision.

Langkah berikutnya:
- Menunggu "instruksi selanjutnya" dari operator.
- Tetap perlu jawaban soal: layanan & harga, siapa user CRM + rolenya,
  sumber lead, alur dari calon pasien -> booking -> datang -> repeat,
  cabang berapa, target selesai kapan.

## 2026-09-15 — Sesi 2: pelajari repo referensi

Operator kirim repo referensi + PAT GitHub:
github.com/akunmastahdigital/crm-taiba-medina (CRM travel umrah, ODAC Corp).
Instruksi: pelajari dulu, instruksi lanjutan menyusul.

Aktivitas:
1. Repo di-clone ke reference/crm-taiba-medina (depth 50). Setelah clone,
   remote URL di-reset ke URL biasa supaya token TIDAK tersimpan di
   .git/config. Tidak ada perintah ke database yang dijalankan.
2. Dianalisis: schema.prisma (872 baris), rbac.ts, auth.ts, nav.ts, proxy.ts,
   globals.css, struktur src/app dan src/lib, 120 route API.
3. Hasil lengkap ditulis di docs/analisa-repo-taiba.md.

Temuan inti:
- Stack: Next.js 16.2.10 + React 19 + Tailwind v4 + Prisma 6 + PostgreSQL,
  auth sendiri (bcrypt + JWT jose di cookie), SSE untuk realtime,
  Baileys/WA Cloud/IG/Messenger untuk channel. Single-tenant.
- ~234 file TS, ~31 ribu baris. Modular monolith.
- Pola bagus yang layak ditiru: RBAC ability-matrix di satu file + sidebar
  yang di-generate dari matrix itu; theming via CSS variable (ganti brand =
  ganti variabel); page.tsx server + xxx-client.tsx; semua logika di src/lib;
  Jurnal Sales + definisi closing yang bisa dikonfigurasi; target per agent;
  atribusi iklan Meta end-to-end (TrackingLink -> ClickSession -> CapiEvent).
- Yang TIDAK dibawa: seluruh domain paket umrah (roomType Quad/Triple/Double/
  Infant, potentialValue nempel di tabel Customer), tabel Customer gemuk,
  warna pink #B03272, client component raksasa (inbox-client 108 KB),
  nol test, bridgeChatGptToken.
- Catatan keamanan: token channel & API key AI disimpan plaintext di DB;
  GUEST/VIEWER dikasih ability sama dengan OWNER lalu diblok manual di
  handler (rawan bocor). Untuk Aqma: read-only jadi flag terpisah, dan
  kredensial dienkripsi at-rest (data pasien lebih sensitif).

Kesimpulan: pakai stack + pola arsitekturnya, tapi domain/model data ditulis
ulang dari nol untuk klinik kecantikan (appointment & kapasitas terapis,
rekam tindakan per kunjungan, paket sesi terpakai bertahap, retensi/repeat).

Langkah berikutnya: menunggu instruksi lanjutan operator.

Catatan: PAT GitHub yang dikirim operator sebaiknya di-rotate setelah selesai,
karena sudah beredar di chat.

---

Aturan kerja channel ini:
- Scope keras: hanya /root/work/crm-aqma-clinic.
- Tidak menyentuh DB apa pun, tidak systemctl/nginx/docker/pm2.
- UI copy Bahasa Indonesia.
- Update file ini setiap ada aktivitas.
