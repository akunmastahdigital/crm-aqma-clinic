# Panduan Pasang WAHA untuk WA QR — CRM Aqma Clinic

WA QR di CRM ini sudah memakai WAHA (WhatsApp HTTP API) yang berjalan sebagai
container Docker. Kodenya sudah siap; yang belum ada containernya.

Dokumen ini ditulis untuk dijalankan **oleh operator**, bukan oleh asisten.
Asisten tidak diizinkan menjalankan Docker, menyentuh database, atau mengubah
konfigurasi nginx di server ini.

---

## ⚠️ BACA DULU — server ini dipakai bersama

Per 9 Okt 2026 ada **12 proses pm2 milik aplikasi lain** di server yang sama:
adena-crm, adya-wa-qr, adya-wisata-crm, azka-crm, azka-journey, ghufran-crm,
mastah-crm, mastah-wa-qr, notifcrm-hub, renai-crm, visualabs-crm,
visualabs-wa-worker. Semuanya punya database dan datanya sendiri.

Aturan yang tidak boleh dilanggar:

| Jangan | Alasan |
|---|---|
| `docker system prune`, `docker volume prune`, `docker container prune` | Menghapus volume/container milik proyek lain. Data hilang permanen. |
| `docker rm -f` tanpa menyebut nama container kita | Bisa kena container orang lain. |
| `docker compose down` di folder proyek lain | Mematikan aplikasi klien lain. |
| Menaruh WAHA di port yang sudah terpakai | Menabrak aplikasi yang sedang jalan. |
| Mengarahkan WAHA ke MongoDB/Postgres yang sudah ada | WAHA akan menulis koleksi/tabel sesinya ke database itu. |
| Mengedit vhost nginx milik domain lain | Mematikan situs klien lain. |

**Khusus database.** WAHA versi Plus bisa menyimpan sesi ke MongoDB. **Jangan
pakai opsi itu.** Panduan ini memakai penyimpanan file di volume milik kita
sendiri, jadi WAHA **tidak menyentuh database mana pun** — tidak `aqma_crm`,
apalagi database aplikasi lain. CRM Aqma tetap satu-satunya yang berbicara ke
`aqma_crm`, lewat Prisma.

---

## Langkah 1 — Pastikan Docker ada, tanpa mengubah apa pun

```bash
docker version
docker ps
```

`docker ps` hanya **menampilkan** daftar container. Perhatikan container milik
proyek lain yang muncul di situ, lalu **jangan sentuh satu pun**.

Kalau Docker belum terpasang, berhenti di sini dan putuskan dulu — memasang
Docker di server yang sudah penuh aplikasi hidup adalah keputusan tersendiri.

---

## Langkah 2 — Cari port yang benar-benar kosong

Default di kode adalah `3055`. Cek dulu:

```bash
ss -ltnp | grep -E ':(3050|3055)\b' || echo "3050 dan 3055 kosong"
```

- `3050` sudah dipakai CRM Aqma sendiri (lihat `PORT` di `.env`).
- Kalau `3055` ternyata terpakai aplikasi lain, **pilih port lain** (misal 3056)
  dan sesuaikan di Langkah 4 dan 5. Jangan mengusir pemakai lama.

Lihat gambaran seluruh port yang terpakai:

```bash
ss -ltn | sort -t: -k2 -n
```

---

## Langkah 3 — Siapkan folder data WAHA milik kita sendiri

```bash
mkdir -p /root/work/crm-aqma-clinic/waha-data
chmod 700 /root/work/crm-aqma-clinic/waha-data
```

Folder ini berisi sesi WhatsApp yang tersambung. **Perlakukan seperti password.**
Siapa pun yang menyalin folder ini bisa membaca WhatsApp klinik.

---

## Langkah 4 — Siapkan dua rahasia, lalu isi `.env`

```bash
openssl rand -hex 24   # untuk WAHA_API_KEY
openssl rand -hex 32   # untuk WAHA_WEBHOOK_SECRET
```

Tambahkan ke `/root/work/crm-aqma-clinic/.env`:

```
WAHA_URL="http://127.0.0.1:3055"
WAHA_API_KEY="<hasil openssl pertama>"
WAHA_WEBHOOK_SECRET="<hasil openssl kedua>"
```

`.env` jangan pernah di-commit. Sudah masuk `.gitignore`.

Kenapa `WAHA_WEBHOOK_SECRET` wajib: endpoint `/api/internal/waha-webhook`
tidak lewat login, karena yang memanggilnya WAHA, bukan browser. Tanpa rahasia
ini, siapa pun yang tahu URL-nya bisa menyuntikkan chat pasien palsu ke CRM.
CRM akan mengirim rahasia ini sebagai header `X-Webhook-Secret` saat membuat
sesi, dan menolak webhook yang headernya tidak cocok.

---

## Langkah 5 — Jalankan container WAHA

Perhatikan: `-p 127.0.0.1:3055:3000`. Angka `127.0.0.1` di depan itu **penting**
— tanpa itu WAHA terbuka ke internet.

```bash
docker run -d \
  --name waha-aqma \
  --restart unless-stopped \
  -p 127.0.0.1:3055:3000 \
  -e WHATSAPP_API_KEY="<WAHA_API_KEY dari Langkah 4>" \
  -e WHATSAPP_DEFAULT_ENGINE=NOWEB \
  -e WHATSAPP_RESTART_ALL_SESSIONS=True \
  -v /root/work/crm-aqma-clinic/waha-data:/app/.sessions \
  --add-host=host.docker.internal:host-gateway \
  devlikeapro/waha:latest
```

Penjelasan tiap baris yang penting:

- `--name waha-aqma` — nama unik. Semua perintah berikutnya menyebut nama ini,
  supaya tidak pernah salah kena container orang lain.
- `-p 127.0.0.1:3055:3000` — hanya bisa diakses dari dalam server. **Jangan**
  tulis `-p 3055:3000` saja; itu membuka WhatsApp klinik ke seluruh internet.
- `--add-host=host.docker.internal:host-gateway` — supaya WAHA bisa mengirim
  webhook balik ke CRM di `host.docker.internal:3050`. Di Linux ini wajib;
  tanpa ini webhook tidak akan sampai.
- `-v .../waha-data:/app/.sessions` — sesi disimpan di folder kita, bukan di
  volume anonim yang bisa ikut terhapus kalau ada yang menjalankan prune.
- `NOWEB` — engine yang dipakai kode CRM ini (ID pesan dinormalisasi dengan
  asumsi format NOWEB).

Cek jalan:

```bash
docker ps --filter name=waha-aqma
docker logs --tail 30 waha-aqma
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Api-Key: <WAHA_API_KEY>" http://127.0.0.1:3055/api/sessions
```

`200` berarti WAHA siap.

---

## Langkah 6 — Restart CRM supaya `.env` yang baru terbaca

```bash
bash /root/work/crm-aqma-clinic/scripts/deploy_aqma.sh
```

Script ini aman dijalankan ulang: database `aqma_crm` sudah ada jadi dilewati,
`.env` sudah ada jadi tidak ditimpa, vhost dan sertifikat SSL dibiarkan.
Yang dikerjakan hanya prisma generate, db push, seed (upsert), build, dan
pm2 restart.

Jangan restart dengan `pm2 restart all` — itu me-restart 12 aplikasi klien lain
sekaligus. Kalau mau manual, sebut namanya: `pm2 restart crm-aqma --update-env`.

---

## Langkah 7 — Sambungkan nomor WhatsApp

1. Buka https://crm.klinikaqma.com → menu **Channel**
2. Tambah channel **WA QR**, beri nama (misal "WA Utama Aqma")
3. Scan QR dengan WhatsApp klinik: Perangkat Tertaut → Tautkan Perangkat
4. Status berubah jadi tersambung

Di belakang layar, CRM memanggil `POST /api/sessions` ke WAHA dengan nama sesi
`waha-<id channel>` dan mendaftarkan webhook ke
`http://host.docker.internal:3050/api/internal/waha-webhook`
dengan header `X-Webhook-Secret`.

---

## Langkah 8 — Uji

Kirim pesan dari HP lain ke nomor klinik. Pesan harus muncul di Inbox.

Kalau tidak muncul:

```bash
docker logs --tail 50 waha-aqma          # apakah webhook dikirim?
pm2 logs crm-aqma --lines 50 --nostream  # apakah CRM menerimanya?
```

Kalau log CRM menunjukkan `403 forbidden` di webhook, berarti
`WAHA_WEBHOOK_SECRET` di `.env` berbeda dengan yang tersimpan di sesi WAHA.
Hapus sesinya lalu buat ulang channel dari menu Channel:

```bash
curl -X DELETE -H "X-Api-Key: <WAHA_API_KEY>" \
  http://127.0.0.1:3055/api/sessions/waha-<id>
```

Kalau WAHA versi Anda menolak `customHeaders`, kosongkan
`WAHA_WEBHOOK_SECRET` di `.env` dan restart — webhook akan diterima tanpa
verifikasi, tapi catat itu sebagai utang keamanan.

---

## Kalau ingin membatalkan (rollback)

Hanya menyentuh container kita:

```bash
docker stop waha-aqma
docker rm waha-aqma
```

Data sesi tetap aman di `/root/work/crm-aqma-clinic/waha-data`. Untuk benar-benar
memutus WhatsApp, hapus folder itu — tapi berarti harus scan QR ulang nanti.

**Jangan** pakai `docker system prune` untuk membersihkan. Itu menyentuh
seluruh server.

---

## Media (foto/dokumen dari WhatsApp)

Media yang masuk disimpan ke `/root/work/crm-aqma-clinic/uploads` dan diberi URL
`/uploads/...`. Supaya bisa dibuka di browser, vhost
`/etc/nginx/sites-available/crm.klinikaqma.com` perlu satu blok tambahan **di
dalam `server { }` milik domain ini saja**:

```nginx
location /uploads/ {
    alias /root/work/crm-aqma-clinic/uploads/;
    access_log off;
    expires 7d;
}
```

Catatan: nginx berjalan sebagai `www-data` dan tidak bisa membaca `/root`.
Beri izin baca pada jalurnya:

```bash
chmod o+x /root /root/work /root/work/crm-aqma-clinic
chmod -R o+rX /root/work/crm-aqma-clinic/uploads
```

Lalu, **selalu** uji dulu sebelum reload:

```bash
nginx -t && systemctl reload nginx
```

Kalau `nginx -t` gagal, **jangan reload** — konfigurasi rusak akan mematikan
semua situs di server ini, bukan hanya milik kita.

---

## Ringkasan: apa yang disentuh dan tidak

Disentuh:
- Container Docker baru bernama `waha-aqma`
- Port `3055` di `127.0.0.1` saja
- Folder `/root/work/crm-aqma-clinic/waha-data` dan `/uploads`
- File `.env` milik proyek ini
- Proses pm2 `crm-aqma` saja
- (opsional) vhost nginx `crm.klinikaqma.com` saja

Tidak disentuh:
- Database mana pun — WAHA memakai penyimpanan file, bukan DB
- Database `aqma_crm` — hanya diakses CRM lewat Prisma
- 12 proses pm2 milik aplikasi lain
- Container, volume, dan network Docker milik proyek lain
- Vhost nginx domain lain
