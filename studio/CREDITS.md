# Crediti

Materiali di terze parti usati dalla landing. Questa cartella (`studio/`) non va su Shopify: i file finiti stanno negli asset del tema.

## Texture della Luna (sezione 3D)

- **Fonte:** Solar System Scope — https://www.solarsystemscope.com/textures/
- **Licenza:** Creative Commons Attribution 4.0 International (CC BY 4.0) — https://creativecommons.org/licenses/by/4.0/
- **File originali:** `studio/textures/moon-color-2k.jpg` (mappa colore equirettangolare, 2048 × 1024) e `studio/textures/moon-bump-1k.jpg` (rilievo, 1024 × 512, ricavato dalla mappa colore).
- **Modifiche:** desaturazione del 70%, tono leggermente più caldo, sfocatura di 0,4 px sulla 2k, ridimensionamento e ricompressione JPEG (`studio/scripts/luna_textures.py`).
- **Nel tema:** `assets/luna-moon-color-2k.jpg`, `assets/luna-moon-color-1k.jpg`, `assets/luna-moon-bump-1k.jpg`.
- **Attribuzione in pagina (obbligatoria):** nella didascalia della sezione 3D, «Texture della Luna: Solar System Scope, CC BY 4.0».

## Three.js

- **Fonte:** https://threejs.org — pacchetto npm `three` 0.186.1
- **Licenza:** MIT (testo in fondo a `assets/luna-three.module.min.js`)

## Font

- **Fraunces** (titoli) e **Inter** (testi), da `@fontsource-variable` — SIL Open Font License 1.1. Testi completi in `studio/licenses/fraunces-OFL.txt` e `studio/licenses/inter-OFL.txt`.

## Tema di partenza

- **Horizon** 4.3.0 di Shopify — licenza in `studio/licenses/horizon-LICENSE.md`.
