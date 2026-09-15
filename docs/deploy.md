# Rencana Deploy — crm.klinikaqma.com

Aplikasi sudah siap di-deploy: `npm run build` sudah lolos di server ini.
Yang tersisa adalah langkah-langkah yang menyentuh sumber daya bersama
(database, port, nginx, SSL, process manager). Langkah-langkah itu HARUS
dijalankan oleh operator, bukan oleh asisten, karena server ini menjalankan
banyak aplikasi milik klien lain dan satu kesalahan bisa mematikan mereka.

Urutannya penting. Jangan lompat.

---

## 1. Database khusus CRM Aqma

Buat database DAN user BARU. Jangan pakai ulang database aplikasi lain, dan
jangan pakai user Postgres yang sudah dipakai app lain.

```sql
CREATE USER aqma_crm WITH PASSWORD '<password-acak-panjang>';
CREATE DATABASE aqma_crm OWNER aqma_crm;
```

Cek dulu sebelum jalan, supaya tidak menimpa apa pun:

```sql
SELECT datname FROM pg_database ORDER BY datname;
SELECT usename FROM pg_user ORDER BY usename;
```

Kalau nama `aqma_crm` sudah terpakai, ganti namanya — jangan timpa.

## 2. File .env

```bash
cd /root/work/crm-aqma-clinic
cp .env.example .env
```

Isi minimal:

- `DATABASE_URL` — arahkan ke database dari langkah 1. Periksa dua kali.
  Salah tulis di sini = migrasi jalan di database klien lain.
- `JWT_SECRET` — `openssl rand -base64 48`
- `NEXT_PUBLIC_APP_URL=https://crm.klinikaqma.com`
- `PORT` — lihat langkah 3

## 3. Pilih port yang belum dipakai

```bash
ss -ltnp | sort -t: -k2 -n
```

Default di `package.json` adalah `3060`. Kalau sudah dipakai app lain,
ganti `PORT` di `.env`. Jangan pakai port yang sudah terisi.

## 4. Buat skema tabel

```bash
npx prisma generate
npm run db:push
```

`db:push` membaca `DATABASE_URL` dari `.env`. Pastikan langkah 2 sudah benar
SEBELUM menjalankan ini. Perintah ini membuat tabel; kalau tertuju ke database
yang salah, ia akan mengubah database itu.

## 5. User awal

```bash
SEED_OWNER_PASSWORD='<password-owner>' \
SEED_AGENT_PASSWORD='<password-cs>' \
npm run db:seed
```

Membuat user OWNER dan satu user AGENT, plus pipeline default klinik.
Ganti password lewat aplikasi setelah login pertama.

Jangan jalankan `npm run db:seed:demo` di produksi — itu data contoh.

## 6. Build & jalankan

```bash
npm run build
npm run start      # untuk uji coba di foreground
```

Untuk permanen, pilih salah satu (keputusan operator, ikuti kebiasaan server ini):

pm2:
```bash
pm2 start npm --name crm-aqma -- start
pm2 save
```

systemd: buat unit yang menjalankan `npm run start` di
`/root/work/crm-aqma-clinic` dengan `EnvironmentFile=/root/work/crm-aqma-clinic/.env`.

## 7. DNS

Arahkan `crm.klinikaqma.com` (A record) ke IP server ini. Tunggu propagasi
sebelum lanjut ke SSL.

## 8. Nginx

Buat vhost BARU khusus domain ini. Jangan mengedit vhost app lain, dan jangan
menambahkan `server_name crm.klinikaqma.com` ke blok yang sudah ada.

```nginx
server {
    listen 80;
    server_name crm.klinikaqma.com;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3060;   # samakan dengan PORT di .env
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE (inbox realtime) butuh buffering mati
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

Catatan: `proxy_buffering off` dan `proxy_read_timeout` panjang itu wajib —
inbox realtime pakai Server-Sent Events, kalau nginx buffering menyala chat
tidak akan update sampai koneksi putus.

Selalu `nginx -t` sebelum reload.

## 9. SSL

```bash
certbot --nginx -d crm.klinikaqma.com
```

Setelah SSL aktif, cookie sesi otomatis jadi `secure` (kode membaca
`x-forwarded-proto`).

## 10. Verifikasi

- Buka https://crm.klinikaqma.com — harus diarahkan ke halaman login
- Login dengan user OWNER dari langkah 5
- Cek sidebar, warna navy, logo tampil
- Buka menu Pengaturan CRM dan Pipeline untuk memastikan database terbaca

---

## Yang BELUM disiapkan dan perlu keputusan terpisah

- **Worker WhatsApp QR** (`worker/wa-qr.mjs`) butuh proses pm2 sendiri dan
  folder auth. Jangan dijalankan sampai channel WhatsApp Aqma benar-benar
  disiapkan. Endpoint `api/channels/wa-qr-channels` memanggil pm2 secara
  langsung — periksa dulu sebelum dipakai.
- **WhatsApp Cloud API / Instagram / Messenger** butuh App Meta, token, dan
  URL webhook `https://crm.klinikaqma.com/api/webhooks/meta`.
- **Web push** butuh `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`
  (`npx web-push generate-vapid-keys`). Tanpa itu, push nonaktif dengan aman.
- **Backup**: belum ada. Sebelum CRM ini dipakai menyimpan data pasien asli,
  siapkan `pg_dump` terjadwal khusus database `aqma_crm`.
