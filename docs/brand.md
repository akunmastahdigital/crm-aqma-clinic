# Aqma Aesthetic Clinic — Brand & UI Foundation

Sumber: logo resmi (file dari operator, 15 Sep 2026).
Logo: wordmark serif "AQMA" — huruf Q berupa lingkaran dengan ekor bergelombang
(garis lengkung berlapis, kesan air / kulit halus / elegan) — di bawahnya
"AESTHETIC CLINIC" sans-serif, uppercase, letter-spacing lebar.

## 1. Warna inti (diambil langsung dari file logo)

| Token            | Hex      | Catatan                                   |
|------------------|----------|-------------------------------------------|
| brand.navy       | #2F4157  | warna latar logo — warna utama brand      |
| brand.sage       | #A1A692  | warna huruf logo — aksen/sekunder         |

Kesan: tenang, mahal, klinis tapi hangat. Bukan "pink klinik kecantikan".
Jangan pakai pink/ungu/gradient neon — akan melawan logo.

## 2. Skala warna turunan

Navy (primary) — dari #2F4157:
- 50  #F2F4F7
- 100 #E3E8EE
- 200 #C3CDD9
- 300 #9CACC0
- 400 #6E85A0
- 500 #4A6483
- 600 #2F4157  <- brand
- 700 #27364A
- 800 #1E2A3A
- 900 #151E2A

Sage (secondary/accent) — dari #A1A692:
- 50  #F6F7F3
- 100 #EBEDE5
- 200 #D7DBCB
- 300 #BFC5AF
- 400 #A1A692  <- brand
- 500 #8A9079
- 600 #6F7560
- 700 #575C4C
- 800 #3F4338
- 900 #2A2D26

Netral (hangat, bukan abu dingin):
- surface       #FFFFFF
- surface.muted #F7F8F6
- border        #E4E7E1
- text.primary  #1E2A3A
- text.muted    #6B7280

Semantic (disesuaikan agar tidak norak di samping navy/sage):
- success #4F7A5B
- warning #C08A3E
- danger  #B4534B
- info    #4A6483

## 3. Aturan pemakaian warna di UI

- Navy 600/700: sidebar, header, tombol utama, teks judul.
- Sage 400: aksen — badge aktif, highlight, ikon sekunder, garis bawah tab.
  JANGAN dipakai untuk teks kecil di atas putih (kontras kurang).
- Background aplikasi: surface.muted (#F7F8F6), card putih, border tipis #E4E7E1.
- Kontras: teks di atas navy pakai #FFFFFF atau sage 100.
  Teks sage di atas navy = OK (dipakai di logo). Sage di atas putih = hanya
  untuk elemen dekoratif/besar, bukan body text.
- Status pipeline pakai warna semantic, bukan pelangi.

## 4. Tipografi

Mengikuti karakter logo:
- Display/heading: serif dengan kontras tebal-tipis (mis. Cormorant Garamond,
  Playfair Display). Dipakai hemat: judul halaman, angka besar di dashboard.
- UI/body: sans-serif geometrik-netral (mis. Inter atau Jost).
  Label & nav: uppercase, letter-spacing 0.08em–0.12em, ukuran kecil —
  meniru "AESTHETIC CLINIC".
- Angka (harga, omzet): tabular-nums, selalu rata kanan.

## 5. Bentuk & rasa

- Radius: 10–12px untuk card & input, 999px untuk chip/badge (menggemakan
  lingkaran huruf Q).
- Shadow sangat halus (0 1px 2px rgba(30,42,58,.06)); hindari drop shadow tebal.
- Spacing longgar, banyak white space — kesan klinik premium.
- Garis lengkung ekor huruf Q boleh dipakai sebagai motif dekoratif tipis
  (divider, empty state, latar login), warna sage dengan opacity rendah.
- Ikon: stroke 1.5px, outline (mis. Lucide), bukan filled.

## 6. Aset

- assets/brand/logo-navy-512.png — logo latar navy, 512px
- assets/brand/logo-navy-192.png — versi kecil (favicon/avatar)
- Belum ada: versi transparan / versi mono / SVG. Minta ke operator kalau perlu.

## 7. Dark mode (nanti)

Base #1E2A3A, surface #27364A, teks #E3E8EE, aksen sage 400.
Logo versi asli sudah cocok di dark mode.
