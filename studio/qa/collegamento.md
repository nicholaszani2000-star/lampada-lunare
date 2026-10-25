# Collegamento al negozio

**Stato:** il dominio del negozio non è ancora definito, quindi il collegamento non è stato fatto. Questa guida
è pronta per quando il negozio c'è. Tema di partenza: **Horizon 4.3.0** (il tema gratuito di Shopify) con, in
più, i file `luna-*` della landing e `templates/product.luna.json`.

**Handle del prodotto:** in queste istruzioni è `lampada-lunare-levitante`, come in CLAUDE.md §1. Se scegli un
handle diverso, sostituiscilo ovunque compare qui sotto.

## Quale strada

| | Strada A · consigliata | Strada B |
|---|---|---|
| Quando | Il negozio è nuovo, oppure il suo tema è questo repository | Il negozio ha già un tema personalizzato che non è nel repository |
| Cosa va online | Tutto il tema: Horizon 4.3.0 + landing | Solo i file della landing, dentro il tema che c'è già |
| Aggiornamenti | Ogni commit su `main` aggiorna il tema | A mano, con Shopify CLI |

Nota su Horizon (strada A): le altre pagine del negozio (home, collezioni, carrello, pagine) usano il layout di
Horizon, con logo, colori e menu da impostare nell'editor del tema. La landing invece usa il suo layout
`luna-landing` e non dipende da niente di Horizon. Legge solo la favicon dalle impostazioni del tema, se c'è;
altrimenti mostra una piccola luna.

Nota sulla strada B: i file `luna-*` non usano snippet, traduzioni né impostazioni del tema ospite. Per questo
funzionano dentro qualsiasi tema Online Store 2.0.

## Strada A · GitHub

1. Unisci la pull request del branch di lavoro in `main`
   ([nicholaszani2000-star/lampada-lunare#1](https://github.com/nicholaszani2000-star/lampada-lunare/pull/1)).
2. Admin Shopify → **Negozio online → Temi → Aggiungi tema → Collega da GitHub**. Autorizza l'account GitHub,
   poi scegli il repository `nicholaszani2000-star/lampada-lunare` e il branch `main`.
3. Il tema compare **non pubblicato** nella libreria dei temi. Aprine l'anteprima sul telefono (… → Anteprima)
   e fai le prove della sezione «Prova vera sul telefono». Poi **Pubblica**.
4. Da qui in avanti:
   - ogni commit su `main` aggiorna il tema;
   - le modifiche fatte dall'editor del tema tornano nel repository come commit di Shopify. Prima di lavorare
     di nuovo sul codice serve sempre un pull (`git pull origin main`, poi aggiornare il branch di lavoro).
5. Shopify legge solo le cartelle standard del tema: `studio/` resta nel repository ma non va online.

## Strada B · Shopify CLI

Shopify CLI è già installata nell'ambiente di lavoro (4.9.4). Il login parte al primo comando e si apre il
browser. `.shopifyignore` esclude `studio/` e `CLAUDE.md`.

1. **Tema di prova** (non pubblicato), con tutto il tema del repository:
   ```sh
   shopify theme push --store <dominio-del-negozio> --unpublished --theme "Luna test" --json
   ```
   Anteprima sul telefono e prove della sezione «Prova vera sul telefono», su «Luna test».
2. **Solo dopo il tuo «ok, pubblica»**: soltanto i file della landing sul tema live. Nessun altro file del tema
   live viene toccato (`--nodelete`, `--only`):
   ```sh
   shopify theme push --store <dominio-del-negozio> --live --allow-live --nodelete \
     --only "layout/luna-*" --only "sections/luna-*" --only "snippets/luna-*" \
     --only "assets/luna-*" --only "templates/product.luna.json"
   ```
3. Nella scheda del prodotto, Modello del tema: **luna**.

## Prova vera sul telefono

Indirizzo: `https://<dominio>/products/lampada-lunare-levitante?view=luna`. Il parametro `?view=luna` serve
solo finché il modello «luna» non è assegnato al prodotto.

- [ ] Checkout con **1 pezzo al prezzo giusto** da ogni CTA: hero, offerta, chiusura e barra sticky.
- [ ] **Pagamenti rapidi** visibili accanto alla CTA della hero e coerenti con lo stile della pagina; con la
      variante esaurita spariscono.
- [ ] **Banner dei cookie** presente con il layout della landing.
- [ ] **Eventi del pixel Meta**: PageView, ViewContent, AddToCart / InitiateCheckout. Si vedono con Meta Pixel
      Helper o in Gestione eventi → Eventi di prova. Il bottone deve portare al checkout senza attese.
- [ ] Prezzo, barrato, percentuale, risparmio e riga Omnibus uguali a quelli del checkout.
- [ ] Consegna stimata con date sensate oggi (ora italiana, giorni lavorativi).
- [ ] Editor del tema: la lampada parte accesa; ogni sezione si toglie e si rimette; la luna 3D si smonta e
      rimonta; il riquadro delle recensioni aspetta il blocco dell'app.
- [ ] Lighthouse o PageSpeed Insights sull'indirizzo vero: Prestazioni ≥ 85, Accessibilità ≥ 95, SEO ≥ 95,
      LCP < 2,5 s, CLS < 0,1.

## Da fare nell'admin Shopify (tu)

- [ ] **Prodotto** con l'handle scelto (`lampada-lunare-levitante`), prezzo **€59,90**.
  - Prezzo di confronto **€66,56**, solo se è il prezzo più basso che hai davvero applicato negli ultimi 30
    giorni (Codice del Consumo, art. 17-bis). La pagina lo mostra con la riga Omnibus.
- [ ] **Immagini del prodotto** da `studio/input/luna-foto/scene`, in quest'ordine: 01-notte, 03-misure,
      02-caldo, 04-orbita, 05-eclissi, 06-natale. La prima è quella che si vede nel checkout, nei cataloghi e
      nelle condivisioni.
- [ ] Nel prodotto, **Modello del tema: «luna»**. Compare quando il tema con il template è pubblicato.
- [ ] **Formato della valuta** `€{{amount_with_comma_separator}}` (Impostazioni → Generali → Valuta del negozio
      → Modifica formattazione).
- [ ] **Fuso orario** del negozio: Europa/Roma (Impostazioni → Generali). Consegna stimata e scadenze contano i
      giorni lavorativi italiani.
- [ ] **Magazzino**: «Monitora quantità» attivo, con il numero vero di pezzi che hai. La riga «Solo {n} pezzi
      disponibili» compare da sola solo sotto la soglia della hero (oggi 15); sopra, nessuna riga.
- [ ] **Spedizione** gratuita in Italia, 2–4 giorni lavorativi: spedisci tu il giorno lavorativo dopo l'ordine,
      con corriere tracciato (Impostazioni → Spedizione e consegna).
- [ ] **Policy**: politica di rimborso (30 giorni dalla consegna) e informativa sulla privacy
      (Impostazioni → Policy). Footer, garanzia e FAQ le collegano da sole.
- [ ] **Imposte**: prezzi con IVA inclusa. La pagina scrive «IVA inclusa» solo se è così.
- [ ] **Shopify Payments** attivato con i dati dell'attività, un documento d'identità e l'IBAN del conto su cui
      ricevere gli incassi.
- [ ] **Pagamenti rapidi** attivi: Shop Pay, Apple Pay, Google Pay, PayPal.
- [ ] **Dominio** collegato (Impostazioni → Domini) e impostato come principale.
- [ ] **Negozio aperto al pubblico**: completati i passaggi di avvio che Shopify chiede e tolta la password.
- [ ] **Banner dei cookie** attivo (Impostazioni → Privacy dei clienti → Banner dei cookie).
- [ ] **App recensioni** installata e il suo blocco aggiunto nella sezione Recensioni, dall'editor.
- [ ] **App Facebook & Instagram** collegata, con pixel e API Conversioni.
- [ ] **Ragione sociale, P.IVA e sede** nel footer, dall'editor (sezione Footer).
- [ ] **Countdown** della sezione Offerta («Mostra countdown»): acceso solo se lo sconto è reale e finisce
      davvero alla data impostata.
- [ ] **Scadenza di Natale** nella sezione Regalo: 2026-12-17. Un ordine del 17 parte il 18 e arriva al
      massimo il 23.
- [ ] **Un ordine di prova** completato prima di accendere le campagne.
- [ ] **Link per le campagne**: `https://<dominio>/products/lampada-lunare-levitante`, senza `?view=luna`. Con il
      modello «luna» assegnato, la pagina del prodotto è già la landing. Aggiungi i parametri UTM e, per gli
      angoli di campagna, `h=regalo` o `h=relax` (§7). Per esempio:
      `https://<dominio>/products/lampada-lunare-levitante?h=regalo&utm_source=facebook&utm_medium=paid_social&utm_campaign=natale`

## Cosa mi serve per le verifiche

- L'indirizzo del negozio (`…myshopify.com` o il dominio) e, se la vetrina è protetta, la sua password (non
  quella dell'admin).
- Per la strada B: il tuo login a Shopify CLI quando parte il primo comando.
