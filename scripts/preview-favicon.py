"""Cek keterbacaan favicon di ukuran kecil.
Render 16 / 32 / 48 px lalu diperbesar (nearest) supaya bisa dilihat mata.
"""
from PIL import Image

base = Image.open("assets/brand/icon-q-navy-256.png").convert("RGB")
sizes = [16, 32, 48, 64]
zoom = 4
pad = 12
tiles = [base.resize((s, s), Image.LANCZOS).resize((s * zoom, s * zoom), Image.NEAREST) for s in sizes]
width = sum(t.width for t in tiles) + pad * (len(tiles) + 1)
height = max(t.height for t in tiles) + pad * 2
sheet = Image.new("RGB", (width, height), (247, 248, 246))
x = pad
for t in tiles:
    sheet.paste(t, (x, pad))
    x += t.width + pad
sheet.save("assets/brand/favicon-preview.png")
print("preview:", sheet.size)
