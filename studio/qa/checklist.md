# Checklist dei controlli automatici

Generata da `npm --prefix studio run check` (studio/preview/check.mjs) il 24/10/2026, 17:26:00, sull'anteprima simulata (§13): LiquidJS, dati finti, Chromium di Playwright.

**Tutti i 64 controlli superati.**

## Pagine: console, scroll orizzontale, font e budget (360, 390, 768, 1280, 1440 px)

- ✅ **index.html a 360 px** — console pulita, niente scroll orizzontale, font caricati (anche il corsivo), primo caricamento 589 KB su 900
- ✅ **index.html a 390 px** — console pulita, niente scroll orizzontale, font caricati (anche il corsivo), primo caricamento 589 KB su 900
- ✅ **index.html a 768 px** — console pulita, niente scroll orizzontale, font caricati (anche il corsivo), primo caricamento 589 KB su 900
- ✅ **index.html a 1280 px** — console pulita, niente scroll orizzontale, font caricati (anche il corsivo), primo caricamento 589 KB su 900
- ✅ **index.html a 1440 px** — console pulita, niente scroll orizzontale, font caricati (anche il corsivo), primo caricamento 589 KB su 900
- ✅ **styleguide.html a 360 px** — console pulita, niente scroll orizzontale, font caricati (anche il corsivo), primo caricamento 263 KB su 900
- ✅ **styleguide.html a 390 px** — console pulita, niente scroll orizzontale, font caricati (anche il corsivo), primo caricamento 263 KB su 900
- ✅ **styleguide.html a 768 px** — console pulita, niente scroll orizzontale, font caricati (anche il corsivo), primo caricamento 263 KB su 900
- ✅ **styleguide.html a 1280 px** — console pulita, niente scroll orizzontale, font caricati (anche il corsivo), primo caricamento 263 KB su 900
- ✅ **styleguide.html a 1440 px** — console pulita, niente scroll orizzontale, font caricati (anche il corsivo), primo caricamento 263 KB su 900

## Hero, acquisto e barra sticky (step 3)

- ✅ **tocco sulla luna** — aria-checked true→false→true (Spazio), --luna-power 1→0→1, suggerimento nascosto: true
- ✅ **titolo con ?h=regalo** — «Il regalo che fa dire wow appena si accende.»
- ✅ **titolo con ?h=relax** — «Spegni lo schermo. Accendi la Luna.»
- ✅ **titolo con ?h=magia** — «La Luna. Sospesa nella tua stanza.»
- ✅ **titolo con ?h=qualsiasi** — «La Luna. Sospesa nella tua stanza.»
- ✅ **titolo con ?h=__proto__** — «La Luna. Sospesa nella tua stanza.»
- ✅ **barra sticky a 390×844** — al caricamento nascosta (CTA sullo schermo), in fondo nascosta (CTA superata, CTA finale sullo schermo), di nuovo in cima nascosta
- ✅ **barra sticky a 390×560** — al caricamento visibile (CTA sotto la piega), in fondo nascosta (CTA superata, CTA finale sullo schermo), di nuovo in cima visibile
- ✅ **movimento ridotto** — aria-checked true, --luna-power 1, levitazione none, riflesso none
- ✅ **form #luna-buy-form** — 1 form, id=46000000000001, quantity=1, return_to=/checkout, pagamento rapido: true
- ✅ **ogni CTA punta a #luna-buy-form** — 4/4 CTA
- ✅ **un solo H1 e un solo JSON-LD** — 1 H1, 1 JSON-LD
- ✅ **lampada della hero ≤ 140 KB, l'altro stato dopo il paint** — stato iniziale: 2 immagini, 35.0 KB; primo paint a 124 ms, stato acceso richiesto a 141 ms
- ✅ **nessun prezzo scritto a mano** — 25 file luna controllati

## Luna 3D (step 4)

- ✅ **Three.js non scaricato prima di avvicinarsi** — palco a 585 px sotto lo schermo: 0 richieste 3D al caricamento, 0 a 700 px, a 300 px: luna-moon3d.js, luna-three.module.min.js, luna-moon-color-1k.jpg, luna-moon-bump-1k.jpg
- ✅ **avvicinandosi compare un canvas WebGL disegnato** — is-3d, renderer webgl2, canvas 350×350, immagine di ripiego a opacità 0, pixel chiari 28.2%, istruzioni: «Trascina…» + «Con il pulsante…», pulsante visibile
- ✅ **swipe sul canvas: la pagina scorre** — dito sul canvas: true, touch-action pan-y, scrollY 1182→1467
- ✅ **con ?luna3d=0 resta l'immagine** — immagine caricata: true, 294×315, opacità 1, richieste 3D: 0; interruttore spento: brightness(1) saturate(1) → brightness(0.42) saturate(0.25); istruzioni: «Con il pulsante…», pulsante visibile
- ✅ **senza JavaScript: foto accesa, istruzioni nascoste** — istruzioni: nascoste, pulsante nascosto, foto brightness(1) saturate(1), richieste 3D: 0
- ✅ **tonalità della hero → luna 3D (e ritorno)** — hero #cfe0ff → 3D #cfe0ff (--luna-light #cfe0ff, chip #cfe0ff); 3D #ffd9a3 → hero #ffd9a3
- ✅ **trascinamento: la luna ruota (movimento ridotto)** — rotazione -0.60 → 0.66 rad, suggerimento nascosto: false → true
- ✅ **desktop: la 3D parte dopo la hero** — palco a 230 px dallo schermo; 4 immagini della lampada arrivate a 62 ms, lampada accesa a 658 ms; luna-moon3d.js a 248 ms, Three.js a 253 ms, texture a 284 ms
- ✅ **desktop: peso del primo caricamento con la 3D** — 1653 KB come li serve l'anteprima (senza compressione), circa 1089 KB compressi con gzip come dal CDN di Shopify; di cui 3D 1065 KB / 634 KB (luna-moon3d.js, luna-three.module.min.js, luna-moon-color-2k.jpg, luna-moon-bump-1k.jpg)
- ✅ **editor: unload smonta, load rimonta** — montata → unload «—» → load «is-3d webgl2»

## Sezioni che convincono (step 5)

- ✅ **confronto a 360 px senza scroll orizzontale** — pagina 360 px, confronto 320/320, tabella 320/320, 5 schede (grid), elementi fuori dallo schermo: 0
- ✅ **§10 · recensioni senza blocchi: la sezione non stampa nulla** — fuori dall'editor: 0 caratteri di markup, altezza 0 px
- ✅ **§10 · recensioni nell'editor: riquadro per il blocco dell'app** — «Aggiungi qui il blocco della tua app recensioni.», altezza 200 px
- ✅ **riga di Natale prima e dopo la scadenza** — scadenza 2026-12-03 · oggi: visibile («Ordina entro il 3 dicembre per riceverla prima di Natale.») · ultimo giorno alle 23:30: visibile («Ordina entro il 3 dicembre per riceverla prima di Natale.») · giorno dopo alle 00:30: nascosta
- ✅ **come funziona: la lampada si monta mentre scorri** — view(): appena entra +28.3 px e spenta, in alto 0 px e accesa (1) · ripiego: «is-animated» +28.3 px spenta → «is-animated is-assembled» 0 px, accesa, levitazione luna-how-float · movimento ridotto: 0 px, accesa (1), levitazione none
- ✅ **benefici: tre colonne della stessa altezza a 1440 px** — 381×742, 381×742, 381×742
- ✅ **passaggi morbidi tra le sezioni (390 px)** — salto massimo di luminosità dello sfondo 2.7/255 su 2 px (a 31 px), su 11402 px di pagina

## Offerta, FAQ e chiusura (step 6)

- ✅ **offerta: percentuale, risparmio e prezzo a sera dai prezzi finti** — «Offerta di lancio −10%» (atteso −10%), «La tua Luna a €59,90.», barrato €66,56, «Risparmi €6,66» (atteso €6,66), «Prezzo più basso degli ultimi 30 giorni: €66,56», «Meno di 17 centesimi a sera per tutto il primo anno.» (atteso 17)
- ✅ **offerta con il barrato vuoto (override): niente badge, risparmio né Omnibus** — badge «», barrato «», risparmio «», Omnibus «»; restano «La tua Luna a €59,90.» e «Meno di 17 centesimi a sera per tutto il primo anno.»
- ✅ **§10 · countdown solo con una fine reale: spento, data passata, data futura** — spento (template): assente · data passata: nascosto · data futura: visibile (26731:07:33:50) · alla scadenza: prima visibile (00:00:00:02), poi sparito, un minuto dopo ancora nascosto · senza JavaScript: nascosto
- ✅ **§10 · reso di 14 giorni: niente garanzia né «notti di prova»** — 30 giorni: garanzia sì (link /policies/refund-policy), «notti di prova» ×2 · 14 giorni: garanzia no, «notti di prova» ×0, chiusura «Spedizione gratuita e un regalo che nessuno dimentica.»
- ✅ **FAQ: una alla volta, tastiera, senza JavaScript** — 8 domande; aperte all'inizio 00000000, dopo un clic 10000000, dopo un altro 00001000, Invio sulla stessa 00000000; senza JavaScript 00100000
- ✅ **tre CTA in pagina più la barra sticky** — hero, offer, final + 1 sticky, tutte type=submit form=luna-buy-form
- ✅ **barra sticky nascosta davanti alle CTA di offerta e chiusura** — specifiche visibile, CTA dell'offerta nascosta, FAQ visibile, CTA finale nascosta

## Consegna stimata (step 7)

- ✅ **consegna stimata · ordine di venerdì prima dell'ora limite** — ven 6 nov alle 10:00, spedizione ven 6 nov: «Ordina oggi, la ricevi tra mar 17 nov e gio 26 nov» (attese mar 17 nov e gio 26 nov; 7–14 giorni lavorativi, ora limite 14:00)
- ✅ **consegna stimata · ordine di venerdì dopo l'ora limite** — ven 6 nov alle 15:30, spedizione lun 9 nov: «Ordina oggi, la ricevi tra mer 18 nov e ven 27 nov» (attese mer 18 nov e ven 27 nov; 7–14 giorni lavorativi, ora limite 14:00)
- ✅ **consegna stimata · ordine di sabato** — sab 7 nov alle 10:00, spedizione lun 9 nov: «Ordina oggi, la ricevi tra mer 18 nov e ven 27 nov» (attese mer 18 nov e ven 27 nov; 7–14 giorni lavorativi, ora limite 14:00)
- ✅ **consegna stimata · ordine di mercoledì dopo l'ora limite** — mer 4 nov alle 15:30, spedizione gio 5 nov: «Ordina oggi, la ricevi tra lun 16 nov e mer 25 nov» (attese lun 16 nov e mer 25 nov; 7–14 giorni lavorativi, ora limite 14:00)
- ✅ **consegna stimata · ordine il giorno prima dell'Immacolata, dopo l'ora limite** — lun 7 dic alle 15:00, spedizione mer 9 dic: «Ordina oggi, la ricevi tra ven 18 dic e mer 30 dic» (attese ven 18 dic e mer 30 dic; 7–14 giorni lavorativi, ora limite 14:00)

## Regole legali, una per una (§10)

- ✅ **§10 · prezzo barrato sempre con la riga Omnibus** — hero: barrato €66,56, Omnibus €66,56 · offer: barrato €66,56, Omnibus €66,56 · sticky: barrato €66,56, Omnibus €66,56; senza barrato: 0 parti dello sconto visibili
- ✅ **§10 · niente recensioni, voti o numeri di clienti scritti a mano** — 9 pagine lette: nessuna stella, voto, numero di clienti o testimonianza
- ✅ **§10 · scorte solo dal magazzino Shopify** — magazzino senza conteggio: nessuna riga · 3 pezzi nel magazzino Shopify: «Solo 3 pezzi disponibili»
- ✅ **§10 · niente promesse sulla salute né «NASA», «certificato», «brevettato»** — 9 pagine lette, testi visibili e attributi alt, aria-label e title
- ✅ **§10 · materiali come nella scheda: mai «legno» da solo** — «legno» compare 3 volte, sempre come «effetto legno»; «PLA stampato in 3D» e «ABS effetto legno chiaro» presenti
- ✅ **§10 · scene nostre, mai le foto originali del fornitore** — 4 foto del fornitore confrontate con gli asset del tema: nessuna copia; 26 immagini in pagina, tutte esportate da noi (luna-*)
- ✅ **§10 · misura reale Ø 8,5 cm accanto alle immagini grandi** — occhiello della hero: sì, specifiche: sì; sezioni con immagini grandi della lampada: hero ✓, moon3d ✓, benefits ✓, how ✓, gift ✓, specs ✓, final ✓
- ✅ **§10 · footer con dati legali dai setting e policy da shop.policies** — policy: /policies/refund-policy ✓, /policies/privacy-policy ✓; setting vuoti: nessuna riga; setting compilati: «Esempio Srl (prova)P.IVA 00000000000Via di Prova 1, 00100 Roma (RM)»
- ✅ **§10 · banner dei cookie: content_for_header nel <head> così com'è** — 1 uso, senza filtri, if o capture, dopo il CSS; il banner si vede solo sul negozio (step 7, sul telefono)

## Pesi reali di immagini e JavaScript (§9)

- ✅ **pesi reali · immagini del primo caricamento (390 px, prima di scorrere)** — 9 immagini, 286.0 KB: luna-scene-orbita-800.webp 56.8 KB, luna-lamp-on-600.webp 52.1 KB, luna-scene-eclissi-800.webp 48.5 KB, luna-scene-caldo-800.webp 36.4 KB, luna-moon-on-600.webp 35.5 KB, luna-moon-off-600.webp 24.5 KB, luna-base-on-600.webp 15.7 KB, luna-base-off-600.webp 10.5 KB, luna-thumb-160.webp 6.1 KB
- ✅ **pesi reali · JavaScript, senza librerie esterne né CDN** — primo caricamento: luna-landing.js 49.8 KB (14.1 KB gzip); 0 import statici; solo vicino alla 3D: luna-moon3d.js 16.9 KB (5.5 KB gzip), luna-three.module.min.js 561.9 KB (142.6 KB gzip); script o fogli esterni: nessuno

## Da verificare sul negozio (non si provano nell'anteprima)

- ⏳ Checkout con 1 pezzo al prezzo giusto da ogni CTA (hero, offerta, chiusura, barra sticky).
- ⏳ Pagamenti rapidi visibili accanto alla CTA della hero e coerenti con lo stile della pagina.
- ⏳ Banner dei cookie presente con il layout luna-landing.
- ⏳ Eventi del pixel Meta (PageView, ViewContent, AddToCart / InitiateCheckout) senza bloccare l'invio del form.
- ⏳ Lighthouse mobile sul negozio vero, con gli script di Shopify.
