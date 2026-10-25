#!/usr/bin/env python3
"""
Texture della luna 3D (CLAUDE.md, step 4), da studio/textures (Solar System Scope, CC BY 4.0).

Uso (dalla radice del repository):
    studio/.venv/bin/python studio/scripts/luna_textures.py

  assets/luna-moon-color-2k.jpg  2048 × 1024, sotto 350 KB
  assets/luna-moon-color-1k.jpg  1024 × 512,  sotto 150 KB
  assets/luna-moon-bump-1k.jpg   1024 × 512,  sotto 150 KB
La mappa colore è desaturata del 70% e scaldata leggermente, così somiglia a una luna stampata in 3D.
La 2k riceve una sfocatura di 0,4 px che toglie il rumore del JPEG d'origine (sta così sotto i 350 KB).
I metadati (EXIF) delle sorgenti non vengono copiati.
"""
from __future__ import annotations

import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

STUDIO = Path(__file__).resolve().parent.parent
SOURCES = STUDIO / "textures"
ASSETS = STUDIO.parent / "assets"
KB = 1024

DESATURATION = 0.70  # 70% di saturazione in meno
WARMTH = (1.045, 1.0, 0.91)  # moltiplicatori R, G, B: un tono appena caldo, come il PLA
# Solo per la 2k: toglie il rumore del JPEG d'origine, così sta sotto i 350 KB con l'errore più basso
DENOISE_2K = 0.4


def encode_jpeg(image: Image.Image, quality: int) -> bytes:
    buffer = BytesIO()
    image.save(buffer, "JPEG", quality=quality, optimize=True, progressive=True, subsampling="4:2:0")
    return buffer.getvalue()


def save_under(image: Image.Image, name: str, limit_kb: int, start: int = 88) -> str:
    """Salva con la qualità più alta che resta sotto il limite (passi di 2, mai sotto 70)."""
    quality = start
    data = encode_jpeg(image, quality)
    while len(data) > limit_kb * KB and quality > 70:
        quality -= 2
        data = encode_jpeg(image, quality)
    (ASSETS / name).write_bytes(data)
    ok = len(data) <= limit_kb * KB
    line = f"{name:28s} {image.width:>4} × {image.height:<4} {len(data) / KB:6.1f} KB  q{quality}  limite {limit_kb} KB {'✓' if ok else '✗'}"
    print(("✓ " if ok else "✗ ") + line)
    return line if ok else ""


def warm(image: Image.Image) -> Image.Image:
    channels = [band.point(lambda value, factor=factor: min(255, round(value * factor))) for band, factor in zip(image.split(), WARMTH)]
    return Image.merge("RGB", channels)


def main() -> int:
    colour_source = SOURCES / "moon-color-2k.jpg"
    bump_source = SOURCES / "moon-bump-1k.jpg"
    missing = [path.name for path in (colour_source, bump_source) if not path.exists()]
    if missing:
        print(f"✗ mancano in studio/textures: {', '.join(missing)}")
        return 1

    colour = Image.open(colour_source).convert("RGB")
    if colour.size != (2048, 1024):
        colour = colour.resize((2048, 1024), Image.Resampling.LANCZOS)
    colour = warm(ImageEnhance.Color(colour).enhance(1 - DESATURATION))

    bump = Image.open(bump_source).convert("L")
    if bump.size != (1024, 512):
        bump = bump.resize((1024, 512), Image.Resampling.LANCZOS)

    results = [
        save_under(colour.filter(ImageFilter.GaussianBlur(DENOISE_2K)), "luna-moon-color-2k.jpg", 350),
        save_under(colour.resize((1024, 512), Image.Resampling.LANCZOS), "luna-moon-color-1k.jpg", 150),
        save_under(bump, "luna-moon-bump-1k.jpg", 150),
    ]
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
