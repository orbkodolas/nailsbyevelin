#!/usr/bin/env bash
# Admin app ikonjai a weboldal kerek logójából (ImageMagick).
#   expo-app/assets/icon.png                  1024 px, sötét háttér + kerek logó
#   expo-app/assets/android-icon-foreground.png 512 px, átlátszó, a logó a biztonsági zónában
#   expo-app/assets/android-icon-background.png 512 px, sötét háttér
# Használat: tools/make-icon.sh [forráskép]   (alap: frontend/public/images/logo-sm.webp; nagyobb forrás élesebb ikont ad)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/frontend/public/images/logo-sm.webp}"
OUT="$ROOT/expo-app/assets"
BG='#0c0809'
TMP="$(mktemp -d "${TMPDIR:-$ROOT}/icon.XXXX")"; trap 'rm -rf "$TMP"' EXIT

# Kerek kivágás (a logó sarkai világosak), élsimított maszkkal
round() { # méret kimenet
  local n=$1 r; r=$(( $1 * 485 / 1000 ))
  magick "$SRC" -filter Lanczos -resize "${n}x${n}!" -unsharp 0x0.8+0.6+0.02 "$TMP/r.png"
  magick -size "${n}x${n}" xc:none -fill white -draw "circle $((n/2)),$((n/2)) $((n/2)),$((n/2 - r))" "$TMP/m.png"
  magick "$TMP/r.png" "$TMP/m.png" -alpha off -compose CopyOpacity -composite "$2"
}

# Hagyományos ikon: a logó a vászon 84%-a
round 860 "$TMP/l1.png"
magick -size 1024x1024 "xc:$BG" "$TMP/l1.png" -gravity center -composite "$OUT/icon.png"

# Adaptív ikon: 108 dp vászon, a kör maszk 72 dp -> a logó ~66%, hogy a rózsaarany keret épp a szélén látsszon
round 340 "$TMP/l2.png"
magick -size 512x512 xc:none "$TMP/l2.png" -gravity center -composite "$OUT/android-icon-foreground.png"
magick -size 512x512 "xc:$BG" "$OUT/android-icon-background.png"
echo "Kész: $OUT/{icon,android-icon-foreground,android-icon-background}.png"
