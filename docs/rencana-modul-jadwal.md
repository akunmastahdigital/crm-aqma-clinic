# Rancangan: Modul Jadwal / Booking — CRM Aqma Clinic

Status: **RANCANGAN, BELUM DIKERJAKAN.** Menunggu persetujuan operator.
Tanggal: 13 Okt 2026

Konteks dari operator:
- Pasien pesan lewat WhatsApp, dan ada juga yang datang langsung (walk-in)
- Belum ada sistem apa pun, jadwal belum tercatat di mana-mana
- Jumlah cabang, jenis sumber daya, dan durasi treatment ingin bisa diatur
  sendiri lewat pengaturan, bukan di-hardcode

Karena belum ada data lama, tidak ada migrasi yang perlu dikhawatirkan.

---

## 1. Prinsip: fleksibel di tempat yang tepat

"Semua bisa diatur" kalau diartikan mentah akan melahirkan sistem generik yang
justru menyusahkan — pengguna harus mengarang strukturnya sendiri sebelum bisa
mencatat satu booking pun.

Yang dibuat bisa diatur dari UI:
- Daftar cabang
- Daftar sumber daya: ruangan, terapis/dokter, alat
- Daftar treatment, durasinya, jeda bersih-bersihnya
- Treatment ini butuh sumber daya apa saja
- Jam operasional per cabang

Yang **tidak** dibuat bisa diatur (sengaja dikunci, supaya sistem tetap waras):
- Satu sumber daya tidak bisa dipakai dua booking pada waktu yang sama
- Booking selalu punya waktu mulai dan selesai
- Perubahan status booking tercatat siapa dan kapan

---

## 2. Model data

### a. `Branch` — cabang
```
id, name, address?, phone?
timezone      : String @default("Asia/Jakarta")
openingHours  : Json    -- [{hari, buka, tutup, libur}] x7
isActive
```
Mulai dengan satu cabang. Menambah cabang nanti tidak mengubah struktur.

### b. `Resource` — apa pun yang membuat slot terbatas
```
id, branchId, name
type     : STAFF | ROOM | EQUIPMENT
userId?  : String   -- kalau STAFF dan orangnya punya akun CRM
tags     : String[] -- mis. ["laser", "injeksi"] untuk mencocokkan keahlian
capacity : Int @default(1)   -- >1 untuk hal seperti "kursi tunggu facial"
workingHours : Json?  -- kosong = ikut jam cabang
isActive
```

Satu model untuk tiga hal (orang, ruangan, alat) karena perlakuannya sama
persis: sama-sama tidak bisa dipakai dua tempat sekaligus. Memisahkannya jadi
tiga tabel hanya menduplikasi logika bentrok tiga kali.

Jadi kasus "mesin laser cuma satu" otomatis tertangani: buat Resource bertipe
EQUIPMENT bernama "Laser CO2", capacity 1.

### c. `Treatment` — katalog layanan
```
id, name, categoryId?
durationMinutes : Int    -- lama tindakan
bufferMinutes   : Int @default(0)  -- bersih-bersih / siap-siap setelahnya
price           : Int?
isActive, order
```

### d. `TreatmentRequirement` — treatment butuh sumber daya apa
```
id, treatmentId
resourceType : STAFF | ROOM | EQUIPMENT
tag          : String?   -- kosong = sumber daya mana saja yang bertipe itu
quantity     : Int @default(1)
```
Contoh "Laser CO2": butuh 1 ROOM, 1 STAFF bertag "laser", 1 EQUIPMENT bertag
"laser". Sistem memilih sumber daya yang bebas pada jam itu.

### e. `Appointment` — intinya
```
id, branchId, customerId, treatmentId
startAt, endAt      -- endAt = startAt + duration + buffer
status  : BOOKED | CONFIRMED | ARRIVED | DONE | CANCELLED | NO_SHOW
source  : WHATSAPP | WALK_IN | PHONE | ONLINE
packageEnrollmentId? -- kalau ini bagian dari paket sesi
sessionNumber?       -- sesi ke-berapa
note?
createdById, createdAt, updatedAt
```

### f. `AppointmentResource` — sumber daya yang terpakai
```
id, appointmentId, resourceId, startAt, endAt
@@index([resourceId, startAt, endAt])
```
Tabel inilah yang mencegah dobel-booking. Satu booking bisa memakai beberapa
sumber daya sekaligus (ruangan + terapis + alat).

### g. `AppointmentLog` — jejak perubahan
```
id, appointmentId, fromStatus?, toStatus, reason?, userId, createdAt
```
Jadwal pasien berubah-ubah dan kadang jadi bahan sengketa ("saya sudah bilang
batal kemarin"). Jejaknya disimpan.

---

## 3. Pencegahan dobel-booking — perlu jujur soal ini

Cara paling aman di PostgreSQL adalah *exclusion constraint* memakai tipe
`tstzrange`, sehingga database sendiri yang menolak dua booking bertabrakan.
Prisma tidak bisa mendeklarasikan itu lewat schema, jadi harus lewat SQL
tambahan.

Dua pilihan:

1. **Pengecekan di aplikasi dalam satu transaksi.** Lebih sederhana, cukup
   untuk volume klinik. Celahnya sangat kecil tapi secara teori ada, kalau dua
   admin menyimpan di detik yang persis sama.
2. **Exclusion constraint di database.** Betul-betul kedap, tapi perlu
   menjalankan SQL manual di luar Prisma.

Usulan saya: mulai dengan nomor 1, dan siapkan nomor 2 sebagai berkas SQL
terpisah yang operator jalankan kalau sudah merasa perlu. Saya tidak boleh
mengeksekusi SQL ke database, jadi apa pun pilihannya operator yang menjalankan.

---

## 4. Hubungan dengan paket yang sudah ada — ini perlu diputuskan

CRM sekarang sudah punya `PackageType` → `PackageVariant` → `PackagePrice`,
sisa adaptasi dari CRM travel. Itu dipakai untuk mencatat "potensi closing".

Kalau `Treatment` dibuat berdiri sendiri, klinik akan punya **dua katalog
layanan yang terpisah** — satu untuk jualan, satu untuk operasional. Cepat
atau lambat keduanya akan berbeda isi, lalu laporan tidak lagi bisa
dipertanggungjawabkan. Ini masalah klasik dan membosankan, tapi nyata.

Usulan: `Treatment` jadi satu-satunya katalog. `PackageVariant` ditambah
`treatmentId` dan `sessionCount`, sehingga "Paket Laser 6x" berarti
6 sesi dari Treatment "Laser CO2". Dari situ sistem bisa tahu sesi ke berapa
yang sudah dipakai dan mana yang belum dijadwalkan.

---

## 5. Alur pakai sehari-hari

**Dari WhatsApp.** Di panel pasien dalam Inbox ada tombol "Buat Jadwal". CS
pilih treatment, sistem menampilkan slot yang benar-benar kosong, CS pilih,
selesai. Tidak perlu pindah halaman — ini penting karena CS sedang mengetik
sambil melayani.

**Walk-in.** Dari halaman Jadwal, tombol tambah. Pasien baru bisa dibuat
langsung di form yang sama tanpa harus ke menu Pasien dulu.

**Halaman Jadwal.** Tampilan harian per sumber daya (kolom = terapis/ruangan,
baris = jam), plus tampilan mingguan. Status diubah dengan klik: datang,
selesai, batal, no-show.

---

## 6. Yang terbuka setelah modul ini jadi

- Pengingat H-1 otomatis — memangkas no-show
- Follow-up H+1 setelah treatment
- Pengingat sesi berikutnya dari paket
- Angka no-show per bulan, yang sekarang sama sekali tidak terukur
- Tingkat pemakaian ruangan dan terapis
- Treatment apa yang paling laku, jam berapa paling ramai

---

## 7. Pembagian pekerjaan

**Slice A — pengaturan.** Cabang, sumber daya, treatment, kebutuhan sumber
daya, jam operasional. Semua bisa diisi dari UI. Belum ada booking.
Hasil terlihat: halaman Pengaturan Klinik yang bisa Anda isi sendiri.

**Slice B — booking inti.** Buat/ubah/batal jadwal, pencarian slot kosong,
pencegahan bentrok, halaman Jadwal harian.

**Slice C — integrasi Inbox.** Tombol buat jadwal dari percakapan, dan
ringkasan jadwal pasien di panel lead.

**Slice D — paket & sesi.** Hubungkan `PackageVariant` ke `Treatment`,
catat sesi ke berapa.

**Slice E — auto follow-up** (rencana terpisah, lihat
`docs/rencana-auto-followup.md`) memakai data dari Slice B dan D.

---

## 8. Yang saya butuhkan untuk mulai Slice A

Tidak harus lengkap, bisa menyusul sambil jalan — tapi makin cepat ada, makin
cepat kelihatan bentuknya:

1. Ada berapa cabang sekarang, dan jam bukanya?
2. Daftar ruangan tindakan
3. Daftar dokter/terapis
4. Alat yang jumlahnya terbatas dan jadi rebutan (mis. mesin laser)
5. Daftar treatment beserta perkiraan durasinya

Kalau belum sempat dikumpulkan, Slice A tetap bisa dikerjakan — datanya bisa
Anda isi sendiri lewat UI setelah jadi. Yang penting strukturnya benar dulu.
