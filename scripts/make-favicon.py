"""Bikin favicon Aqma dari logo asli.

Ambil huruf Q (lingkaran + ekor bergelombang) sebagai ikon, karena wordmark
"AQMA AESTHETIC CLINIC" utuh tidak terbaca di ukuran 16px. Latar navy brand,
glyph warna asli dari logo.

Jalankan dari root project:  python3 scripts/make-favicon.py <path-logo-asli>
"""
import sys
from PIL import Image

SRC = sys.argv[1]
NAVY = (47, 65, 87)
SIZE = 512
PAD = 0.18

src = Image.open(SRC).convert("RGB")

# Area huruf Q di logo 1000x1000.
# Batas bawah sengaja di 548 supaya baris "AESTHETIC CLINIC" tidak ikut terambil.
region = src.crop((320, 380, 450, 548))

# Mask piksel terang (huruf sage) supaya bisa dicari bbox yang rapat
mask = region.convert("L").point(lambda v: 255 if v > 120 else 0)
bbox = mask.getbbox()
glyph = region.crop(bbox)
gmask = mask.crop(bbox)
print("bbox:", bbox, "ukuran glyph:", glyph.size)

canvas = Image.new("RGB", (SIZE, SIZE), NAVY)
maxw = int(SIZE * (1 - 2 * PAD))
w, h = glyph.size
scale = min(maxw / w, maxw / h)
nw, nh = int(w * scale), int(h * scale)
canvas.paste(
    glyph.resize((nw, nh), Image.LANCZOS),
    ((SIZE - nw) // 2, (SIZE - nh) // 2),
    gmask.resize((nw, nh), Image.LANCZOS),
)

# Next.js/Turbopack menolak ICO yang isinya PNG non-RGBA, jadi konversi dulu.
canvas.convert("RGBA").save(
    "src/app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)]
)
canvas.resize((180, 180), Image.LANCZOS).save("public/apple-icon.png", optimize=True)
canvas.resize((192, 192), Image.LANCZOS).save("public/icon-192.png", optimize=True)
canvas.save("public/icon-512.png", optimize=True)
canvas.resize((256, 256), Image.LANCZOS).save("assets/brand/icon-q-navy-256.png", optimize=True)
print("favicon & ikon PWA dibuat")
