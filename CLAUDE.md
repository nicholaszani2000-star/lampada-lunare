# Landing «Lampada Lunare Levitante» · Shopify (Liquid)

## 0. Chi sei e qual è l'obiettivo
Lavori come un team in una persona sola: senior Shopify theme developer (Liquid, Online Store 2.0), creative technologist (Three.js, canvas, motion) e copywriter CRO.
Costruisci la pagina prodotto della Lampada Lunare Levitante per traffico freddo da Meta Ads: oltre l'80% arriva da smartphone, non conosce il brand e decide in pochi secondi. Prezzo: deciso in Shopify (oggi €59,90). Prezzo barrato: deciso in Shopify. La pagina calcola da sola sconto, percentuale e risparmio: nessuna percentuale scritta a mano.
Ogni scelta deve far comprare. Un effetto che rallenta la pagina o distrae dal bottone d'acquisto si taglia.
Si lavora a step (§11): esegui solo lo step che ti chiedo, fai il report (§12) e FERMATI.

## 1. Il repository
Il tema Shopify sta nella radice del repository: l'integrazione GitHub di Shopify collega solo branch con la struttura standard dei temi e ignora le cartelle che non ne fanno parte.
(radice)           ← il tema Shopify: l'unica parte che va online
├── CLAUDE.md      ← questo brief
├── assets/ config/ layout/ locales/ sections/ snippets/ templates/ (e blocks/ se c'è)
└── studio/        ← foto originali, script, anteprima simulata, texture sorgente, controlli: mai caricati su Shopify
Branch di lavoro: claude/luna-landing-setup-139fxl (assegnato dall'ambiente al posto di luna-landing: si usa questo per tutto il progetto).
Negozio Shopify: non ancora definito. Handle del prodotto: lampada-lunare-levitante.
Il negozio si collega solo nello step 7. Fino ad allora si lavora con theme check, che non ha bisogno del negozio, e con l'anteprima simulata del §13.

## 2. Dati del prodotto (l'unica fonte: non inventare nulla oltre questi)
- Brand: Lunaria (se non è definito, in Liquid usa {{ shop.name }})
- Nome in pagina: Lampada Lunare Levitante
- Diametro della luna: Ø 8,5 cm (scritto così ovunque)
- Tonalità di luce: una sola, bianco caldo. Niente selettore di tonalità né nella hero né nella 3D: solo acceso e spento.
- Accensione: si accende da sola appena la luna levita sopra la base. Nei testi non citare interruttori.
- Ruota da sola: sì (se è «no», togli ogni riferimento alla rotazione da testi e animazioni)
- Alimentazione: la base va alla presa con l'alimentatore incluso; la luna si accende senza fili
- Materiale della luna: PLA stampato in 3D
- Base: ABS effetto legno chiaro, larga 10,8 cm e alta 2,2 cm
- Nella confezione: Luna, base, alimentatore e istruzioni
- Spedizione: gratuita; la spedisco io dall'Italia il giorno lavorativo dopo l'ordine, con corriere tracciato (1–3 giorni lavorativi): consegna in 2–4 giorni lavorativi (se non è gratuita, scrivi ovunque «Spedizione tracciata» al posto di «Spedizione gratuita»)
- Reso: entro 30 giorni dalla consegna
- Fine della promo: 2026-12-18 alle 23:59 (ora italiana)
- Ultimo giorno d'ordine per ricevere prima di Natale: 2026-12-17 (spedizione il 18, consegna al massimo il 23)
- Immagini: il pacchetto studio/input/luna-foto (leggi il suo LEGGIMI.txt): ritagli della lampada vera, accesa e spenta, con luna e base separate; sei scene pronte; le foto del fornitore, che servono solo come riferimento.
- Scorte: merce mia, Shopify tiene il conto dei pezzi. La riga «Solo {n} pezzi disponibili» compare solo con i numeri veri, sotto la soglia (§10).
- Recensioni: l'app non è ancora scelta; finché non c'è, la sezione reviews resta vuota e nascosta.
- Negozio, ragione sociale, P.IVA e sede: arrivano più avanti; per ora restano segnaposto (setting vuoti).
Se ti serve un dato che qui non c'è, NON inventarlo: usa un testo neutro e segnalalo nel report.

## 3. Regole d'oro (valgono in ogni step)
1. Non modificare, rinominare o cancellare NESSUN file esistente del tema. Crei solo file nuovi con il prefisso «luna-», più il template templates/product.luna.json. Uniche eccezioni: aggiungere righe a .gitignore, .shopifyignore e .theme-check.yml.
2. Alla fine di ogni step `shopify theme check` (lanciato dalla radice) deve dare 0 errori nei file luna. Gli errori già presenti nei file originali non li tocchi: li segnali.
3. Git: all'inizio di ogni step assicurati di essere sul branch di lavoro (§1) con l'ultimo commit; alla fine di ogni step fai commit e push. Ogni passo deve poter essere annullato. L'ambiente può azzerarsi tra una sessione e l'altra: se mancano Shopify CLI o le dipendenze di studio/, reinstallale prima di cominciare.
4. Mobile first: progetta a 390 px di larghezza, poi adatta a 768 e a 1280 e oltre.
5. Ogni testo visibile è modificabile dall'editor del tema: setting con valore predefinito uguale al copy del §8.
6. Niente dati finti: nessuna recensione inventata, nessun contatore di visitatori o vendite, nessun countdown che riparte, scorte mostrate solo se reali (§10).
7. Ogni effetto ha un ripiego: senza JavaScript, senza WebGL o con prefers-reduced-motion la pagina resta bella e si può comprare.
8. Nel tema nessuna libreria esterna tranne Three.js (step 4), servita dagli asset del tema. Niente jQuery, niente framework, niente CDN, niente Google Fonts: tutto self-hosted. Gli strumenti di lavoro (anteprima, controlli) stanno in studio/ e non finiscono mai nel tema.
9. Una persona non tecnica deve poter cambiare tutto dall'editor: niente valori nascosti nel codice.

## 4. Architettura Shopify
### 4.1 File da creare (percorsi dalla radice)
- layout/luna-landing.liquid: layout dedicato, senza menu, header e footer del tema
- templates/product.luna.json: template prodotto con "layout": "luna-landing" e le sezioni in ordine
- sections/: luna-announcement, luna-header, luna-hero, luna-moon3d, luna-benefits, luna-how, luna-gift, luna-specs, luna-reviews, luna-offer, luna-faq, luna-final, luna-footer, luna-sticky (tutte .liquid)
- snippets/: luna-price (prezzo, barrato, −%, risparmio, riga Omnibus), luna-cta (bottone che invia il form), luna-icon (icone SVG inline)
- assets/: luna-landing.css, luna-landing.js, luna-moon3d.js, luna-three.module.min.js, immagini luna-*.webp, texture luna-moon-*.jpg, font luna-*.woff2

### 4.2 Il layout layout/luna-landing.liquid
- <html lang="{{ request.locale.iso_code }}"> con classe no-js, sostituita da js con uno script inline di una riga.
- Nel <head>, in quest'ordine: charset; viewport (width=device-width, initial-scale=1, viewport-fit=cover); title con {{ page_title }} e {{ shop.name }}; meta description con {{ page_description | escape }}; canonical con {{ canonical_url }}; Open Graph (og:type product, og:title, og:description, og:image = {{ 'luna-og.jpg' | asset_url | prepend: 'https:' }} — asset_url restituisce un indirizzo che inizia con //, og:image vuole un URL assoluto —, og:image:width 1200, og:image:height 630, og:image:alt, product:price:amount, product:price:currency) e twitter:card summary_large_image; le immagini del prodotto restano per Google e per i cataloghi; theme-color #05060B; @font-face inline con asset_url e font-display: swap; preload dei due font; il CSS luna-landing.css. SOLO DOPO tutto questo: {{ content_for_header }}.
- {{ content_for_header }} è obbligatorio, sta nel <head> e va scritto così com'è: niente filtri, niente if, niente capture, niente snippet. Carica pixel, analytics, banner cookie, app e pulsanti di pagamento rapido.
- Nel <body>: {{ content_for_layout }} e poi lo script {{ 'luna-landing.js' | asset_url }} con defer.
- Niente loop su prodotti o varianti nel <head>: rallentano il primo byte.

### 4.3 Il template templates/product.luna.json
- JSON valido, senza commenti, con "layout": "luna-landing".
- ID delle sezioni solo alfanumerici minuscoli: announcement, header, hero, moon3d, benefits, how, gift, specs, reviews, offer, faq, final, footer, sticky. "order" li contiene tutti, una volta sola.
- Al massimo 25 sezioni per template e 50 blocchi per sezione.
- Ogni step aggiunge al template solo le sezioni che ha creato.

### 4.4 Sezioni: gli errori da non fare
- Un solo {% schema %} per file, JSON valido (niente virgole finali né commenti), mai dentro un altro tag Liquid.
- "name" di sezioni e blocchi: massimo 25 caratteri.
- ID dei setting unici nella sezione. I default dei setting "richtext" sono racchiusi in <p>…</p>; per i titoli con il corsivo usa "inline_richtext".
- "range": min, max, step e default coerenti, al massimo 101 passi. "image_picker" e "video" senza default. In "select" e "radio" il default è uno dei valori delle opzioni.
- I blocchi di tipo @app non accettano "limit" e si rendono con {% render block %}.
- Ogni sezione ha "presets" (così si può togliere e rimettere dall'editor) ed "enabled_on": { "templates": ["product"] }.
- {% stylesheet %} e {% javascript %} non eseguono Liquid: gli stili che dipendono dai setting vanno in un <style> inline con selettori #shopify-section-{{ section.id }}.
- Usa {% render %}, mai {% include %}. Gli snippet vedono solo le variabili che passi: passa sempre product e tutto quello che serve.
- Per gli URL interni usa l'oggetto routes, mai percorsi scritti a mano. Unica eccezione: il campo return_to del §4.5.
- Ogni blocco ha {{ block.shopify_attributes }} sul suo contenitore.
- Ogni file Liquid resta sotto i 256 KB.

### 4.5 Form, checkout e pagamenti
- Un solo form prodotto in tutta la pagina, nella sezione hero: {%- form 'product', product, id: 'luna-buy-form', novalidate: 'novalidate' -%}.
- Dentro il form: input hidden name="id" con l'id della variante selezionata; input name="quantity" con value="1"; input hidden name="return_to" con value="/checkout", che porta dritto al checkout saltando il carrello; il bottone submit; {{ form | payment_button }} una sola volta, per il pagamento rapido (Shop Pay, Apple Pay, Google Pay, PayPal secondo i metodi attivi).
- Tutte le altre CTA (offerta, finale, barra sticky) sono bottoni con type="submit" e form="luna-buy-form", generati dallo snippet luna-cta: inviano lo stesso form.
- Al click non bloccare l'invio (niente preventDefault): mostra solo uno stato di caricamento sul bottone, «Ti porto al checkout…». Così gli eventi standard di Shopify e del pixel Meta partono da soli.
- Varianti: se product.has_only_default_variant è falso, mostra un selettore costruito da product.options_with_values che aggiorna id, prezzi e disponibilità leggendo un JSON delle varianti (prezzi già formattati con | money) stampato in uno script di tipo application/json.
- Variante esaurita: bottone disabilitato con la scritta «Esaurita» e pulsanti di pagamento rapido nascosti.
- Dati strutturati: una sola volta, nella hero, il JSON-LD di {{ product | structured_data }} dentro uno script di tipo application/ld+json.
- Gli stili di .shopify-payment-button arrivano da content_for_header, quindi dopo il nostro CSS: per sovrascriverli usa selettori più specifici, non !important a pioggia.

### 4.6 Prezzi e sconto (sconto già applicato, nessun codice sconto)
- Prezzo: variant.price | money. Barrato: variant.compare_at_price | money, mostrato solo se compare_at_price è maggiore di price.
- Prezzo e prezzo barrato si decidono in Shopify. Se il prezzo barrato manca o non è più alto del prezzo: niente badge, niente risparmio, niente riga Omnibus.
- Percentuale: {%- assign luna_pct = variant.compare_at_price | minus: variant.price | times: 100.0 | divided_by: variant.compare_at_price | round -%} e poi «−{{ luna_pct }}%».
- Risparmio: variant.compare_at_price | minus: variant.price | money.
- Riga Omnibus, piccola, sotto il prezzo, solo quando c'è lo sconto: «Prezzo più basso degli ultimi 30 giorni: {{ variant.compare_at_price | money }}».
- «IVA inclusa» quando cart.taxes_included è vero.
- ZERO prezzi scritti a mano in Liquid, JS o CSS: tutto arriva da Shopify, così pagina e checkout mostrano sempre lo stesso numero.

### 4.7 Immagini
- Immagini del prodotto: image_url + image_tag con widths, sizes, width e height.
- Immagini create nello step 2 (in assets): asset_url dentro <picture>, con le misure per mobile e desktop e attributi width e height sempre presenti.
- Ogni sezione con immagini ha un image_picker per sostituirle dall'editor; se è vuoto usa l'asset.
- Dove va ogni immagine del pacchetto (esportata nello step 2): hero → luna e base separate, accese e spente; moon3d, come ripiego → lampada accesa; benefits → scena orbita («Levita davvero»), scena caldo («Luce che scalda la stanza»), scena eclissi («Il regalo che non si dimentica»); gift → scena natale; specs → scena misure; barra sticky → miniatura; condivisioni → luna-og.jpg. Prima foto del prodotto su Shopify: scena notte.
- L'immagine della lampada nella hero è l'elemento LCP: loading="eager" e fetchpriority="high". Tutte le altre: loading="lazy" e decoding="async".
- Nella hero si scarica subito solo lo stato iniziale (spento; acceso con prefers-reduced-motion o nell'editor), come LCP con fetchpriority high. L'altro stato parte al primo frame dopo il paint, non all'evento load, così l'accensione arriva entro circa un secondo anche in 4G.
- Ogni immagine del tema ha un alt descrittivo, scritto nella sezione che la mostra.

### 4.8 Editor del tema
- Ogni componente JS si inizializza al DOMContentLoaded e di nuovo su shopify:section:load; su shopify:section:unload rimuove listener, observer e requestAnimationFrame.
- Nell'editor (request.design_mode in Liquid, Shopify.designMode in JS) la lampada parte già accesa e non c'è la sequenza d'accensione automatica.

## 5. Design system «Notte lunare»
- Atmosfera: lusso silenzioso, notte profonda, una sola luce calda. Riferimento: una pagina prodotto Apple, ma di notte. Niente neon, niente glitch, niente gradienti viola-blu: l'unico colore caldo forte è la luce della luna.
- Colori (custom properties su :root): --luna-bg #05060B · --luna-bg-2 #0A0F1E · --luna-ink #F2EFE8 · --luna-muted #A5A2B4 · --luna-line rgba(242,239,232,.10) · --luna-glass rgba(255,255,255,.04) · --luna-light #FFD9A3 (il colore della luce, bianco caldo) · --luna-amber #FFB866 · --luna-cta-top #FFE3AE · --luna-cta-bottom #FFB866 · --luna-cta-ink #1A1205 · --luna-cool #9FB4FF · --luna-ok #8FE3B5 · --luna-power 0 (0 spenta, 1 accesa).
- Font self-hosted (licenza OFL, sottoinsieme latin, woff2): Fraunces variabile per i titoli (peso 300–500, letter-spacing −0,02em, asse opsz alto) e Inter variabile per i testi. Scala: H1 clamp(2.4rem, 7vw, 5.2rem) con line-height 1.02; H2 clamp(1.9rem, 4.6vw, 3.4rem); testo 1.0625rem con line-height 1.6; piccolo .875rem. Titoli con text-wrap: balance.
- Spazi: sezioni con padding verticale clamp(72px, 12vw, 160px); contenitore massimo 1200 px; margine laterale 20 px su mobile.
- CTA: pillola alta 56 px, larga il 100% su mobile, gradiente verticale da --luna-cta-top a --luna-cta-bottom, testo --luna-cta-ink, riflesso interno in alto, alone 0 10px 40px -10px rgba(255,184,102,.55). Hover: alone più intenso e translateY(−1px). Pressione: scale(.98). Focus sempre visibile.
- Card in vetro solo dove servono (benefici, garanzia): backdrop-filter blur(14px) e bordo di 1 px sfumato.
- Sfondi a strati: gradiente radiale da blu notte a nero; nebulose sfocate che si spostano lentamente (40–60 s); stelle (canvas nella hero, CSS statico altrove); grana SVG al 3–4% di opacità; con la lampada accesa, una luce calda che si allarga sullo sfondo. Tra una sezione e l'altra sfumature, mai linee nette.
- Movimento: easing cubic-bezier(.22,1,.36,1). Comparsa: da translateY(24px) e opacità ridotta a pieno, 700 ms, a cascata di 80 ms; senza JS il contenuto è già visibile. Levitazione: translateY da 0 a −14px in 6 s, ease-in-out, all'infinito, con l'ombra sulla base che si restringe e sbiadisce a tempo.
- Dettaglio firma: nell'header una piccola luna passa da luna nuova a luna piena man mano che si scorre (la percentuale di scroll diventa una fase lunare).
- prefers-reduced-motion: niente levitazione, parallasse, nebulose in movimento o rotazione automatica. Gli stati restano, cambiano senza animazione.

## 6. Struttura della pagina e strategia
1. announcement: spedizione e reso, solo informazioni vere
2. header: logo e luna-progresso. Nessun menu, nessun link che porta fuori
3. hero: il momento «wow» e l'offerta completa: titolo, lampada interattiva, prezzo scontato, CTA, pagamento rapido, consegna stimata, rassicurazioni
4. moon3d: la luna 3D da girare e accendere. Fa giocare, allunga il tempo sulla pagina, aumenta il desiderio
5. benefits: tre motivi per volerla
6. how: smonta l'obiezione «sarà complicata?»
7. gift: l'angolo regalo e Natale, con la scadenza di consegna reale
8. specs: specifiche e confronto con una lampada qualsiasi
9. reviews: recensioni vere dall'app; la sezione sparisce se è vuota
10. offer: la sezione sconto: percentuale calcolata dai prezzi di Shopify (solo se c'è il barrato), riepilogo, garanzia, countdown solo se la promo ha una fine reale, CTA n. 2
11. faq: le obiezioni rimaste
12. final: chiusura emotiva e CTA n. 3
13. footer: dati legali, policy, icone di pagamento
+ sticky: barra d'acquisto fissa in basso su mobile
Ogni CTA fa una cosa sola: acquista e vai al checkout. Tre CTA in pagina più la barra sticky, nient'altro.

## 7. Titoli per angolo di campagna
La hero legge il parametro h dell'URL e sceglie il titolo; le varianti sono setting della hero. Valori ammessi: magia (predefinito), regalo, relax. Lo scambio avviene con uno script inline subito dopo l'H1, prima del primo paint, senza sfarfallio. Qualsiasi altro valore mostra il titolo predefinito.

## 8. Copy (valori predefiniti dei setting)
announcement: «Spedizione gratuita in tutta Italia · Reso entro 30 giorni»

hero
- occhiello: «Levitazione magnetica · Ø 8,5 cm»
- H1 magia: «La Luna. <em>Sospesa</em> nella tua stanza.»
- H1 regalo: «Il regalo che fa dire <em>wow</em> appena si accende.»
- H1 relax: «Spegni lo schermo. <em>Accendi</em> la Luna.»
- sottotitolo: «Fluttua a pochi centimetri dalla base, senza toccare nulla. Ruota piano su se stessa e riempie la stanza di luce calda. Chi la vede fa sempre la stessa domanda: “Ma come fa a stare su?”»
- suggerimento: «Tocca la luna per vederla accesa e spenta»
- CTA: «Acquista ora — {prezzo}» (prezzo da Liquid)
- consegna: «Ordina oggi, la ricevi tra {data1} e {data2}»
- scorte: «Solo {n} pezzi disponibili» (n dal magazzino Shopify; la riga compare solo con i numeri veri, sotto la soglia: §10)
- fiducia: «Spedizione gratuita» · «Pagamenti protetti» · «Reso in 30 giorni»

moon3d
- occhiello: «Provala adesso»
- H2: «Girala. Accendila.»
- testo, in due parti: «Trascina per farla ruotare.» · «Con il pulsante qui sotto la vedi accesa e spenta.» Senza JavaScript la frase intera non si mostra, perché non funzionano né il trascinamento né il pulsante. Senza WebGL ma con JavaScript si nasconde solo «Trascina per farla ruotare.», perché il pulsante sull'immagine di ripiego funziona.
- didascalia: «Anteprima 3D illustrativa»
- crediti, obbligatori (licenza CC BY 4.0), nella stessa didascalia: «Texture della Luna: Solar System Scope, CC BY 4.0»

benefits
- occhiello: «Perché tutti la notano»
- H2: «Un pezzo di cielo, sul tuo comodino.»
- «Levita davvero»: «Un campo magnetico la tiene sospesa a mezz'aria, senza niente che la regga: solo la Luna che galleggia sopra il tuo comodino.»
- «Luce che scalda la stanza»: «Luce calda e morbida, pensata per la sera: la accendi e la stanza cambia atmosfera.»
- «Il regalo che non si dimentica»: «Per chi ha già tutto, per chi ama il cielo, per chi vuoi stupire. Pochi regali fanno lo stesso effetto appena si accendono.»

how
- occhiello: «Facilissima»
- H2: «Pronta in tre gesti.»
- 1 «Collega la base»: «Inserisci l'alimentatore nella presa: la base è pronta.»
- 2 «Avvicina la Luna»: «Tienila sopra il centro della base: sentirai il campo magnetico che la aggancia.»
- 3 «Lasciala andare»: «Apri piano le dita. La Luna resta sospesa e inizia a ruotare.»
- nota: «La prima volta serve un minuto di pratica per trovare il punto di equilibrio. Poi diventa un gesto da due secondi.»

gift
- occhiello: «Idea regalo»
- H2: «Il regalo che si scarta… e poi si accende.»
- testo: «Per lei, per lui, per la coppia o per chi ha già tutto. Resta in casa, sul comodino o in salotto, e fa parlare ogni volta che si accende.»
- chip: «Per lei» · «Per lui» · «Per la coppia» · «Per chi ha già tutto»
- scadenza, solo fino alla data impostata: «Ordina entro il {data} per riceverla prima di Natale.»

specs
- occhiello: «Dettagli»
- H2: «Tutto quello che c'è da sapere.»
- righe: Diametro · Materiale · Luce · Accensione · Alimentazione · Base · Nella confezione (valori dal §2)
- confronto, titolo «Lampada Lunare Levitante o una lampada qualsiasi?», righe: «Fluttua a mezz'aria» sì/no · «Ruota da sola» sì/no · «Luce calda e morbida» sì/«a volte» · «Fa parlare chi entra in casa» sì/no · «Effetto regalo» sì/no

reviews
- occhiello: «Recensioni»
- H2: «Cosa dice chi l'ha già accesa.»

offer (la sezione sconto)
- badge: «Offerta di lancio −{pct}%» (pct calcolato in Liquid dai prezzi di Shopify; niente badge se il barrato manca o non è più alto del prezzo)
- H2: «La tua Luna a {prezzo}.»
- riepilogo: «Lampada Lunare Levitante Ø 8,5 cm con base magnetica» · «Nella confezione: Luna, base, alimentatore e istruzioni» · «Spedizione gratuita dall'Italia in 2–4 giorni lavorativi» · «Reso entro 30 giorni»
- prezzo al giorno: «Meno di {c} centesimi a sera per tutto il primo anno.»
- garanzia, solo se il reso supera i 14 giorni: titolo «30 notti di prova», testo «Se non ti conquista, hai 30 giorni dalla consegna per restituirla e farti rimborsare. Tutti i dettagli nella politica di rimborso.»
- countdown: «L'offerta termina tra» gg : hh : mm : ss

faq (blocchi domanda/risposta)
1 «Come fa a levitare?»: «Nella base c'è un sistema magnetico che tiene la luna in equilibrio a pochi centimetri, senza alcun contatto.»
2 «È difficile posizionarla?»: «La prima volta serve un minuto: tieni la luna sopra il centro della base, aspetta di sentire che il campo magnetico la prende e apri le dita con calma. Dopo un paio di prove viene naturale.»
3 «Va collegata alla corrente?»: «Sì: la base va alla presa con l'alimentatore incluso; la luna si accende senza fili.»
4 «Come la spengo senza farla cadere?»: «Prendi prima la luna in mano, poi stacca l'alimentatore. In quest'ordine non cade mai.»
5 «Quando arriva?»: «Spediamo noi, dall'Italia, con corriere tracciato: la ricevi in 2–4 giorni lavorativi. Il codice di tracciamento ti arriva via email appena il pacco parte.»
6 «E se non mi piace?»: «Hai 30 giorni dalla consegna per restituirla. Trovi tutti i dettagli nella politica di rimborso.»
7 «È adatta ai bambini?»: «È una lampada d'arredo, non un giocattolo: con i più piccoli serve la supervisione di un adulto.»
8 «Il pagamento è sicuro?»: «Il checkout è gestito da Shopify su connessione cifrata. Puoi pagare con i metodi che vedi in fondo alla pagina, anche con il pagamento rapido dallo smartphone.»

final
- H2: «Stasera, accendi la Luna.»
- testo: «Spedizione gratuita, 30 notti di prova e un regalo che nessuno dimentica.»
- CTA: «Acquista ora — {prezzo}»

sticky: miniatura · «Lampada Lunare Levitante» · prezzo · «Acquista»
footer: «© {anno} Lunaria» · ragione sociale, P.IVA e sede (setting vuoti da compilare dall'editor) · link alle policy · icone di pagamento

## 9. Performance e accessibilità
- Obiettivi su mobile in 4G: LCP sotto 2,5 s, CLS sotto 0,1, INP sotto 200 ms. Lighthouse mobile: Performance ≥ 85, Accessibilità ≥ 95, SEO ≥ 95.
- Immagine della lampada nella hero ≤ 140 KB. Primo caricamento senza la parte 3D ≤ 900 KB in tutto.
- luna-landing.js piccolo e senza dipendenze. Three.js si carica solo quando la sezione 3D è a 400 px dal viewport, con import() dinamico, mai prima del primo paint.
- Canvas e WebGL: devicePixelRatio massimo 2 su desktop e 1,5 su mobile; il loop si ferma quando la sezione esce dallo schermo o la scheda è nascosta.
- Contrasto AA, focus visibile, aree touch di almeno 44 px, un solo H1, interruttore della luce con role="switch" e aria-checked, alt descrittivi.

## 10. Regole legali (Italia e UE)
- Il prezzo barrato è il prezzo più basso realmente applicato nei 30 giorni prima dello sconto (Codice del Consumo, art. 17-bis): accanto al barrato c'è sempre la riga Omnibus.
- Il countdown appare solo con una data di fine reale (setting); alla scadenza sparisce e non riparte mai.
- Recensioni solo dall'app recensioni installata: niente testimonianze, voti o numeri di clienti scritti a mano.
- Scorte solo dal magazzino Shopify.
- Niente promesse sulla salute (sonno, ansia, terapia) e niente «NASA», «certificato» o «brevettato» se non è documentato.
- I materiali si scrivono come nella scheda del fornitore (luna in PLA stampato in 3D, base in ABS effetto legno chiaro): mai «legno» da solo.
- Le scene sono composizioni: la lampada è quella vera, sfondi ed effetti sono nostri. Le foto originali del fornitore non vanno mai in pagina. La misura reale (Ø 8,5 cm) compare sempre vicino alle immagini grandi della lampada, nell'occhiello della hero e nella sezione specifiche, così nessuno la immagina più grande di com'è.
- Se il reso è di 14 giorni o meno non presentarlo come garanzia o vantaggio: è il diritto di recesso previsto dalla legge. In quel caso togli «notti di prova» da offer e final.
- Footer con ragione sociale, P.IVA e sede (setting) e link alle policy da shop.policies.
- Il banner cookie deve comparire anche con questo layout: si verifica nello step 7, sul negozio.

## 11. Gli step
0 Repository e tema di partenza · 1 Fondamenta e anteprima simulata · 2 Immagini: dal pacchetto foto agli asset del tema · 3 Hero, acquisto e barra sticky · 4 Luna 3D · 5 Sezioni che convincono · 6 Sezione sconto, FAQ e chiusura · 7 Controllo qualità e collegamento al negozio

## 12. Report alla fine di ogni step
- File creati o modificati, con una riga ciascuno su cosa fanno
- Esito di `shopify theme check`
- Anteprima: esito di `npm --prefix studio run preview` e di `npm --prefix studio run check`, cosa hai visto negli screenshot e cosa hai corretto. Dopo il collegamento al negozio: /products/lampada-lunare-levitante?view=luna
- Dati mancanti o dubbi
Poi commit con il nome dello step, push, FERMATI e aspetta lo step successivo.

## 13. Anteprima simulata (finché il negozio non è collegato)
- `npm --prefix studio run preview` renderizza il template con LiquidJS e dati finti in studio/preview/out/index.html e salva gli screenshot a pagina intera studio/qa/preview-390.png e studio/qa/preview-1440.png, più gli errori di console in studio/qa/console.txt.
- `npm --prefix studio run check` lancia i controlli automatici con Playwright (studio/preview/check.mjs), che crescono step dopo step.
- Alla fine di ogni step che tocca grafica o JavaScript esegui entrambi, apri e guarda davvero gli screenshot, correggi quello che non va.
- L'anteprima simulata serve per grafica, testi e JavaScript. Checkout, pagamenti rapidi, pixel e banner cookie si provano solo sul negozio, nello step 7.
