# Port Update Taiba → Aqma (9 Okt 2026)

Upstream `crm-taiba-medina` maju 42 commit sejak basis kita (9fa402d → 9dc52d9).
62 file, ~3.740 baris tambahan.

## Cara port-nya

Bukan salin manual. Objek Git Taiba di-fetch ke repo ini, lalu:

```
git diff taiba-base taiba-new > .scratch/upstream.patch
git apply --3way .scratch/upstream.patch
```

3-way merge memakai 9fa402d sebagai basis, jadi perubahan khas Aqma (rebrand,
rename domain klinik, tema navy/sage) tidak tertimpa. Hanya 2 konflik, keduanya
di bagian WA QR tempat kita dulu mengganti path.

Riwayat commit Taiba sengaja TIDAK di-merge. Kalau di-merge, file lama mereka
(`prisma/waba-setup.mjs` berisi WABA ID dan nomor WhatsApp milik Klinik Gigi
Odac Family) jadi bisa diambil dari repo Aqma. Objek Taiba yang ter-fetch tidak
tereferensi sehingga tidak ikut ter-push.

## Fitur yang masuk

Dasbor
- Kartu Closing & Omzet bulan ini, dibanding bulan lalu (persentase naik/turun)
- Grafik tren 7 hari: lead baru vs pesan masuk
- Breakdown aktivitas per kategori + pintasan ke Jurnal
- Performa Tim hari ini (dulu "Top Agent"), hanya untuk admin/supervisor

Laporan Bulanan (menu baru `/report`)
- Rekap lead per label, satu tab per label
- Deskripsi otomatis tiap percakapan tanpa memanggil AI: pembuka lead, topik
  yang terdeteksi, keaktifan chat, keberatan, dan di mana chat berhenti

Data pasien
- Deteksi duplikat otomatis di panel lead + gabung 1 klik
- Gabungkan lead lintas channel (mis. orang yang sama chat via IG lalu WA)
- `scripts/merge-customers-by-phone.mjs` untuk gabung massal berdasarkan nomor

Inbox & pengiriman
- Status ceklis WhatsApp (✓, ✓✓, biru, gagal) seperti di WA asli
- Animasi pesan baru + optimistic UI
- Auto-assign agent ke pasien saat pertama kali membalas
- Warna badge per channel
- Indikator sedang mengetik

Automasi
- Tombol interaktif WA Cloud (quick reply & URL) di balasan otomatis
- Tipe tombol "Link WA" dengan greeting
- Filter channel per aturan
- Variasi teks lewat AI + jeda acak (anti deteksi bot)
- Tombol edit aturan

Lain-lain
- Ganti password sendiri untuk semua role
- Label/tag pasien tampil di Follow Up dan Kalender
- WA QR bisa dipakai sebagai channel Smart Link
- Detail penerima broadcast + status kirimnya

## Penyesuaian ke bisnis klinik

1. **Kamus topik laporan bulanan ditulis ulang.** Aslinya berisi istilah klinik
   GIGI (tambal, cabut, scaling, behel, veneer, implant) — itu bisnis Taiba yang
   lain, sama sekali tidak relevan. Diganti istilah klinik kecantikan: jerawat,
   bekas jerawat, flek, komedo, pori, anti-aging, facial, peeling, laser, botox,
   filler, tanam benang, microneedling, infus whitening, slimming, plus topik
   proses (konsultasi dokter, booking jadwal, cara pembayaran, keamanan
   treatment, jumlah sesi).
2. **Deteksi keberatan diganti.** Aslinya mendeteksi pertanyaan BPJS — klinik
   kecantikan tidak melayani BPJS. Diganti: keberatan harga, minta cicilan,
   ragu efek samping, keputusan tertahan di pasangan/keluarga.
3. **Istilah dasbor.** "Total Pelanggan" → "Total Pasien & Lead",
   "Total Closing" → "Pasien Closing", "Revenue" → "Omzet",
   "Top Agent" → "Performa Tim".
4. **Warna.** Kartu closing dan grafik tren dipindah dari emerald/biru bawaan
   Taiba ke palet Aqma (navy primary, sage accent).
5. **Label laporan** disesuaikan: "reservasi" → "booking jadwal", "lead" → "pasien"
   di tempat yang tepat.

## Bug upstream yang diperbaiki (bukan bawaan kita)

1. `api/broadcast/[id]` melakukan `select: { customer: ... }` pada
   `BroadcastRecipient`, padahal model itu tidak punya relasi `customer` —
   hanya kolom `customerId`. Prisma akan melempar error saat dipanggil, jadi
   halaman detail broadcast pasti gagal. Diganti query terpisah.
2. `lib/inbox.ts` memakai `channel_externalId` di dalam `findFirst`. Bentuk itu
   hanya sah di `findUnique`. Prisma melempar error yang ditelan `.catch()`,
   sehingga atribusi iklan lewat kode T- diam-diam tidak pernah jalan saat
   webhook dikirim ulang. Diganti kondisi eksplisit.
3. `api/customers/merge` **tidak punya pengecekan izin sama sekali** — cukup
   login, lalu siapa pun termasuk role VIEWER (yang seharusnya hanya melihat)
   bisa menghapus baris pasien secara permanen. Ditambah guard `isReadOnly()`.
4. `api/customers/merge` kehilangan data saat menggabungkan: `closedAt`,
   `timeToCloseMinutes`, `source`, `leadStatus`, `priority`, `konektorId`,
   `lastContactAt`, dan keempat field `potentialQty*` tidak ikut dipindah.
   Akibatnya tanggal closing bisa hilang dan laporan closing per bulan meleset.
   Sekarang semua ikut, dan `closedAt` mengambil tanggal paling awal.
5. Memindahkan `konektorId` ke primary saat baris secondary masih ada akan
   melanggar unique constraint dan membatalkan seluruh transaksi. Sekarang
   dikosongkan dulu di secondary.
6. Merge menghapus baris pasien tanpa jejak apa pun. Sekarang satu baris audit
   (waktu, lead asal, channel, siapa yang menggabungkan) ditulis ke `note`.

## Perubahan keamanan & kebersihan lain

- `lib/rbac.ts` dapat helper `isReadOnly()`. Alasannya ditulis di komentar:
  GUEST & VIEWER sengaja diberi ability seluas OWNER agar menunya sama, jadi
  matrix ability TIDAK bisa dipakai memblokir aksi mereka. Setiap handler yang
  mengubah data wajib memanggil helper ini.
- Panjang password minimal dinaikkan dari 6 ke 8 karakter (data pasien).
- `MEDIA_DIR` tidak lagi default ke `/var/www/taiba-uploads` maupun
  `/var/www/crm-uploads`. Sekarang `/root/work/crm-aqma-clinic/uploads`.
  Web root bersama di server ini milik aplikasi klien lain.
- Widget web chat, URL fallback, dan komentar schema di-rebrand ke Aqma.

## Perubahan schema (semua additive, tidak ada kolom dihapus)

- enum `Channel` tambah `WEBCHAT`
- model baru `WebChatSession`
- `Conversation.waQrJid`
- `AutoReply`: `buttons`, `channels`, `aiRephrase`, `delayMin`, `delayMax`
- `BroadcastRecipient.wamid`
- `TrackingLink.waQrChannelId` + relasi ke `WaQrChannel`

Butuh `npm run db:push`. Tidak ada kolom yang dihapus atau diubah tipenya,
jadi data lama aman.

## Yang BELUM bisa dipakai

1. **WA QR via WAHA.** Upstream mengganti Baileys + pm2 dengan WAHA yang jalan
   sebagai container Docker. Kodenya sudah masuk dan port-nya dibuat mengikuti
   `PORT` di `.env` (bukan 3040 milik Taiba), tapi containernya belum ada.
   Saya tidak boleh menjalankan Docker di server ini. Butuh keputusan operator.
2. **Widget web chat.** Route API-nya lengkap, tapi `public/widget.js` tidak ada
   di repo Taiba juga — sepertinya di-deploy terpisah. Jadi fitur webchat belum
   utuh; backend siap, file widget-nya belum ada.
3. **Media upload belum tersaji.** Setelah MEDIA_DIR dipindah ke dalam project,
   nginx perlu satu blok `location /uploads/` yang menunjuk ke folder itu.
   Belum ditambahkan — vhost saat ini hanya punya `location /`.

## Utang teknis yang sengaja dibiarkan

- 11 error TypeScript bawaan Taiba masih ada (repo asal memang jalan dengan
  `typescript.ignoreBuildErrors = true`). Tidak menghalangi build.
- Warna `emerald`/`blue` bawaan Taiba masih tersebar di halaman lama (jurnal,
  analytics, targets, tracking). Hanya dasbor dan grafik tren yang sudah
  dipindah ke palet Aqma. Sisanya kosmetik, belum disentuh.
- Guard `isReadOnly()` baru dipasang di route merge. Route lain yang mengubah
  data masih belum memakainya — ini perlu disapu menyeluruh, dan sebaiknya
  dijadikan satu pekerjaan tersendiri.
- `BroadcastRecipient.customerId` idealnya jadi relasi Prisma sungguhan.
  Tidak dilakukan sekarang karena menambah foreign key ke tabel yang sudah
  hidup, dan saya tidak bisa memeriksa isi database untuk memastikan aman.
