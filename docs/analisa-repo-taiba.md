# Analisa Repo Referensi — crm-taiba-medina

Di-clone ke: reference/crm-taiba-medina (read-only, hanya untuk dipelajari).
Remote token sudah dilepas dari git config setelah clone.
Tanggal analisa: 15 Sep 2026. Commit terakhir: 9fa402d (tracking/channel dropdown).

## 1. Ringkasan

CRM omnichannel untuk travel umrah/haji (ODAC Corp / Taiba Medina).
Inti produknya: semua chat dari WhatsApp, Instagram, dan Messenger masuk ke
satu Inbox, dibalas agent (dibantu AI), lalu aktivitas sales-nya dicatat di
Jurnal Sales dan diukur di Analitik + Analisa Iklan (atribusi Meta Ads).

Skala: ~234 file TypeScript, ~31.000 baris, 120 route API. Single-tenant
(satu perusahaan per deploy), bukan multi-tenant SaaS.

## 2. Stack

- Next.js 16.2.10 (App Router, React 19.2) + TypeScript
- Tailwind CSS v4 (token via CSS variables di globals.css)
- Prisma 6 + PostgreSQL
- Auth sendiri: bcryptjs + JWT (jose) di cookie httpOnly "crm_session"
- Baileys (WhatsApp QR, worker terpisah worker/wa-qr.mjs + pm2)
- WhatsApp Cloud API, Instagram & Messenger Graph API
- web-push (notifikasi browser), Telegram bot untuk notifikasi internal
- zod untuk validasi, lucide-react untuk ikon
- Catatan: AGENTS.md mengingatkan Next.js 16 punya breaking change —
  "middleware" diganti "proxy" (src/proxy.ts), API async (cookies/headers
  harus di-await).

## 3. Arsitektur

- Modular monolith. Semua di satu app Next.js.
- src/app/(app)/* = halaman CRM (route group berpagar auth di layout-nya),
  src/app/api/* = 120 route handler, src/app/login, src/app/c = halaman
  publik tracking link.
- Pola per halaman konsisten: page.tsx (Server Component, ambil data +
  cek sesi) -> xxx-client.tsx (Client Component besar, semua interaksi).
- src/lib/* = semua logika bisnis (auth, rbac, inbox, ai, waba, meta-capi,
  broadcast, rule-engine, dll). Ini yang paling berguna dipelajari.
- Realtime pakai SSE sendiri (src/lib/sse-hub.ts), bukan websocket.
- Proteksi route di src/proxy.ts: semua path non-public diarahkan ke /login
  kalau JWT tidak valid. API di-exclude dari matcher, jadi tiap route API
  harus cek sesi sendiri.

## 4. Data model (prisma/schema.prisma, 872 baris)

Entitas inti:
- User (+ AgentTarget: target harian per agent: FU, closing, aktivitas, lead baru)
- Customer = lead sekaligus pelanggan. Unik per (channel, externalId).
  Punya score, tags, source, assignedTo, closedAt, timeToCloseMinutes.
- Conversation + Message + ConversationAgent (bisa multi-agent per percakapan:
  PRIMARY / SECONDARY / PENDING)
- Pipeline -> Stage -> Deal (kanban klasik)
- FollowUp (terjadwal, PENDING/DONE)
- SalesJournal (jurnal aktivitas sales harian — ini fitur andalan mereka)

Domain travel umrah (TIDAK relevan untuk klinik):
- PackageType -> PackageVariant -> PackagePrice, dengan roomType
  Quad/Triple/Double/Infant, dan di Customer ada potentialQuad/Triple/Double/
  Infant + potentialValue + packageMonth/packageYear.

Marketing & atribusi:
- TrackingLink, TrackingDomain, ClickSession (simpan fbclid, fbp, utm_*,
  campaign/adset/ad id + nama), LpEvent, CapiEvent (Meta Conversions API)

Otomasi & konten:
- AutoReply, AutoTag, QuickReply, Template (WA template), BroadcastJob +
  BroadcastRecipient, ConversationFlow, CrmRule (rule engine JSON:
  trigger/conditions/actions), Media + MediaFolder

AI:
- AiSettings (satu baris singleton — provider, model, prompt, jam kerja,
  eskalasi, draft mode, "bridge" ke ChatGPT/Gemini/Deepseek)
- KnowledgeBase, QaPair, ConversationResume, EvaluationHistory,
  AudienceProfile

Channel & integrasi:
- WabaChannel, WaQrChannel, MetaChannel, ApiKey, WebhookEndpoint,
  NotifySubscriber, PushSubscription, AppSettings, CrmSetting (key-value JSON)

## 5. Role & izin (src/lib/rbac.ts)

6 role: OWNER, SUPERADMIN, SUPERVISOR, AGENT, GUEST, VIEWER.
Izin berbasis "ability" (view_all_chats, assign_chats, broadcast,
manage_channels, manage_ai, manage_automation, manage_templates,
manage_crm_settings, manage_users, manage_owner, view_reports) dengan satu
matrix ROLE_ABILITIES sebagai sumber kebenaran. Menu sidebar (src/lib/nav.ts)
otomatis difilter dari ability yang sama.

Ini pola yang BAGUS dan layak ditiru: satu file, gampang diubah, menu dan
izin tidak pernah beda.

Catatan kritis: GUEST dan VIEWER diberi ability yang sama persis dengan OWNER,
dengan alasan "tampilan sama, aksi diblokir di handler/API". Artinya read-only
bergantung pada disiplin pengecekan di tiap handler, bukan pada matrix izin.
Rawan bocor kalau ada satu handler yang lupa. Untuk Aqma sebaiknya read-only
dibuat sebagai flag terpisah (mis. user.readOnly) yang dicek di satu tempat,
bukan diakali lewat matrix ability.

## 6. Yang bagus dan layak dibawa ke Aqma

1. RBAC ability-matrix + nav yang dihasilkan dari matrix itu.
2. Theming full CSS variable di globals.css (--primary, --primary-dark,
   --primary-soft, --sidebar-accent, radius). Ganti brand = ganti variabel.
   Untuk Aqma tinggal isi navy #2F4157 dan sage #A1A692.
3. Pemisahan page.tsx (server, ambil data) vs client component.
4. Semua logika bisnis di src/lib, bukan di komponen.
5. Konsep Jurnal Sales: aktivitas sales dicatat terstruktur (jenis FU, respon
   FU, label, alasan gagal closing, next action, jadwal) lalu jadi bahan
   analitik. Untuk klinik ini bisa jadi jurnal konsultasi/follow-up pasien.
6. Definisi "closing" yang bisa dikonfigurasi (berdasarkan label atau stage),
   bukan di-hardcode.
7. Target harian per agent + halaman evaluasi tim.
8. Atribusi iklan end-to-end: link tracking -> kode unik di pesan WA pertama
   -> ClickSession dicocokkan ke Customer -> CapiEvent balik ke Meta.
   Ini mahal dibuat dan sangat berguna kalau Aqma beriklan di Meta.
9. Auth JWT cookie httpOnly + proxy guard: sederhana, tanpa dependensi berat.

## 7. Yang TIDAK boleh dibawa mentah-mentah

1. Seluruh domain paket umrah (PackageType/Variant/Price, roomType
   Quad/Triple/Double/Infant, potentialQuad dst di tabel Customer).
   Klinik kecantikan butuh treatment, paket sesi, membership, jadwal dokter/
   terapis, kunjungan — bukan kamar hotel. Field potensi closing sebaiknya
   TIDAK ditempel di tabel Customer seperti di sini.
2. Tabel Customer yang terlalu gemuk (channel, lead, potensi closing,
   atribusi, sinkron Konektor semua jadi satu). Untuk Aqma sebaiknya pisah:
   Patient (data orang) vs Lead/Inquiry vs Deal/Order vs Appointment.
3. Warna brand pink #B03272 — diganti navy/sage Aqma.
4. Client component raksasa: inbox-client.tsx 108 KB, analytics-client.tsx
   80 KB, ai-client.tsx 61 KB. Susah dirawat. Di Aqma dipecah sejak awal.
5. Tidak ada satu pun test di repo ini. Untuk Aqma minimal logika uang,
   jadwal, dan izin harus ada test.
6. AiSettings menyimpan token login browser ChatGPT (bridgeChatGptToken) —
   jangan ditiru, itu rapuh dan berisiko.
7. Beberapa sisa kerja: src/lib/inbox.ts.bak, close_popup_test.js,
   qa_screenshot.js di root.

## 8. Catatan keamanan (untuk dijadikan standar Aqma)

- 107 dari 120 route API memeriksa sesi. 8 route sisanya publik by design
  (webhook Telegram, ingest WA internal, endpoint tracking/pageview/ping).
  Tetap perlu dipastikan yang "internal" dilindungi shared secret, dan
  endpoint tracking publik dibatasi rate-nya.
- Token channel (WhatsApp accessToken, Meta pageAccessToken) dan apiKey AI
  disimpan plaintext di database. Untuk Aqma (data pasien = data kesehatan,
  lebih sensitif) sebaiknya dienkripsi at-rest.
- .env tidak ter-commit, .gitignore sudah benar.
- AGENT hanya punya view_own_chats; pembatasan data per agent dilakukan di
  query, bukan row-level security.

## 9. Kesimpulan untuk Aqma Clinic

Repo ini kuat sebagai referensi POLA (auth, RBAC, struktur folder, theming,
jurnal sales, analitik, atribusi iklan) dan sebagai bukti bahwa stack
Next.js 16 + Prisma + Postgres sudah terbukti jalan di server ini.

Tapi MODEL DATA-nya milik bisnis travel, bukan klinik. Yang berbeda mendasar
di klinik kecantikan: ada jadwal (appointment) dan kapasitas dokter/terapis/
ruangan, ada rekam tindakan per kunjungan, ada paket sesi yang dipakai
bertahap (mis. 6x laser), dan ada repeat/retensi — bukan sekali closing lalu
selesai seperti satu keberangkatan umrah.

Rekomendasi: pakai stack + pola arsitektur yang sama, tulis ulang domainnya
dari nol sesuai kebutuhan Aqma. Menunggu instruksi lanjutan operator sebelum
memutuskan modul dan skema.
