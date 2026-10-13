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

## 2026-09-15 — Sesi 3: adaptasi kode + push ke repo Aqma

Instruksi operator: clone CRM Taiba, modifikasi untuk Aqma Clinic, deploy di
server ini dengan domain crm.klinikaqma.com, lalu commit & push ke
github.com/akunmastahdigital/crm-aqma-clinic.

SELESAI:
1. Kode Taiba disalin ke root project (tanpa .git), reference/ di-gitignore.
2. Rebrand mekanis: semua "Taiba"/"ODAC"/domain lama diganti Aqma +
   crm.klinikaqma.com.
3. Tema: globals.css ditulis ulang dengan palet Aqma (navy #2F4157 primary,
   sage #A1A692 accent). Sidebar jadi navy. Font display Cormorant Garamond
   ditambah untuk judul. Logo dipasang di favicon, sidebar, header mobile.
   Halaman login didesain ulang (latar navy + motif lengkung ekor huruf Q).
4. Domain umrah -> klinik:
   - roomType -> sessionPack ("1x"/"3x"/"6x"/"12x")
   - potentialQuad/Triple/Double/Infant -> potentialQty1x/3x/6x/12x
   - "jamaah" -> "paket"/"pasien", "tipe kamar" -> "ukuran paket"
   - menu: Pelanggan -> Pasien & Lead, Paket -> Paket Treatment
   - prompt AI evaluasi & profil audience ditulis ulang untuk klinik,
     dengan larangan memberi diagnosa/saran medis
   - stage default: Lead Baru, Dihubungi, Konsultasi, Booking Jadwal,
     Datang & Treatment, Batal
5. Keamanan/kebersihan: prisma/waba-setup.mjs DIHAPUS (berisi WABA ID & nomor
   WhatsApp milik klien lain, Klinik Gigi Odac Family). Seed demo ditulis ulang
   dengan data fiktif klinik. Password seed tidak lagi hardcoded.
   File QA/backup sisa repo asal dihapus.
6. Dua bug bawaan Taiba diperbaiki:
   - push.ts memanggil setVapidDetails saat import -> build GAGAL total kalau
     env VAPID kosong. Dibuat lazy.
   - customer-panel memanggil setPkgRoomType yang tidak pernah dideklarasikan
     (lolos karena ignoreBuildErrors) -> diganti resetPkgQty.
7. npm install + prisma generate + npm run build: LOLOS.
   Sisa 11 error TypeScript, semuanya bawaan dari repo Taiba (repo asal memang
   jalan dengan typescript.ignoreBuildErrors = true). Belum diperbaiki.
8. git init, commit, push ke origin/main. Repo remote SEBELUMNYA KOSONG
   (dicek dengan git ls-remote, tidak ada branch) jadi tidak ada yang tertimpa.
   Token dilepas dari remote setelah push.
9. docs/deploy.md ditulis: langkah deploy lengkap untuk operator.

BELUM SELESAI — DEPLOY. Diblokir aturan channel, bukan karena gagal:
asisten tidak boleh membuat/menyentuh database apa pun, tidak boleh
systemctl/pm2/docker/nginx/certbot, dan tidak boleh membuka port tanpa izin.
Semua langkahnya sudah ditulis di docs/deploy.md untuk dijalankan operator.
Port yang diusulkan: 3060 (perlu dicek belum dipakai app lain).

## 2026-09-15 — Sesi 4: favicon

- favicon.ico bawaan Next.js diganti dengan ikon Aqma: huruf Q dari logo
  (lingkaran + ekor bergelombang) di atas latar navy. Wordmark utuh tidak
  dipakai karena tidak terbaca di 16px. Dicek keterbacaannya di 16/32/48/64px.
- Dibuat juga icon-192.png, icon-512.png, apple-icon.png.
  Catatan: public/sw.js sudah merujuk icon-192.png sejak repo Taiba tapi
  filenya tidak pernah ada — notifikasi push selama ini tanpa ikon. Sekarang ada.
- Kendala yang sempat muncul: Turbopack menolak ICO yang isinya PNG non-RGBA.
  Solusinya convert("RGBA") sebelum save. Sudah dicatat di scripts/make-favicon.py.
- Build ulang: lolos. Commit 3c735fe sudah di-push.

TEMUAN: muncul file .secrets/deploy-credentials.txt di folder project
(dibuat 15 Sep 10:40, bukan oleh saya) berisi password login owner & CS
dalam bentuk plaintext. File itu TIDAK ikut di-commit — saya unstage lalu
tambahkan /.secrets ke .gitignore. Filenya tetap ada di disk, tidak saya hapus.

## 2026-10-09 — Sesi 5: port 42 commit update dari Taiba

Instruksi operator: cek update di repo Taiba, lalu implementasi & sesuaikan
dengan bisnis klinik.

Upstream maju 42 commit (9fa402d -> 9dc52d9), 62 file, ~3.740 baris.
Di-port lewat 3-way merge (git apply --3way), BUKAN salin manual, supaya
perubahan khas Aqma tidak tertimpa. Riwayat commit Taiba sengaja tidak
di-merge supaya data klien lain tidak ikut masuk ke repo Aqma.
Hanya 2 konflik (WA QR), sudah diselesaikan.

Catatan lengkap: docs/update-dari-taiba-okt2026.md

Fitur masuk: dasbor closing+omzet & tren 7 hari & performa tim, Laporan Bulanan
per label (menu baru /report), deteksi + gabung lead duplikat lintas channel,
status ceklis WA, auto-assign agent, automasi (tombol interaktif, filter
channel, variasi AI + jeda acak), ganti password sendiri, label di Follow Up.

Disesuaikan ke klinik: kamus topik laporan bulanan aslinya untuk klinik GIGI
(tambal/cabut/scaling/behel/veneer) — diganti ke treatment kecantikan
(jerawat, flek, laser, botox, filler, facial, dll). Deteksi keberatan BPJS
diganti jadi keberatan harga/cicilan/takut efek samping/izin pasangan.
Istilah dasbor & warna dipindah ke palet Aqma.

6 bug upstream diperbaiki, 3 di antaranya serius:
- api/customers/merge TANPA pengecekan izin sama sekali — VIEWER pun bisa
  menghapus pasien permanen. Ditambah guard isReadOnly().
- merge kehilangan closedAt, potentialQty*, source, konektorId dll saat
  menggabungkan -> laporan closing bisa meleset. Sekarang ikut dipindah.
- api/broadcast/[id] query relasi yang tidak ada di schema -> halaman detail
  broadcast pasti error. Diganti query terpisah.

Helper baru src/lib/rbac.ts isReadOnly(). BARU dipakai di route merge;
route lain yang mengubah data belum — perlu disapu menyeluruh nanti.

MEDIA_DIR dipindah dari /var/www/... ke dalam folder project (web root
bersama milik klien lain). Konsekuensinya nginx perlu blok location /uploads/
sebelum upload media bisa dibuka di browser.

Build lolos. 11 error TypeScript bawaan Taiba masih ada (tidak menghalangi).

BELUM BISA DIPAKAI:
- WA QR via WAHA: butuh container Docker, saya tidak boleh menjalankan Docker.
- Widget web chat: public/widget.js tidak ada di repo Taiba juga.
- Upload media: butuh blok nginx location /uploads/.

PERLU DEPLOY: ada perubahan schema (semua additive, tidak ada kolom dihapus),
jadi butuh npm run db:push lewat scripts/deploy_aqma.sh — operator yang jalankan.

## 2026-10-12 — Sesi 7: panduan WAHA + tutup lubang webhook

Operator minta panduan pasang WAHA, dengan penekanan agar tidak merusak
aplikasi/database lain yang hidup di server ini.

TEMUAN KEAMANAN (sebelum menulis panduan):
/api/internal/waha-webhook sama sekali TIDAK punya verifikasi. Endpoint itu
publik (tidak lewat cookie sesi) karena dipanggil WAHA. Artinya siapa pun yang
tahu URL-nya bisa POST dan menyuntikkan percakapan pasien palsu ke CRM.
Ini bawaan dari upstream Taiba, bukan dari perubahan kita.

DIPERBAIKI:
- Env baru WAHA_WEBHOOK_SECRET. Webhook memeriksa header X-Webhook-Secret
  dengan perbandingan waktu-tetap. Kalau secret tidak di-set, request tetap
  diterima tapi menulis warning — sengaja, supaya instalasi lama tidak mendadak
  mati tanpa penjelasan.
- Saat membuat sesi, CRM otomatis mengirim customHeaders berisi secret itu ke
  WAHA, jadi operator tidak perlu menyetelnya manual di dua tempat.
- Sekalian: event webhook ditambah "message.ack", sebelumnya hanya "message"
  sehingga status ceklis WhatsApp tidak akan pernah terupdate.

DITULIS: docs/setup-waha.md — 8 langkah, plus daftar perintah Docker yang
DILARANG (prune, rm -f tanpa nama, compose down di folder lain), peringatan
jangan pakai opsi MongoDB WAHA, wajib bind ke 127.0.0.1 (bukan 0.0.0.0),
pm2 restart per-nama bukan "pm2 restart all", dan nginx -t sebelum reload.
.env.example ikut diperbarui (WAHA_*, MEDIA_DIR).

Build diverifikasi dengan npm run build:check — folder .next yang dilayani
pm2 TIDAK tersentuh (timestamp tetap 9 Okt 13:07).

BELUM: container WAHA belum ada. Butuh operator menjalankan Docker.

## 2026-10-13 — Sesi 8: modul jadwal Slice A (pengaturan klinik)

Operator ACC rancangan, minta lanjut. Dikerjakan Slice A saja: pengaturan.
Belum ada booking sama sekali — itu Slice B.

Rancangan acuan: docs/rencana-modul-jadwal.md

SCHEMA BARU (semua additive):
- enum ResourceType: STAFF | ROOM | EQUIPMENT
- Branch: nama, alamat, telepon, timezone, openingHours (Json 7 hari,
  index 0 = Minggu — konvensi sengaja disamakan dengan AiSettings.workDays)
- Resource: satu tabel untuk ruangan, orang, DAN alat. Disatukan karena
  sifatnya identik (tidak bisa dipakai dua tempat sekaligus); dipisah berarti
  menulis logika bentrok tiga kali. Punya tags untuk pencocokan keahlian,
  capacity, workingHours opsional, userId opsional untuk tautan akun CRM.
- Treatment: durationMinutes, bufferMinutes, price, kategori -> PackageType
- TreatmentRequirement: treatment butuh berapa sumber daya tipe apa, tag apa
- PackageVariant ditambah treatmentId + sessionCount (nullable)

KEPUTUSAN PENTING: katalog layanan DISATUKAN. PackageVariant sekarang
menunjuk ke Treatment, tidak menyalin namanya. Kalau dibiarkan terpisah,
klinik akan punya dua daftar layanan (jualan vs operasional) yang cepat atau
lambat isinya beda dan membuat laporan tidak bisa dipertanggungjawabkan.

API: /api/klinik/branches, /resources, /treatments (+ [id] untuk PATCH/DELETE).
Semua lewat guardKlinik() di src/lib/klinik.ts — satu gerbang izin bersama
(sesi + manage_crm_settings + isReadOnly untuk operasi tulis). Dibuat terpusat
supaya tidak terulang kasus endpoint merge yang lupa dipasangi izin.
Validasi pakai zod, pesan error diterjemahkan ke bahasa manusia.

DELETE sengaja menolak, bukan diam-diam menghapus:
- Cabang yang masih punya sumber daya -> 409, sarankan nonaktifkan
- Treatment yang dipakai paket penjualan -> 409, sarankan nonaktifkan

UI: menu baru "Pengaturan Klinik" (/klinik), 3 tab: Cabang, Sumber Daya,
Treatment. Pakai palet Aqma, bukan warna bawaan Taiba.

Build lolos lewat npm run build:check — folder .next yang dilayani pm2 TIDAK
tersentuh (timestamp tetap 13 Okt 00:21).

PERLU DEPLOY: ada tabel baru, jadi butuh db:push lewat scripts/deploy_aqma.sh.
Semua additive, tidak ada kolom dihapus atau diubah tipenya.

BERIKUTNYA (belum dikerjakan): Slice B booking inti + pencegahan bentrok,
Slice C tombol buat jadwal dari Inbox, Slice D paket & sesi,
Slice E auto follow-up (docs/rencana-auto-followup.md).

MASIH PERLU DIKONFIRMASI OPERATOR:
- Daftar treatment & struktur harga Aqma yang sebenarnya (pemetaan paket sesi
  1x/3x/6x/12x saat ini ASUMSI saya, bukan data asli).
- Siapa saja user CRM ini dan perannya; berapa cabang.
- Sumber lead (WA? IG? iklan Meta? walk-in?).
- Apakah butuh modul jadwal/appointment & kapasitas dokter/terapis — modul ini
  BELUM ADA, dan itu kebutuhan inti klinik yang tidak dipunyai CRM travel.

---

Aturan kerja channel ini:
- Scope keras: hanya /root/work/crm-aqma-clinic.
- Tidak menyentuh DB apa pun, tidak systemctl/nginx/docker/pm2.
- UI copy Bahasa Indonesia.
- Update file ini setiap ada aktivitas.
