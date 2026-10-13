# Rancangan: Auto Follow Up Terjadwal — CRM Aqma Clinic

Status: **RANCANGAN, BELUM DIKERJAKAN.** Menunggu persetujuan operator.
Tanggal: 13 Okt 2026

Cakupan yang diminta operator:
- Sistem mengirim pesan WhatsApp sendiri pada waktu tertentu
- Rangkaian bertahap (H+1, H+3, H+7) yang berhenti sendiri kalau pasien membalas
- Pengingat yang terikat kejadian (H-1 booking, H+1 setelah treatment, sesi berikutnya)
- Jalan di WA QR maupun WA Cloud API
- Pengaturannya fleksibel, bisa diubah dari UI tanpa deploy

---

## 1. Yang sudah ada dan dipakai ulang

| Sudah ada | Dipakai untuk |
|---|---|
| `Customer.consent` (Boolean) | Dasar opt-out. Tidak perlu tabel baru. |
| `Conversation.windowExpiresAt` | Tahu jendela 24 jam WA Cloud masih terbuka atau tidak |
| `AiSettings.workDays` + `lib/business-hours.ts` | Jam boleh kirim. Sudah ada helper `isInsideBusinessHours()` |
| `lib/delivery.ts` | Pengiriman per channel. Mesin follow-up cukup memanggil ini |
| `Template` (WA Cloud) | Pesan di luar jendela 24 jam |

Yang **tidak** dipakai ulang: `FollowUp` dan `SalesJournal.scheduledAt`.
Keduanya tugas untuk manusia. Kalau dicampur dengan pesan otomatis, dua-duanya
jadi membingungkan — CS tidak bisa lagi membedakan "saya harus menelepon" dari
"robot sudah mengirim". Dibiarkan terpisah.

---

## 2. Model data yang diusulkan (4 tabel baru)

### a. `FollowUpSequence` — aturannya
```
id, name, isActive
triggerType   : enum (lihat §3)
triggerConfig : Json   -- filter: label, stage, paket, cabang
channelMode   : enum   AUTO | WA_CLOUD | WA_QR
                       AUTO = pakai channel asal percakapan pasien
stopOnReply   : Boolean (default true)
respectHours  : Boolean (default true)
maxPerPatient : Int     -- batas pesan dari sequence ini per pasien
dryRun        : Boolean (default true)  -- lihat §6
createdAt, updatedAt
```

### b. `SequenceStep` — langkah-langkahnya
```
id, sequenceId, order
offsetMinutes : Int    -- jarak dari jangkar (anchor). Boleh negatif:
                          -1440 = H-1 sebelum booking
body          : String -- mendukung {{nama}}, {{treatment}}, {{tanggal}}, {{jam}}
attachments   : Json?
templateName  : String? -- wajib untuk WA Cloud di luar jendela 24 jam
sendCondition : enum    ALWAYS | IF_NO_REPLY | IF_NOT_CLOSED
```

### c. `SequenceEnrollment` — pasien X masuk sequence Y
```
id, sequenceId, customerId
anchorAt      : DateTime  -- titik nol: waktu lead masuk / jadwal booking / tanggal treatment
status        : ACTIVE | DONE | STOPPED | FAILED
stoppedReason : String?   -- "pasien membalas", "opt-out", "closing", "dibatalkan admin"
createdAt
@@unique([sequenceId, customerId, anchorAt])   -- cegah daftar ganda
```

### d. `ScheduledMessage` — antrian kirim, satu-satunya sumber kebenaran
```
id, enrollmentId, stepId, customerId, conversationId?
channel     : Channel
runAt       : DateTime
status      : PENDING | SENT | SKIPPED | FAILED | CANCELLED
skipReason  : String?
attempts    : Int @default(0)
lastError   : String?
sentMessageId : String?   -- wamid, untuk melacak ceklis
lockedAt    : DateTime?   -- untuk klaim antar worker
lockedBy    : String?
@@unique([enrollmentId, stepId])   -- idempoten: satu langkah = satu pesan, selamanya
@@index([status, runAt])
```

Dua `@@unique` itu yang membuat sistem ini aman kalau worker mati di tengah
jalan atau di-restart: baris yang sama tidak bisa dibuat dua kali, jadi pasien
tidak akan menerima pesan dobel.

---

## 3. Jenis pemicu (triggerType)

Bisa dikerjakan **sekarang** (datanya sudah ada):

1. `LEAD_NO_REPLY` — lead masuk, belum dibalas / belum closing.
   Jangkar: `Customer.createdAt`
2. `LEAD_NO_CLOSING` — sudah ngobrol tapi `closedAt` masih kosong setelah N hari
3. `PATIENT_INACTIVE` — `lastContactAt` lebih dari N hari. Untuk reaktivasi
4. `MANUAL` — CS memasukkan pasien ke sequence lewat tombol di panel lead

Butuh **modul jadwal dulu** (belum ada, lihat §7):

5. `BOOKING_UPCOMING` — H-1 sebelum jadwal. Jangkar: waktu appointment
6. `AFTER_TREATMENT` — H+1 setelah datang. Jangkar: waktu selesai treatment
7. `PACKAGE_NEXT_SESSION` — sesi berikutnya dari paket yang sudah dibeli

---

## 4. Worker penjadwal

Satu proses Node, jalan terus, siklus tiap 60 detik:

1. **Enroll** — cari pasien yang cocok pemicu aktif, buat `SequenceEnrollment`
   + seluruh `ScheduledMessage`-nya sekaligus (jadi jadwalnya terlihat di UI
   sejak awal, bukan muncul mendadak)
2. **Claim** — ambil pesan `PENDING` yang `runAt <= sekarang`, tandai
   `lockedAt`/`lockedBy` lewat `updateMany` bersyarat. Ini mencegah dua worker
   mengirim pesan yang sama kalau nanti ada lebih dari satu proses
3. **Periksa sebelum kirim** — lihat §5
4. **Kirim** lewat `lib/delivery.ts`, catat `sentMessageId`
5. **Gagal** → `attempts++`, coba lagi dengan jeda menanjak, maksimal 3x,
   lalu `FAILED` dan notifikasi admin

Pendaftaran prosesnya (pm2) harus dilakukan operator. Saya tidak boleh.

---

## 5. Aturan keselamatan — dibangun sejak awal, bukan ditambal

Sebuah pesan terjadwal **dibatalkan** kalau:

- Pasien membalas setelah pesan dijadwalkan, dan `stopOnReply` aktif
- `Customer.consent = false` (opt-out)
- Pasien sudah closing, dan `sendCondition = IF_NOT_CLOSED`
- Sequence dinonaktifkan atau langkahnya dihapus
- Admin membatalkan manual

Sebuah pesan **ditunda** (bukan dibatalkan) kalau jatuh di luar jam kerja —
digeser ke jam buka berikutnya.

Khusus WA Cloud: kalau `windowExpiresAt` sudah lewat dan langkah itu tidak
punya `templateName`, pesan di-`SKIPPED` dengan alasan jelas, bukan dipaksa
kirim lalu ditolak Meta.

Khusus WA QR (WAHA): **batas laju wajib**. Nomor WhatsApp biasa bisa diblokir
kalau mengirim banyak pesan beruntun ke orang yang tidak sedang chat.
Usulan: maksimal 1 pesan per 20–40 detik dengan jeda acak, dan ada batas
harian. Angkanya bisa diatur dari UI.

**Opt-out.** Pesan otomatis pertama ke seorang pasien menyertakan cara berhenti
(misal "balas STOP"). Kata kunci STOP/BERHENTI yang masuk langsung menyetel
`consent = false` dan membatalkan semua pesan terjadwal untuk pasien itu.
Ini data kesehatan — tidak bisa ditawar.

**Saklar darurat.** Satu tombol di Pengaturan untuk menghentikan SELURUH
pengiriman otomatis seketika, tanpa perlu menghapus sequence apa pun.

---

## 6. Mode uji coba (dryRun)

Sequence baru **default `dryRun = true`**. Dalam mode ini worker menghitung
dan mencatat semuanya seperti biasa, tapi tidak benar-benar mengirim. Jadwalnya
bisa dilihat di UI: siapa, kapan, isi pesannya apa.

Alasannya sederhana: kesalahan di sini mengirim pesan salah ke pasien asli, dan
itu tidak bisa ditarik kembali. Lebih baik dilihat dulu sehari, baru dinyalakan.

---

## 7. Ketergantungan yang harus dibicarakan

Tiga pemicu paling bernilai untuk klinik — pengingat booking H-1, follow-up
H+1 setelah treatment, dan pengingat sesi berikutnya — **semuanya butuh data
jadwal, dan CRM ini belum punya modul appointment sama sekali.**

Minimal yang dibutuhkan: tabel `Appointment` berisi pasien, waktu mulai,
treatment, terapis/dokter, status (booked / datang / batal / no-show).

Tanpa itu, yang bisa dikerjakan hanya pemicu nomor 1–4 (berbasis lead).
Pemicu 5–7 menunggu.

Saran saya: modul jadwal dikerjakan lebih dulu atau barengan. Di klinik
kecantikan, jadwal itu jantungnya — dan pengingat H-1 biasanya memberi hasil
paling cepat terasa karena langsung memangkas no-show.

---

## 8. Usulan pembagian pekerjaan (bertahap, bisa dilihat hasilnya)

**Slice 1 — mesinnya.** 4 tabel, worker, aturan keselamatan, mode dryRun.
Pemicu `MANUAL` saja. CS bisa memasukkan pasien ke sequence lewat tombol.
Hasil yang terlihat: halaman antrian "pesan terjadwal" berisi siapa dan kapan.

**Slice 2 — UI pengaturan.** Buat/ubah sequence dan langkahnya dari browser,
beserta variabel `{{nama}}` dkk dan pratinjau.

**Slice 3 — pemicu otomatis berbasis lead.** `LEAD_NO_REPLY`,
`LEAD_NO_CLOSING`, `PATIENT_INACTIVE`.

**Slice 4 — modul jadwal (Appointment)**, lalu pemicu `BOOKING_UPCOMING`,
`AFTER_TREATMENT`, `PACKAGE_NEXT_SESSION`.

Slice 1 dan 2 bisa dipakai untuk uji coba nyata sebelum apa pun berjalan
otomatis.

---

## 9. Yang masih perlu dijawab operator

1. Modul jadwal/appointment: dikerjakan sekarang, atau nanti? Ini menentukan
   apakah pengingat H-1 masuk gelombang pertama.
2. Perkiraan volume: berapa lead per hari, berapa pasien datang per hari?
   Dipakai untuk menetapkan batas laju WA QR.
3. Jam boleh kirim. Usulan: 09.00–19.00 WIB, dan tidak di hari klinik tutup.
4. Siapa yang menyetujui isi pesan? Kalimat yang menyinggung kondisi kulit atau
   hasil treatment sebaiknya lewat dokter, bukan saya atau tim CS.
5. Apakah pesan otomatis boleh dikirim ke pasien yang sedang ditangani CS
   secara aktif? Usulan saya: tidak — tunda sampai percakapan selesai.
