#!/usr/bin/env python3
"""
Esporta il pacchetto foto studio/input/luna-foto negli asset del tema (CLAUDE.md, step 2).

Uso (dalla radice del repository):
    python3 -m venv studio/.venv && studio/.venv/bin/pip install pillow
    studio/.venv/bin/python studio/scripts/luna_export.py

Cosa fa, sempre nello stesso modo:
  1. controlla i ritagli: stessa misura, base + luna sovrapposte a 0,0 = lampada intera;
     copia ritagli/layout.json in studio/qa/luna-layout.json
  2. esporta in assets/ i ritagli (WebP con trasparenza, 600/1000/1377 px), la miniatura
     luna-thumb-160.webp, le scene (WebP) e luna-og.jpg
  3. rispetta i pesi massimi abbassando la qualità a passi di 4, mai sotto 70
  4. genera studio/qa/contact-sheet.png e studio/qa/luna-export.txt con l'elenco dei pesi
Le foto della cartella fornitore/ non vengono mai lette: restano solo come riferimento.
"""
from __future__ import annotations

import json
import shutil
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

STUDIO = Path(__file__).resolve().parent.parent
ROOT = STUDIO.parent
SOURCE = STUDIO / "input" / "luna-foto"
CUTOUTS = SOURCE / "ritagli"
SCENES = SOURCE / "scene"
ASSETS = ROOT / "assets"
QA = STUDIO / "qa"

KB = 1024
MIN_QUALITY = 70
QUALITY_STEP = 4

# Ritagli: nome nel tema → file del pacchetto
LAYERS = {
    "moon-on": "luna-accesa.png",
    "moon-off": "luna-spenta.png",
    "base-on": "base-accesa.png",
    "base-off": "base-spenta.png",
    "lamp-on": "lampada-accesa.png",
    "lamp-off": "lampada-spenta.png",
}
CUTOUT_WIDTHS = (600, 1000, 1377)
CUTOUT_QUALITY = 82

# Scene: nome nel tema → file del pacchetto
SCENE_FILES = {
    "notte": "01-notte.jpg",
    "caldo": "02-caldo.jpg",
    "misure": "03-misure.jpg",
    "orbita": "04-orbita.jpg",
    "eclissi": "05-eclissi.jpg",
    "natale": "06-natale.jpg",
}
SCENE_QUALITY = 88  # alzata da 80: sugli OLED le bande nei fondi scuri si vedono

# Pesi massimi (§ step 2, punto 4)
LIMITS = {
    "luna-moon-on-1000.webp": 120 * KB,
    "luna-base-on-1000.webp": 80 * KB,
}
SCENE_SMALL_LIMIT = 160 * KB
OG_LIMIT = 200 * KB
OG_SIZE = (1200, 630)

DARK = (5, 6, 11, 255)  # --luna-bg
WHITE = (255, 255, 255, 255)

report: list[str] = []
failures: list[str] = []


def fail(message: str) -> None:
    failures.append(message)
    print(f"✗ {message}")


# --------------------------------------------------------------------------- utilità
def target_height(source: Image.Image, width: int) -> int:
    """Stessa formula per tutti i livelli: a parità di larghezza, stessa altezza."""
    return round(source.height * width / source.width)


def resize_rgba(image: Image.Image, width: int) -> Image.Image:
    """Ridimensiona con alfa premoltiplicato: niente aloni scuri sui bordi. Mai ingrandire."""
    if width >= image.width:
        return image.copy()
    size = (width, target_height(image, width))
    return image.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")


def encode_webp(image: Image.Image, quality: int) -> bytes:
    buffer = BytesIO()
    image.save(buffer, "WEBP", quality=quality, method=6, alpha_quality=100, exact=False)
    return buffer.getvalue()


def save_webp(image: Image.Image, name: str, quality: int, limit: int | None = None) -> None:
    """Salva in assets/; se c'è un limite, scende di 4 in 4 fino a 70."""
    data = encode_webp(image, quality)
    while limit and len(data) > limit and quality - QUALITY_STEP >= MIN_QUALITY:
        quality -= QUALITY_STEP
        data = encode_webp(image, quality)
    (ASSETS / name).write_bytes(data)
    status = ""
    if limit:
        status = f"limite {limit // KB} KB ✓" if len(data) <= limit else f"limite {limit // KB} KB ✗"
        if len(data) > limit:
            fail(f"{name}: {len(data) / KB:.1f} KB oltre il limite di {limit // KB} KB anche a qualità {quality}")
    line = f"{name:34s} {image.width:>4} × {image.height:<4} {len(data) / KB:7.1f} KB  q{quality}  {status}"
    report.append(line)
    print("✓ " + line)


def premultiplied_diff(a: Image.Image, b: Image.Image) -> int:
    """Differenza massima sui valori visibili (alfa premoltiplicato)."""
    diff = ImageChops.difference(a.convert("RGBa"), b.convert("RGBa"))
    return max(diff.getchannel(channel).getextrema()[1] for channel in "RGBa")


def clean_old_exports() -> None:
    """Toglie le esportazioni precedenti con gli stessi prefissi (solo .webp e luna-og.jpg)."""
    prefixes = [f"luna-{layer}-" for layer in LAYERS] + ["luna-scene-", "luna-thumb-"]
    for file in ASSETS.glob("luna-*.webp"):
        if any(file.name.startswith(prefix) for prefix in prefixes):
            file.unlink()


# --------------------------------------------------------------------------- 1. controlli
def check_cutouts() -> dict[str, Image.Image]:
    images = {layer: Image.open(CUTOUTS / file).convert("RGBA") for layer, file in LAYERS.items()}
    sizes = {image.size for image in images.values()}
    if len(sizes) != 1:
        fail(f"i ritagli non hanno la stessa misura: {sorted(sizes)}")
    width, height = next(iter(sizes))
    report.append(f"Ritagli: 6 PNG da {width} × {height} px")

    for state in ("on", "off"):
        moon, base, lamp = images[f"moon-{state}"], images[f"base-{state}"], images[f"lamp-{state}"]
        rebuilt = Image.alpha_composite(base, moon)
        difference = premultiplied_diff(rebuilt, lamp)
        touching = ImageChops.multiply(
            moon.getchannel("A").point(lambda value: 255 if value else 0),
            base.getchannel("A").point(lambda value: 255 if value else 0),
        ).histogram()[255]
        verdict = "identica" if difference == 0 else f"diversa (differenza massima {difference})"
        report.append(f"  {state}: base + luna a 0,0 → lampada {verdict}; pixel in cui luna e base si toccano: {touching}")
        if difference > 1:
            fail(f"base + luna ({state}) non ricompongono la lampada: differenza massima {difference}")

    layout = json.loads((CUTOUTS / "layout.json").read_text(encoding="utf-8"))
    if tuple(layout["canvas_px"]) != (width, height):
        fail(f"layout.json dice {layout['canvas_px']}, i PNG sono {width} × {height}")
    QA.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(CUTOUTS / "layout.json", QA / "luna-layout.json")
    report.append("  layout.json copiato in studio/qa/luna-layout.json")
    return images


# --------------------------------------------------------------------------- 2. esportazione
def export_cutouts(images: dict[str, Image.Image]) -> None:
    report.append("")
    report.append("Ritagli (WebP con trasparenza)")
    heights: dict[int, set[int]] = {}
    for layer, image in images.items():
        for width in CUTOUT_WIDTHS:
            if width > image.width:
                continue
            resized = resize_rgba(image, width)
            heights.setdefault(width, set()).add(resized.height)
            name = f"luna-{layer}-{width}.webp"
            save_webp(resized, name, CUTOUT_QUALITY, LIMITS.get(name))
    for width, values in heights.items():
        if len(values) != 1:
            fail(f"a {width} px i livelli hanno altezze diverse: {sorted(values)}")


def export_thumb(images: dict[str, Image.Image]) -> None:
    """Lampada accesa centrata in 160 × 160 px su fondo trasparente (barra sticky)."""
    lamp = images["lamp-on"]
    lamp = lamp.crop(lamp.getchannel("A").getbbox())
    box = 152  # 4 px di respiro per lato
    scale = min(box / lamp.width, box / lamp.height)
    size = (round(lamp.width * scale), round(lamp.height * scale))
    small = lamp.convert("RGBa").resize(size, Image.Resampling.LANCZOS).convert("RGBA")
    canvas = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    canvas.alpha_composite(small, ((160 - size[0]) // 2, (160 - size[1]) // 2))
    report.append("")
    report.append("Miniatura")
    save_webp(canvas, "luna-thumb-160.webp", CUTOUT_QUALITY)


def export_scenes() -> None:
    report.append("")
    report.append("Scene (WebP)")
    for slug, file in SCENE_FILES.items():
        image = Image.open(SCENES / file).convert("RGB")
        if image.width < image.height:
            if image.width * 5 != image.height * 4:
                fail(f"{file}: attesa una verticale 4:5, trovata {image.width} × {image.height}")
            widths = (800, 1600)
        else:
            if image.width != image.height:
                fail(f"{file}: attesa una quadrata, trovata {image.width} × {image.height}")
            widths = (1000, 2000)
        for index, width in enumerate(widths):
            if width > image.width:
                fail(f"{file}: largo {image.width} px, non si ingrandisce a {width}")
                continue
            resized = image if width == image.width else image.resize(
                (width, target_height(image, width)), Image.Resampling.LANCZOS
            )
            limit = SCENE_SMALL_LIMIT if index == 0 else None
            save_webp(resized, f"luna-scene-{slug}-{width}.webp", SCENE_QUALITY, limit)


def export_og() -> None:
    """luna-og.jpg 1200 × 630 sotto i 200 KB: se l'originale va già bene si copia senza ricomprimere."""
    source = SCENES / "og-condivisione.jpg"
    target = ASSETS / "luna-og.jpg"
    image = Image.open(source)
    clean = image.size == OG_SIZE and source.stat().st_size <= OG_LIMIT and "exif" not in image.info
    if clean:
        shutil.copyfile(source, target)
        how = "copiata senza ricomprimere"
    else:
        image = image.convert("RGB")
        if image.size != OG_SIZE:
            ratio = max(OG_SIZE[0] / image.width, OG_SIZE[1] / image.height)
            image = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.Resampling.LANCZOS)
            left, top = (image.width - OG_SIZE[0]) // 2, (image.height - OG_SIZE[1]) // 2
            image = image.crop((left, top, left + OG_SIZE[0], top + OG_SIZE[1]))
        quality = 86
        while True:
            image.save(target, "JPEG", quality=quality, optimize=True, progressive=True)
            if target.stat().st_size <= OG_LIMIT or quality - QUALITY_STEP < MIN_QUALITY:
                break
            quality -= QUALITY_STEP
        how = f"ricompressa a qualità {quality}"
    size = target.stat().st_size
    if size > OG_LIMIT:
        fail(f"luna-og.jpg: {size / KB:.1f} KB oltre i 200 KB")
    report.append("")
    report.append("Condivisioni")
    line = f"{'luna-og.jpg':34s} {OG_SIZE[0]:>4} × {OG_SIZE[1]:<4} {size / KB:7.1f} KB  {how}  limite 200 KB ✓"
    report.append(line)
    print("✓ " + line)


# --------------------------------------------------------------------------- 3. controllo visivo
def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype(str(ASSETS / "luna-inter.woff2"), size)
    except OSError:
        return ImageFont.load_default(size=size)


def on_background(layer: Image.Image, colour: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", layer.size, colour)
    canvas.alpha_composite(layer)
    return canvas


def contact_sheet() -> None:
    """Livelli esportati sovrapposti, accesi e spenti, su #05060B e su bianco, ingrandimenti e scene."""
    load = lambda name: Image.open(ASSETS / name).convert("RGBA")  # noqa: E731
    width = 1800
    margin = 40
    title_font, label_font = font(30), font(20)
    tiles: list[tuple[str, list[tuple[str, Image.Image]]]] = []

    # A. Livelli sovrapposti a 0,0 (export a 1000 px)
    composites = {}
    rows = []
    for state, label in (("on", "accesa"), ("off", "spenta")):
        rebuilt = Image.alpha_composite(load(f"luna-base-{state}-1000.webp"), load(f"luna-moon-{state}-1000.webp"))
        composites[state] = rebuilt
        lamp = load(f"luna-lamp-{state}-1000.webp")
        diff = premultiplied_diff(rebuilt, lamp)
        report.append(f"  export 1000 px, {label}: base + luna contro lampada intera, differenza massima {diff} (compressione)")
    for colour, colour_name in ((DARK, "su #05060B"), (WHITE, "su bianco")):
        for state, label in (("on", "accesa"), ("off", "spenta")):
            rows.append((f"Base + luna {label}, {colour_name}", on_background(composites[state], colour)))
    tiles.append(("Livelli sovrapposti a 0,0 · export 1000 px", rows))

    # B. Ingrandimenti al 100% (export 1377 px): bordo della luna, stacco luna-base, angolo della base
    crops = {"bordo della luna": (1042, 442, 1342, 742), "stacco luna-base": (407, 1090, 807, 1290), "angolo della base": (0, 1180, 300, 1480)}
    zooms = []
    for colour, colour_name in ((DARK, "scuro"), (WHITE, "bianco")):
        full = on_background(Image.alpha_composite(load("luna-base-on-1377.webp"), load("luna-moon-on-1377.webp")), colour)
        for crop_name, box in crops.items():
            zooms.append((f"{crop_name}, {colour_name}", full.crop(box)))
    tiles.append(("Ingrandimenti al 100% · export 1377 px, accesa", zooms))

    # C. Scene e condivisione in miniatura
    scenes = [(slug, load(f"luna-scene-{slug}-{800 if slug in ('caldo', 'orbita', 'eclissi', 'natale') else 1000}.webp")) for slug in SCENE_FILES]
    scenes.append(("luna-og.jpg", Image.open(ASSETS / "luna-og.jpg").convert("RGBA")))
    tiles.append(("Scene · export 800 / 1000 px, qualità 88", scenes))

    # Impaginazione a righe, ogni immagine scalata a un'altezza comune per riga
    blocks = []
    for heading, items in tiles:
        row_height = 300 if heading.startswith("Scene") else (300 if heading.startswith("Ingrandimenti") else 420)
        placed, x, y = [], margin, 0
        for label, image in items:
            scale = row_height / image.height
            thumb = image.resize((max(1, round(image.width * scale)), row_height), Image.Resampling.LANCZOS)
            if x + thumb.width > width - margin:
                x, y = margin, y + row_height + 44
            placed.append((label, thumb, x, y))
            x += thumb.width + 16
        blocks.append((heading, placed, y + row_height + 44))

    height = 90 + sum(60 + block_height for _, _, block_height in blocks) + margin
    sheet = Image.new("RGBA", (width, height), (32, 33, 39, 255))
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, 30), "Lampada Lunare Levitante · contact sheet dello step 2", font=title_font, fill=(242, 239, 232))
    top = 90
    for heading, placed, block_height in blocks:
        draw.text((margin, top + 14), heading, font=label_font, fill=(255, 217, 163))
        top += 60
        for label, thumb, x, y in placed:
            sheet.alpha_composite(thumb, (x, top + y))
            draw.text((x, top + y + thumb.height + 8), label, font=label_font, fill=(165, 162, 180))
        top += block_height
    sheet.convert("RGB").save(QA / "contact-sheet.png", optimize=True)
    print(f"✓ studio/qa/contact-sheet.png ({(QA / 'contact-sheet.png').stat().st_size / KB:.0f} KB)")


# --------------------------------------------------------------------------- avvio
def main() -> int:
    if not CUTOUTS.is_dir() or not SCENES.is_dir():
        print(f"✗ manca il pacchetto {SOURCE.relative_to(ROOT)}: scompatta luna-foto.zip in studio/input")
        return 1
    ASSETS.mkdir(exist_ok=True)
    clean_old_exports()
    images = check_cutouts()
    export_cutouts(images)
    export_thumb(images)
    export_scenes()
    export_og()
    report.append("")
    report.append("Controllo dei livelli esportati")
    contact_sheet()

    total = sum(file.stat().st_size for file in ASSETS.glob("luna-*") if file.suffix in (".webp", ".jpg"))
    report.append("")
    report.append(f"Totale immagini luna in assets/: {total / KB:.0f} KB (scaricate solo quelle che la pagina usa)")
    (QA / "luna-export.txt").write_text(
        "Esportazione immagini · studio/scripts/luna_export.py\n\n" + "\n".join(report) + "\n", encoding="utf-8"
    )
    print("✓ studio/qa/luna-export.txt")
    if failures:
        print(f"\n{len(failures)} problemi:")
        for message in failures:
            print(f"  – {message}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
