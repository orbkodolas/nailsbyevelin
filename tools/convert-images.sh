#!/usr/bin/env bash
# Forrásképek -> webp, három méretben (a Photo komponens srcset-je ezeket használja):
#   <név>.webp     eredeti (≤1080 px), q80  – nagy megjelenés (hero, galéria, nagy kártyák)
#   <név>-sm.webp   640 px, q74  – közepes (mobilon a kisebb keretek, asztalin a kisebb képek)
#   <név>-xs.webp   400 px, q68  – kicsi (szolgáltatás-bélyegképek, kis keretek)
# Logó: csak a fejléc használja 44 px-en -> 144 px (3x DPR).
# Használat: tools/convert-images.sh
set -euo pipefail
SRC=/sdcard/Documents/nails_by_evelin
OUT="$(cd "$(dirname "$0")/.." && pwd)/frontend/public/images"
mkdir -p "$OUT"
opts=(-quiet -m 6 -sharp_yuv -metadata none -af)
conv() { # forrás név
  local in="$SRC/$1" name="$2"
  cwebp "${opts[@]}" -q 80 "$in" -o "$OUT/$name.webp"
  cwebp "${opts[@]}" -q 74 -resize 640 0 "$in" -o "$OUT/$name-sm.webp"
  cwebp "${opts[@]}" -q 68 -resize 400 0 "$in" -o "$OUT/$name-xs.webp"
}
conv FB_IMG_1795163658484.jpg french-gems
conv FB_IMG_1795167116615.jpg leopard-rust
conv FB_IMG_1795167133392.jpg ombre-pearls
conv FB_IMG_1795167194786.jpg red-glitter
conv FB_IMG_1795167207843.jpg pink-nude
conv FB_IMG_1795167219663.jpg mocha-crystals
conv FB_IMG_1795167245070.jpg french-flower
conv FB_IMG_1795167260028.jpg chanel-black
conv IMG_20261119_224021.jpg pink-glitter
conv IMG_20261119_224040.jpg burgundy-french
conv IMG_20261119_224132.jpg burgundy-dots
conv ai_gen.jpg christmas-wonder
conv promocio.jpg voucher
cwebp "${opts[@]}" -q 82 -resize 144 0 "$SRC/logo.jpg" -o "$OUT/logo-sm.webp"
rm -f "$OUT/logo.webp"
du -ch "$OUT"/*.webp | tail -1
