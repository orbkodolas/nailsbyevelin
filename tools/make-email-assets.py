#!/usr/bin/env python3
"""Levélhez szánt képek (e-mail kliensek nem mind tudnak webp-t): frontend/public/email/*.png|jpg
Futtatás a projekt gyökeréből: python3 tools/make-email-assets.py"""
from PIL import Image, ImageDraw
import os
pub = 'frontend/public'; out = f'{pub}/email'; os.makedirs(out, exist_ok=True)

# Elsődleges logó: kör alakú, átlátszó háttérrel (2x a 96 px-es megjelenítéshez)
logo = Image.open(f'{pub}/icon-512.png').convert('RGBA').crop((42, 42, 470, 470)).resize((192, 192), Image.LANCZOS)
mask = Image.new('L', (768, 768), 0); ImageDraw.Draw(mask).ellipse((2, 2, 765, 765), fill=255)
logo.putalpha(mask.resize((192, 192), Image.LANCZOS)); logo.save(f'{out}/logo.png', optimize=True)

# Borító: 2x a 600 px-es megjelenítéshez, 600x300 arányra vágva
cover = Image.open(f'{pub}/og-image.jpg').convert('RGB')
w, h = cover.size; ch = int(w / 2); top = int((h - ch) * 0.35)
cover.crop((0, top, w, top + ch)).resize((1200, 600), Image.LANCZOS).save(f'{out}/cover.jpg', quality=82, optimize=True)

# Referenciaképek: négyzetre vágva, 2x a ~176 px-es megjelenítéshez
for name in ('pink-nude', 'ombre-pearls', 'mocha-crystals'):
    im = Image.open(f'{pub}/images/{name}-sm.webp').convert('RGB'); w, h = im.size; s = min(w, h)
    im.crop(((w - s) // 2, int((h - s) * 0.3), (w - s) // 2 + s, int((h - s) * 0.3) + s)).resize((352, 352), Image.LANCZOS).save(f'{out}/{name}.jpg', quality=80, optimize=True)
