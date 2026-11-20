#!/usr/bin/env bash
# Forrásképek -> webp (q90, részletmegtartó). Használat: tools/convert-images.sh
set -euo pipefail
SRC=/sdcard/Documents/nails_by_evelin
OUT="$(cd "$(dirname "$0")/.." && pwd)/frontend/public/images"
rm -f "$OUT"/*.jpg
mkdir -p "$OUT"
conv() { # forrás név
  local in="$SRC/$1" name="$2"
  cwebp -quiet -q 90 -m 6 -sharp_yuv -metadata none "$in" -o "$OUT/$name.webp"
  cwebp -quiet -q 86 -m 6 -sharp_yuv -metadata none -resize 640 0 "$in" -o "$OUT/$name-sm.webp"
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
conv logo.jpg logo
cwebp -quiet -q 92 -m 6 -resize 256 0 "$SRC/logo.jpg" -o "$OUT/logo-sm.webp"
ls -la "$OUT"
