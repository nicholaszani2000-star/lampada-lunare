#!/usr/bin/env python3
"""
Restringe gli assi variabili dei font del tema a quelli che la pagina usa (CLAUDE.md §5 e §9, step 7).

Uso (lo lancia anche `npm --prefix studio run fonts`, dopo fonts.mjs):
    studio/.venv/bin/python studio/scripts/luna_font_axes.py

Parte sempre dai file originali di @fontsource-variable (sottoinsieme latin), così si può rilanciare:
  luna-fraunces.woff2         wght 300–500 (§5); opsz resta intero (9–144): ai testi piccoli in Fraunces
                              (logo, titoletti, numeri) serve la dimensione ottica giusta, fissarla li stringe troppo
  luna-fraunces-italic.woff2  wght 300–500, opsz fissato a 144: il corsivo serve solo agli <em> di H1 e H2,
                              che usano già opsz 144
  luna-inter.woff2            wght 400–700: i testi usano da 400 a 640
I glifi non cambiano. La licenza OFL lo consente e non ha Reserved Font Name: il nome resta lo stesso.
Gli intervalli di font-weight nei @font-face di layout/luna-landing.liquid devono restare uguali a questi.
"""
from __future__ import annotations

import sys
from io import BytesIO
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

STUDIO = Path(__file__).resolve().parent.parent
SOURCES = STUDIO / "node_modules" / "@fontsource-variable"
ASSETS = STUDIO.parent / "assets"
KB = 1024

FONTS = [
    ("fraunces/files/fraunces-latin-opsz-normal.woff2", "luna-fraunces.woff2", {"wght": (300, 500)}),
    ("fraunces/files/fraunces-latin-opsz-italic.woff2", "luna-fraunces-italic.woff2", {"wght": (300, 500), "opsz": 144}),
    ("inter/files/inter-latin-wght-normal.woff2", "luna-inter.woff2", {"wght": (400, 700)}),
]


def main() -> int:
    for source, target, limits in FONTS:
        path = SOURCES / source
        if not path.exists():
            print(f"✗ manca {path.relative_to(STUDIO)}: lancia prima npm --prefix studio install")
            return 1
        font = instancer.instantiateVariableFont(TTFont(path), limits, updateFontNames=False)
        font.flavor = "woff2"
        buffer = BytesIO()
        font.save(buffer)
        (ASSETS / target).write_bytes(buffer.getvalue())
        axes = ", ".join(
            f"{tag} {value}" if not isinstance(value, tuple) else f"{tag} {value[0]}–{value[1]}" for tag, value in limits.items()
        )
        print(f"✓ assets/{target:28s} {path.stat().st_size / KB:6.1f} → {len(buffer.getvalue()) / KB:5.1f} KB  ({axes})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
