# Collegamento al negozio (step 7)

Cosa serve per mettere online la landing e provarla sul negozio vero. Le parti segnate **tu** si fanno
dall'admin di Shopify; le parti segnate **Claude** le verifico io quando il negozio è collegato.

## 1. Il tema (tu)
- [ ] Unisci la pull request del branch di lavoro in `main`, oppure, per provarla prima, collega direttamente il
      branch `claude/luna-landing-setup-139fxl`.
- [ ] Admin → Negozio online → Temi → Aggiungi tema → **Collega da GitHub** → repository
      `nicholaszani2000-star/lampada-lunare` → branch scelto. Shopify legge solo le cartelle del tema; `studio/`
      viene ignorata.
- [ ] Attenzione: con l'integrazione GitHub ogni modifica salvata nell'editor del tema diventa un commit su quel
      branch. Lavora nell'editor su una copia, oppure dimmelo prima di modificare.
- [ ] Facoltativo: su GitHub, Impostazioni → Branches, imposta `main` come branch predefinito.

## 2. Il prodotto (tu)
- [ ] Prodotto «Lampada Lunare Levitante», handle `lampada-lunare-levitante`.
- [ ] Prezzo €59,90. Prezzo barrato («Prezzo di confronto»): solo se è il **prezzo più basso realmente applicato
      nei 30 giorni prima dello sconto** (Codice del Consumo, art. 17-bis): la pagina lo mostra con la riga Omnibus.
- [ ] Modello del tema: **product.luna** (nella colonna a destra della scheda prodotto).
- [ ] Prima foto del prodotto: la scena «notte», `studio/input/luna-foto/scene/01-notte.jpg` (la stessa
      esportata per il tema in `assets/luna-scene-notte-2000.webp`).
- [ ] Magazzino: «Monitora quantità» disattivato (la pagina non mostra righe di scorte).
- [ ] Spedizione gratuita in Italia, 7–14 giorni lavorativi (Impostazioni → Spedizione e consegna).

## 3. Impostazioni del negozio (tu)
- [ ] Impostazioni → Policy: **politica di rimborso** (30 giorni dalla consegna) e informativa sulla privacy:
      footer, garanzia e FAQ le collegano da sole.
- [ ] Impostazioni → Imposte: prezzi con IVA inclusa (la pagina scrive «IVA inclusa» solo se è così).
- [ ] Impostazioni → Pagamenti: Shop Pay, Apple Pay, Google Pay, PayPal (i pagamenti rapidi della hero).
- [ ] Impostazioni → Privacy dei clienti: **banner dei cookie** attivo per l'UE.
- [ ] App «Facebook e Instagram» di Shopify per il pixel Meta (lo carica `content_for_header`).
- [ ] Nell'editor del tema, sezione Footer: ragione sociale, P.IVA e sede.
- [ ] Facoltativo: favicon in Impostazioni del tema → Favicon (senza, si vede una piccola luna).

## 4. Cosa mi serve per le verifiche (tu → Claude)
- [ ] L'indirizzo del negozio (`…myshopify.com`) e, se il negozio è protetto da password, la password della
      vetrina (non quella dell'admin).
- [ ] Il link d'anteprima del tema collegato, se non è ancora quello pubblicato.

## 5. Verifiche sul negozio (Claude)
Su `/products/lampada-lunare-levitante?view=luna`:
- [ ] la pagina usa il layout `luna-landing`; `shopify theme check` resta a 0 errori nei file luna;
- [ ] il bottone d'acquisto porta dritto al checkout con la variante giusta (`return_to=/checkout`), e lo
      stesso fanno CTA dell'offerta, CTA finale e barra sticky;
- [ ] i pagamenti rapidi compaiono; con la variante esaurita spariscono;
- [ ] prezzi, barrato, percentuale, risparmio e riga Omnibus uguali al checkout;
- [ ] banner dei cookie visibile con questo layout; eventi del pixel Meta (PageView, ViewContent,
      InitiateCheckout) senza bloccare l'invio;
- [ ] Lighthouse mobile sul negozio vero: Prestazioni ≥ 85, Accessibilità ≥ 95, SEO ≥ 95; LCP < 2,5 s,
      CLS < 0,1 (qui contano anche gli script di Shopify, del pixel e dei pagamenti rapidi);
- [ ] editor del tema: ogni sezione si toglie e si rimette, la lampada parte accesa, la luna 3D si smonta e
      rimonta, il riquadro delle recensioni aspetta il blocco dell'app.
