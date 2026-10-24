// Controlli automatici dell'anteprima simulata (CLAUDE.md §13). Crescono step dopo step.
// Step 1: nessun errore di console, nessuno scroll orizzontale a 360, 390, 768 e 1440 px, font caricati
//         (anche il corsivo di Fraunces dove i titoli hanno <em>), primo caricamento entro il budget del §9.
// Step 3: interruttore della luna, titoli per angolo (?h=), barra sticky, movimento ridotto, form d'acquisto,
//         CTA collegate a #luna-buy-form, nessun prezzo scritto a mano, un solo H1, immagini della hero (LCP).
// Step 4: Three.js non scaricato prima di avvicinarsi alla sezione 3D; poi un canvas WebGL disegnato davvero;
//         con ?luna3d=0 l'immagine di ripiego; tonalità sincronizzate hero ↔ 3D; swipe sul canvas che fa scorrere
//         la pagina; trascinamento che ruota la luna (anche con movimento ridotto); editor: unload smonta, load rimonta;
//         istruzioni nascoste senza JavaScript (e solo «Trascina…» senza WebGL); su desktop la 3D parte dopo la hero.
// Step 5: confronto senza scroll orizzontale a 360 px; recensioni senza blocchi che non stampano nulla (e il
//         riquadro nell'editor); riga di Natale prima e dopo la scadenza con la data simulata; lampada di «Come
//         funziona» che si monta (view(), ripiego JavaScript, movimento ridotto); card dei benefici della stessa
//         altezza su desktop; passaggi morbidi tra le sezioni, senza linee nette.
// Step 6: badge con percentuale e risparmio calcolati dai prezzi finti, che spariscono con il barrato vuoto;
//         countdown assente da spento e con la data passata, presente con la data futura e mai più dopo la fine;
//         niente «notti di prova» con 14 giorni di reso; FAQ che si aprono anche senza JavaScript; esattamente 3 CTA
//         più la barra sticky su #luna-buy-form; barra sticky che sparisce davanti alla CTA finale. Le pagine di
//         prova arrivano da studio/preview/overrides/*.json.
// Step 7: consegna stimata per un ordine di venerdì, di sabato, dopo l'ora limite e prima di una festività;
//         console e scroll orizzontale anche a 1280 px; ogni regola del §10, una per una; pesi reali di immagini
//         e JavaScript, nessuna libreria esterna. L'esito, punto per punto, va in studio/qa/checklist.md.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { launchBrowser, paths, serve } from './lib.mjs';
import { buildData, render } from './render.mjs';
import { scrollThrough, stretchSky, watchProblems } from './shoot.mjs';

const PAGES = ['index.html', 'styleguide.html'];
const WIDTHS = [360, 390, 768, 1280, 1440];
const FONTS = ['Luna Fraunces', 'Luna Inter'];
// §9: primo caricamento senza la parte 3D ≤ 900 KB. Il server dell'anteprima non comprime:
// la misura è prudente (su Shopify CSS, JS e HTML arrivano compressi).
const BUDGET_KB = 900;
// Parte 3D: luna-moon3d.js, luna-three.module.min.js e le texture luna-moon-*.jpg (i ritagli sono .webp)
const IS_3D = /luna-(moon3d|three)|luna-moon-[^/?]*\.jpg/;
// §9: immagine della lampada nella hero (stato iniziale) ≤ 140 KB
const HERO_LCP_KB = 140;

const context = (browser, options = {}) =>
  browser.newContext({ locale: 'it-IT', timezoneId: 'Europe/Rome', ...options });
const mobileOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

/* ---------------------------------------------------------------- step 1 */
async function checkPage(browser, baseUrl, pageName, width) {
  const mobile = width < 768;
  const ctx = await context(browser, {
    viewport: { width, height: mobile ? 800 : 900 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await ctx.newPage();
  const problems = [];
  watchProblems(page, '', problems);
  // Peso del primo caricamento: tutto quello che arriva prima di scorrere, 3D escluso
  const bodies = [];
  page.on('response', (response) => {
    if (!IS_3D.test(response.url())) bodies.push(response.body().then((body) => body.length, () => 0));
  });
  await page.goto(`${baseUrl}/${pageName}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const firstLoadKb = (await Promise.all(bodies)).reduce((sum, size) => sum + size, 0) / 1024;
  await scrollThrough(page);

  const result = await page.evaluate(({ families, expected }) => {
    // Su mobile Chromium allarga la finestra per far stare un contenuto troppo largo:
    // si confronta con la larghezza impostata, non con window.innerWidth
    const viewport = expected;
    const overflow = document.documentElement.scrollWidth - viewport;
    // Con overflow-x: clip la pagina non scorre mai: si cerca anche chi esce davvero dallo schermo
    const offenders = [];
    for (const element of document.querySelectorAll('.luna-page *')) {
      if (element.closest('.luna-sky, .luna-visually-hidden, [data-luna-overflow-ok], noscript')) continue;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.right > viewport + 1 || rect.left < -1) {
        const name = element.tagName.toLowerCase() + (element.className && typeof element.className === 'string'
          ? '.' + element.className.trim().split(/\s+/).join('.')
          : '');
        offenders.push(`${name} (${Math.round(rect.left)}→${Math.round(rect.right)})`);
      }
    }
    const faces = [...document.fonts].filter((font) => font.status === 'loaded');
    const loaded = faces.map((font) => font.family.replace(/["']/g, ''));
    const missingFonts = families.filter((family) => !loaded.includes(family));
    // Gli <em> dei titoli devono usare il corsivo vero di Fraunces, non quello imitato dal browser
    const needsItalic = document.querySelector('.luna-h1 em, .luna-h2 em, .luna-h3 em');
    const hasItalic = faces.some((font) => font.family.includes('Luna Fraunces') && font.style === 'italic');
    if (needsItalic && !hasItalic) missingFonts.push('Luna Fraunces corsivo');
    return {
      overflow,
      offenders: offenders.slice(0, 5),
      missingFonts,
      italic: Boolean(needsItalic && hasItalic),
    };
  }, { families: FONTS, expected: width });
  await ctx.close();

  const failures = [];
  if (problems.length) failures.push(...problems.map((problem) => problem.trim()));
  if (result.overflow > 0) failures.push(`scroll orizzontale di ${result.overflow}px`);
  if (result.offenders.length) failures.push(`fuori dallo schermo: ${result.offenders.join(', ')}`);
  if (result.missingFonts.length) failures.push(`font non caricati: ${result.missingFonts.join(', ')}`);
  if (firstLoadKb > BUDGET_KB) {
    failures.push(`primo caricamento di ${firstLoadKb.toFixed(0)} KB, oltre il budget di ${BUDGET_KB} KB`);
  }
  return { failures, firstLoadKb, italic: result.italic };
}

/* ---------------------------------------------------------------- step 3 */
const stripTags = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function heroSettings() {
  const template = JSON.parse(readFileSync(join(paths.theme, 'templates', 'product.luna.json'), 'utf8'));
  const hero = Object.values(template.sections).find((section) => section.type === 'luna-hero');
  return hero ? hero.settings || {} : {};
}

/** Cerca importi in euro scritti a mano nei file luna del tema (§4.6: zero prezzi nel codice). */
function hardcodedPrices() {
  const patterns = [
    /€\s?\d/,
    /\d\s?€/,
    /\bEUR\s?\d/,
    /(?<![\d.-])\d{1,3}(?:\.\d{3})*,\d{2}(?![\d-])/,
    /\b\d+\.\d{2}\s?(?:€|EUR)/,
  ];
  const files = [];
  for (const dir of ['layout', 'sections', 'snippets', 'assets', 'templates']) {
    for (const name of readdirSync(join(paths.theme, dir))) {
      if (!/^(luna-|product\.luna\.json$)/.test(name) || !/\.(liquid|js|css|json)$/.test(name)) continue;
      // Three.js è una libreria esterna minificata: le sue costanti numeriche non sono prezzi
      if (name === 'luna-three.module.min.js') continue;
      files.push(join(dir, name));
    }
  }
  const found = [];
  for (const file of files) {
    readFileSync(join(paths.theme, file), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (patterns.some((pattern) => pattern.test(line))) found.push(`${file}:${index + 1} ${line.trim().slice(0, 80)}`);
      });
  }
  return { files: files.length, found };
}

async function heroChecks(browser, baseUrl) {
  const results = [];
  const record = (name, ok, detail = '') => results.push({ name, ok, detail });
  const settings = heroSettings();
  const defaultTitle = stripTags(settings.heading);

  // 1. Interruttore: il tocco cambia aria-checked e --luna-power (e la tastiera lo riporta indietro)
  {
    const ctx = await context(browser, mobileOptions);
    const page = await ctx.newPage();
    const problems = [];
    watchProblems(page, '', problems);
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const read = () =>
      page.evaluate(() => ({
        checked: document.querySelector('[data-luna-switch]').getAttribute('aria-checked'),
        power: getComputedStyle(document.querySelector('[data-luna-stage]')).getPropertyValue('--luna-power').trim(),
        hint: document.querySelector('[data-luna-hint]')?.classList.contains('is-hidden'),
      }));
    const before = await read();
    // La luna levita sempre: Playwright non la vede mai «ferma», quindi il clic è forzato
    await page.click('[data-luna-switch]', { force: true });
    const after = await read();
    await page.focus('[data-luna-switch]');
    await page.keyboard.press('Space');
    const third = await read();
    const ok =
      before.checked !== after.checked &&
      before.power !== after.power &&
      after.hint === true &&
      third.checked === before.checked &&
      third.power === before.power &&
      !problems.length;
    record(
      'tocco sulla luna',
      ok,
      `aria-checked ${before.checked}→${after.checked}→${third.checked} (Spazio), --luna-power ${before.power}→${after.power}→${third.power}, suggerimento nascosto: ${after.hint}`
    );
    await ctx.close();
  }

  // 2. Titoli per angolo di campagna (§7)
  for (const [query, expected] of [
    ['?h=regalo', stripTags(settings.heading_regalo)],
    ['?h=relax', stripTags(settings.heading_relax)],
    ['?h=magia', defaultTitle],
    ['?h=qualsiasi', defaultTitle],
    ['?h=__proto__', defaultTitle],
  ]) {
    const ctx = await context(browser, mobileOptions);
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html${query}`, { waitUntil: 'domcontentloaded' });
    const title = stripTags(await page.$eval('h1', (h1) => h1.innerHTML));
    record(`titolo con ${query}`, title === expected, `«${title}»`);
    await ctx.close();
  }

  // 3. Barra sticky: nascosta con la CTA della hero sullo schermo, visibile quando la CTA è fuori
  //    (dallo step 6 si nasconde anche davanti alle CTA di offerta e chiusura, data-luna-final-cta)
  for (const height of [844, 560]) {
    const ctx = await context(browser, { ...mobileOptions, viewport: { width: 390, height } });
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const state = () =>
      page.evaluate(() => {
        const onScreen = (element) => {
          const rect = element.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight;
        };
        return {
          ctaOnScreen: onScreen(document.querySelector('[data-luna-hero-cta]')),
          finalOnScreen: [...document.querySelectorAll('[data-luna-final-cta]')].some(onScreen),
          visible: document.querySelector('[data-luna-sticky]').classList.contains('is-visible'),
        };
      });
    const atLoad = await state();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);
    const atEnd = await state();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const atTop = await state();
    const consistent = [atLoad, atEnd, atTop].every((item) => item.visible === (!item.ctaOnScreen && !item.finalOnScreen));
    record(
      `barra sticky a 390×${height}`,
      consistent,
      `al caricamento ${atLoad.visible ? 'visibile' : 'nascosta'} (CTA ${atLoad.ctaOnScreen ? 'sullo schermo' : 'sotto la piega'}), ` +
        `in fondo ${atEnd.visible ? 'visibile' : 'nascosta'} (CTA ${atEnd.ctaOnScreen ? 'sullo schermo' : 'superata'}` +
        `${atEnd.finalOnScreen ? ', CTA finale sullo schermo' : ''}), ` +
        `di nuovo in cima ${atTop.visible ? 'visibile' : 'nascosta'}`
    );
    await ctx.close();
  }

  // 4. Movimento ridotto: lampada accesa da subito e ferma
  {
    const ctx = await context(browser, { ...mobileOptions, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    const state = await page.evaluate(() => ({
      checked: document.querySelector('[data-luna-switch]').getAttribute('aria-checked'),
      power: getComputedStyle(document.querySelector('[data-luna-stage]')).getPropertyValue('--luna-power').trim(),
      levitation: getComputedStyle(document.querySelector('.luna-lamp__moon')).animationName,
      sheen: document.querySelector('.luna-lamp__sheen')
        ? getComputedStyle(document.querySelector('.luna-lamp__sheen')).animationName
        : 'none',
    }));
    record(
      'movimento ridotto',
      state.checked === 'true' && state.power === '1' && state.levitation === 'none' && state.sheen === 'none',
      `aria-checked ${state.checked}, --luna-power ${state.power}, levitazione ${state.levitation}, riflesso ${state.sheen}`
    );
    await ctx.close();
  }

  // 5. Form, CTA, un solo H1, JSON-LD, immagini della hero
  {
    const ctx = await context(browser, mobileOptions);
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const forms = document.querySelectorAll('form#luna-buy-form');
      const form = forms[0];
      const field = (name) => (form && form.elements[name] ? form.elements[name].value : null);
      const ctas = [...document.querySelectorAll('[data-luna-cta]')];
      const resources = performance.getEntriesByType('resource');
      const paint = performance.getEntriesByType('paint').find((entry) => entry.name === 'first-contentful-paint');
      const layer = (pattern) => resources.filter((entry) => pattern.test(entry.name));
      const initial = layer(/luna-(moon|base)-off-\d+\.webp/);
      const deferred = layer(/luna-(moon|base)-on-\d+\.webp/);
      return {
        forms: forms.length,
        id: field('id'),
        quantity: field('quantity'),
        returnTo: field('return_to'),
        express: Boolean(form && form.querySelector('.shopify-payment-button')),
        ctas: ctas.length,
        // button.form.id restituirebbe il campo name="id" del form: si legge l'attributo
        ctasOnForm: ctas.filter((button) => button.form && button.form.getAttribute('id') === 'luna-buy-form').length,
        h1: document.querySelectorAll('h1').length,
        jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
        fcp: paint ? Math.round(paint.startTime) : null,
        initialKb: initial.reduce((sum, entry) => sum + (entry.encodedBodySize || entry.transferSize || 0), 0) / 1024,
        initialCount: initial.length,
        deferredStart: deferred.length ? Math.round(Math.min(...deferred.map((entry) => entry.startTime))) : null,
      };
    });
    record(
      'form #luna-buy-form',
      info.forms === 1 && /^\d+$/.test(info.id || '') && info.quantity === '1' && info.returnTo === '/checkout' && info.express,
      `${info.forms} form, id=${info.id}, quantity=${info.quantity}, return_to=${info.returnTo}, pagamento rapido: ${info.express}`
    );
    record('ogni CTA punta a #luna-buy-form', info.ctas > 0 && info.ctas === info.ctasOnForm, `${info.ctasOnForm}/${info.ctas} CTA`);
    record('un solo H1 e un solo JSON-LD', info.h1 === 1 && info.jsonLd === 1, `${info.h1} H1, ${info.jsonLd} JSON-LD`);
    record(
      `lampada della hero ≤ ${HERO_LCP_KB} KB, l'altro stato dopo il paint`,
      info.initialCount === 2 &&
        info.initialKb <= HERO_LCP_KB &&
        info.fcp !== null &&
        info.deferredStart !== null &&
        info.deferredStart >= info.fcp,
      `stato iniziale: ${info.initialCount} immagini, ${info.initialKb.toFixed(1)} KB; primo paint a ${info.fcp} ms, stato acceso richiesto a ${info.deferredStart} ms`
    );
    await ctx.close();
  }

  // 6. Nessun prezzo scritto a mano nei file luna
  const prices = hardcodedPrices();
  record(
    'nessun prezzo scritto a mano',
    prices.found.length === 0,
    prices.found.length ? prices.found.join(' | ') : `${prices.files} file luna controllati`
  );

  return results;
}

/* ---------------------------------------------------------------- step 4 */
const STAGE = '[data-luna-moon3d-stage]';

/** Porta il palco 3D a `gap` px sotto il bordo inferiore della finestra (negativo: dentro lo schermo). */
const scrollStageTo = (page, gap) =>
  page.evaluate(({ selector, gap }) => {
    const top = document.querySelector(selector).getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, top - window.innerHeight - gap));
  }, { selector: STAGE, gap });

const centerStage = (page) =>
  page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: 'center' }), STAGE);

/** Istruzioni della sezione 3D: quali parti si vedono (§8). */
const instructions = (page) =>
  page.evaluate(() => {
    const paragraph = document.querySelector('[data-luna-moon3d] .luna-lead');
    const shown = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).display !== 'none');
    return {
      paragraph: shown(paragraph),
      drag: shown(paragraph && paragraph.querySelector('.luna-moon3d__drag-text')),
      button: shown(paragraph && paragraph.querySelector('span:not(.luna-moon3d__drag-text)')),
      switchButton: shown(document.querySelector('[data-luna-moon3d-switch]')),
    };
  });
const describe = (text) =>
  `istruzioni: ${text.paragraph ? `${text.drag ? '«Trascina…» + ' : ''}${text.button ? '«Con il pulsante…»' : ''}` : 'nascoste'}` +
  `, pulsante ${text.switchButton ? 'visibile' : 'nascosto'}`;

/** Percentuale di pixel chiari (luminanza > 60) in uno screenshot PNG, decodificato nel browser. */
const brightShare = (page, png) =>
  page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let bright = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2] > 60) bright += 1;
    }
    return (bright / (data.length / 4)) * 100;
  }, `data:image/png;base64,${png.toString('base64')}`);

async function moon3dChecks(browser, baseUrl) {
  const results = [];
  const record = (name, ok, detail = '') => results.push({ name, ok, detail });
  const wait3d = (page) =>
    page.waitForSelector(`${STAGE}.is-3d`, { timeout: 25000 }).then(() => true, () => false);

  // 1 e 2. A 390×844: niente Three.js prima di avvicinarsi; a 400 px dal viewport parte, poi un canvas WebGL disegnato
  {
    const ctx = await context(browser, mobileOptions);
    const page = await ctx.newPage();
    const problems = [];
    watchProblems(page, '', problems);
    const requests = [];
    page.on('request', (request) => IS_3D.test(request.url()) && requests.push(request.url().split('/').pop()));
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const distance = await page.evaluate(
      (selector) => Math.round(document.querySelector(selector).getBoundingClientRect().top - window.innerHeight),
      STAGE
    );
    const atLoad = requests.length;
    await scrollStageTo(page, 700);
    await page.waitForTimeout(1000);
    const at700 = requests.length;
    await scrollStageTo(page, 300);
    await page.waitForTimeout(1000);
    const at300 = [...requests];
    record(
      'Three.js non scaricato prima di avvicinarsi',
      atLoad === 0 && at700 === 0 && at300.some((name) => name.startsWith('luna-moon3d.js')),
      `palco a ${distance} px sotto lo schermo: ${atLoad} richieste 3D al caricamento, ${at700} a 700 px, ` +
        `a 300 px: ${at300.join(', ') || 'nessuna'}`
    );

    await centerStage(page);
    const ready = await wait3d(page);
    await page.waitForTimeout(1500); // dissolvenza dell'immagine di ripiego
    const state = await page.evaluate((selector) => {
      const stage = document.querySelector(selector);
      const canvas = stage.querySelector('canvas');
      return {
        renderer: stage.dataset.lunaRenderer || '',
        size: `${canvas.width}×${canvas.height}`,
        canvasOpacity: getComputedStyle(canvas).opacity,
        fallbackOpacity: getComputedStyle(stage.querySelector('.luna-moon3d__fallback')).opacity,
        threeModules: performance.getEntriesByType('resource').filter((entry) => /luna-three/.test(entry.name)).length,
      };
    }, STAGE);
    const share = ready ? await brightShare(page, await page.locator(`${STAGE} canvas`).screenshot()) : 0;
    const text3d = await instructions(page);
    record(
      'avvicinandosi compare un canvas WebGL disegnato',
      ready && /^webgl2?$/.test(state.renderer) && state.canvasOpacity === '1' && state.fallbackOpacity === '0' &&
        state.threeModules === 1 && share > 8 && text3d.drag && text3d.button && !problems.length,
      `${ready ? 'is-3d' : '3D non pronto'}, renderer ${state.renderer || '—'}, canvas ${state.size}, ` +
        `immagine di ripiego a opacità ${state.fallbackOpacity}, pixel chiari ${share.toFixed(1)}%, ${describe(text3d)}` +
        (problems.length ? ` · ${problems.join(' | ')}` : '')
    );

    // 5. Swipe verticale sul canvas: la pagina scorre (touch-action: pan-y). Tocchi veri via CDP:
    //    Input.synthesizeScrollGesture in Chromium headless non fa scorrere nulla, nemmeno fuori dal canvas.
    //    Prova del contrario fatta a mano: con touch-action: none lo stesso swipe lascia la pagina ferma.
    const point = await page.evaluate((selector) => {
      const canvas = document.querySelector(`${selector} canvas`);
      const rect = canvas.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height * 0.4);
      return { x, y, onCanvas: document.elementFromPoint(x, y) === canvas, touchAction: getComputedStyle(canvas).touchAction };
    }, STAGE);
    const before = await page.evaluate(() => window.scrollY);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
    for (let step = 1; step <= 12; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x, y: point.y - step * 25 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => window.scrollY);
    record(
      'swipe sul canvas: la pagina scorre',
      point.onCanvas && point.touchAction === 'pan-y' && after - before > 150,
      `dito sul canvas: ${point.onCanvas}, touch-action ${point.touchAction}, scrollY ${Math.round(before)}→${Math.round(after)}`
    );
    await ctx.close();
  }

  // 3. Con ?luna3d=0: l'immagine della lampada accesa, nessun file 3D scaricato; l'interruttore la spegne
  {
    const ctx = await context(browser, mobileOptions);
    const page = await ctx.newPage();
    const requests = [];
    page.on('request', (request) => IS_3D.test(request.url()) && requests.push(request.url().split('/').pop()));
    await page.goto(`${baseUrl}/index.html?luna3d=0`, { waitUntil: 'networkidle' });
    await centerStage(page);
    await page.waitForTimeout(1500);
    const state = await page.evaluate((selector) => {
      const stage = document.querySelector(selector);
      const image = stage.querySelector('.luna-moon3d__fallback img');
      const rect = image.getBoundingClientRect();
      return {
        classes: stage.className,
        loaded: image.complete && image.naturalWidth > 0,
        opacity: getComputedStyle(stage.querySelector('.luna-moon3d__fallback')).opacity,
        size: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
        alt: image.alt,
        filter: getComputedStyle(image).filter,
      };
    }, STAGE);
    const textFallback = await instructions(page);
    await page.click('[data-luna-moon3d-switch]');
    await page.waitForTimeout(1200);
    const off = await page.evaluate((selector) => ({
      checked: document.querySelector('[data-luna-moon3d-switch]').getAttribute('aria-checked'),
      filter: getComputedStyle(document.querySelector(`${selector} .luna-moon3d__fallback img`)).filter,
    }), STAGE);
    record(
      'con ?luna3d=0 resta l\'immagine',
      /is-fallback/.test(state.classes) && !/is-3d/.test(state.classes) && state.loaded && state.opacity === '1' &&
        Boolean(state.alt) && requests.length === 0 && off.checked === 'false' && off.filter !== state.filter &&
        textFallback.paragraph && !textFallback.drag && textFallback.button && textFallback.switchButton,
      `immagine caricata: ${state.loaded}, ${state.size}, opacità ${state.opacity}, richieste 3D: ${requests.length}; ` +
        `interruttore spento: ${state.filter} → ${off.filter}; ${describe(textFallback)}`
    );
    await ctx.close();
  }

  // 3b. Senza JavaScript: lampada accesa nella foto, istruzioni e pulsante nascosti, niente 3D
  {
    const ctx = await context(browser, { ...mobileOptions, javaScriptEnabled: false });
    const page = await ctx.newPage();
    const requests = [];
    page.on('request', (request) => IS_3D.test(request.url()) && requests.push(request.url().split('/').pop()));
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await centerStage(page);
    await page.waitForTimeout(800);
    const text = await instructions(page);
    const filter = await page.$eval(`${STAGE} .luna-moon3d__fallback img`, (image) => getComputedStyle(image).filter);
    record(
      'senza JavaScript: foto accesa, istruzioni nascoste',
      !text.paragraph && !text.switchButton && filter === 'brightness(1) saturate(1)' && requests.length === 0,
      `${describe(text)}, foto ${filter}, richieste 3D: ${requests.length}`
    );
    await ctx.close();
  }

  // 4. Tonalità: cambiarla nella hero cambia anche la luna 3D (e viceversa). Pagina di prova con due tonalità
  {
    const ctx = await context(browser, mobileOptions);
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/due-tonalita.html`, { waitUntil: 'networkidle' });
    await centerStage(page);
    const ready = await wait3d(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const heroTone = page.locator('[data-luna-tones] [data-luna-tone]').nth(1);
    const expected = (await heroTone.getAttribute('data-luna-tone')).toLowerCase();
    await heroTone.click();
    await page.waitForTimeout(800);
    const read = () =>
      page.evaluate((selector) => {
        const stage = document.querySelector(selector);
        const section = stage.closest('[data-luna-moon3d]');
        const checked = section.querySelector('[data-luna-tone][aria-checked="true"]');
        const hero = document.querySelector('[data-luna-stage]');
        return {
          colour: (stage.dataset.lunaColour || '').toLowerCase(),
          light: section.style.getPropertyValue('--luna-light').trim().toLowerCase(),
          power: stage.dataset.lunaPower,
          chip: checked ? checked.getAttribute('data-luna-tone').toLowerCase() : '',
          heroLight: getComputedStyle(hero).getPropertyValue('--luna-light').trim().toLowerCase(),
        };
      }, STAGE);
    const fromHero = await read();
    await centerStage(page);
    const firstTone = page.locator('[data-luna-moon3d] [data-luna-tone]').first();
    const back = (await firstTone.getAttribute('data-luna-tone')).toLowerCase();
    await firstTone.click();
    await page.waitForTimeout(800);
    const fromMoon = await read();
    record(
      'tonalità della hero → luna 3D (e ritorno)',
      ready &&
        fromHero.colour === expected && fromHero.light === expected && fromHero.chip === expected && fromHero.power === '1' &&
        fromMoon.colour === back && fromMoon.heroLight === back,
      `hero ${expected} → 3D ${fromHero.colour} (--luna-light ${fromHero.light}, chip ${fromHero.chip}); ` +
        `3D ${back} → hero ${fromMoon.heroLight}`
    );
    await ctx.close();
  }

  // 6. Trascinamento con il mouse: la luna ruota, anche con movimento ridotto (che toglie solo la rotazione automatica)
  {
    const ctx = await context(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await centerStage(page);
    const ready = await wait3d(page);
    const box = await page.locator(`${STAGE} canvas`).boundingBox();
    const rotation = () => page.$eval(STAGE, (stage) => Number(stage.dataset.lunaRotation));
    const before = await rotation();
    const hintBefore = await page.$eval(`${STAGE} [data-luna-moon3d-hint]`, (hint) => hint.classList.contains('is-hidden'));
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4 + 140, box.y + box.height * 0.4, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await rotation();
    const hintAfter = await page.$eval(`${STAGE} [data-luna-moon3d-hint]`, (hint) => hint.classList.contains('is-hidden'));
    record(
      'trascinamento: la luna ruota (movimento ridotto)',
      ready && after - before > 0.5 && !hintBefore && hintAfter,
      `rotazione ${before.toFixed(2)} → ${after.toFixed(2)} rad, suggerimento nascosto: ${hintBefore} → ${hintAfter}`
    );
    await ctx.close();
  }

  // 8. Desktop: anche con la sezione già vicina, la 3D parte dopo la hero; peso del primo caricamento con la 3D
  {
    const ctx = await context(browser, { viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      document.addEventListener('luna:hero-lit', () => {
        window.__lunaHeroLit = performance.now();
      });
    });
    const page = await ctx.newPage();
    const responses = [];
    page.on('response', (response) =>
      responses.push(
        response.body().then(
          (body) => ({ url: response.url(), type: response.headers()['content-type'] || '', body }),
          () => null
        )
      )
    );
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    const ready = await wait3d(page);
    await page.waitForLoadState('networkidle');
    const timing = await page.evaluate((selector) => {
      const resources = performance.getEntriesByType('resource');
      const start = (pattern) => {
        const found = resources.filter((entry) => pattern.test(entry.name));
        return found.length ? Math.round(Math.min(...found.map((entry) => entry.startTime))) : null;
      };
      const lamp = resources.filter((entry) => /luna-(moon|base)-(on|off)-\d+\.webp/.test(entry.name));
      const stage = document.querySelector(selector);
      return {
        near: Math.round(stage.getBoundingClientRect().top - window.innerHeight),
        heroImages: lamp.length,
        heroDone: lamp.length ? Math.round(Math.max(...lamp.map((entry) => entry.responseEnd))) : null,
        lit: window.__lunaHeroLit ? Math.round(window.__lunaHeroLit) : null,
        module: start(/luna-moon3d\.js/),
        three: start(/luna-three/),
        textures: start(/luna-moon-color/),
      };
    }, STAGE);
    const items = (await Promise.all(responses)).filter(Boolean);
    const textual = /javascript|css|html|json|svg|text/;
    const sum = (list, packed) =>
      list.reduce((total, item) => total + (packed && textual.test(item.type) ? gzipSync(item.body, { level: 9 }).length : item.body.length), 0) / 1024;
    const threeD = items.filter((item) => IS_3D.test(item.url));
    const afterHero = timing.module !== null && timing.heroDone !== null && timing.module >= timing.heroDone && timing.three >= timing.heroDone;
    record(
      'desktop: la 3D parte dopo la hero',
      ready && timing.near < 400 && afterHero,
      `palco a ${timing.near} px dallo schermo; ${timing.heroImages} immagini della lampada arrivate a ${timing.heroDone} ms, ` +
        `lampada accesa a ${timing.lit ?? '—'} ms; luna-moon3d.js a ${timing.module} ms, Three.js a ${timing.three} ms, ` +
        `texture a ${timing.textures} ms`
    );
    record(
      'desktop: peso del primo caricamento con la 3D',
      ready,
      `${sum(items).toFixed(0)} KB come li serve l'anteprima (senza compressione), circa ${sum(items, true).toFixed(0)} KB ` +
        `compressi con gzip come dal CDN di Shopify; di cui 3D ${sum(threeD).toFixed(0)} KB / ${sum(threeD, true).toFixed(0)} KB ` +
        `(${threeD.map((item) => item.url.split('/').pop()).join(', ')})`
    );
    await ctx.close();
  }

  // 7. Editor del tema: shopify:section:unload libera WebGL, shopify:section:load rimonta la luna 3D
  {
    const ctx = await context(browser, { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const problems = [];
    watchProblems(page, '', problems);
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await centerStage(page);
    const mounted = await wait3d(page);
    const fire = (type) =>
      page.evaluate((name) => {
        const wrapper = document.querySelector('[data-luna-moon3d]').closest('.shopify-section');
        const sectionId = wrapper.id.replace('shopify-section-', '');
        wrapper.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: { sectionId } }));
      }, type);
    const read = () => page.$eval(STAGE, (stage) => `${stage.className.replace('luna-moon3d__stage', '').trim() || '—'} ${stage.dataset.lunaRenderer || ''}`.trim());
    await fire('shopify:section:unload');
    await page.waitForTimeout(300);
    const unloaded = await read();
    await fire('shopify:section:load');
    const remounted = await wait3d(page);
    const reloaded = await read();
    record(
      'editor: unload smonta, load rimonta',
      mounted && unloaded === '—' && remounted && !problems.length,
      `montata → unload «${unloaded}» → load «${reloaded}»${problems.length ? ` · ${problems.join(' | ')}` : ''}`
    );
    await ctx.close();
  }

  return results;
}

/* ---------------------------------------------------------------- step 5 */
function templateSection(type) {
  const template = JSON.parse(readFileSync(join(paths.theme, 'templates', 'product.luna.json'), 'utf8'));
  return Object.entries(template.sections).find(([, section]) => section.type === type) || [null, null];
}

/** Istante preciso di un'ora italiana ('2026-12-03', '23:30'), con l'ora legale giusta. */
function romeInstant(day, time) {
  const wall = Date.parse(`${day}T${time}:00Z`);
  const parts = (instant) =>
    Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Rome', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }).formatToParts(new Date(instant)).map((part) => [part.type, part.value])
    );
  let instant = wall;
  for (let pass = 0; pass < 2; pass += 1) {
    const p = parts(instant);
    instant += wall - Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  }
  return new Date(instant);
}

const nextDay = (day) => new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

async function persuasionChecks(browser, baseUrl) {
  const results = [];
  const record = (name, ok, detail = '') => results.push({ name, ok, detail });

  // 1. Confronto a 360 px: schede, niente scroll orizzontale
  {
    const ctx = await context(browser, { ...mobileOptions, viewport: { width: 360, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelector('[data-luna-comparison]').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(800);
    const state = await page.evaluate(() => {
      const box = document.querySelector('[data-luna-comparison]');
      const table = box.querySelector('table');
      const outside = [...box.querySelectorAll('*')].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width && (rect.left < -1 || rect.right > window.innerWidth + 1);
      });
      return {
        page: document.documentElement.scrollWidth,
        box: `${box.scrollWidth}/${box.clientWidth}`,
        table: `${table.scrollWidth}/${table.clientWidth}`,
        overflow: box.scrollWidth > box.clientWidth || table.scrollWidth > table.clientWidth,
        outside: outside.length,
        rows: box.querySelectorAll('tbody tr').length,
        display: getComputedStyle(box.querySelector('tbody tr')).display,
      };
    });
    record(
      'confronto a 360 px senza scroll orizzontale',
      state.page === 360 && !state.overflow && state.outside === 0 && state.rows > 0 && state.display === 'grid',
      `pagina ${state.page} px, confronto ${state.box}, tabella ${state.table}, ${state.rows} schede (${state.display}), ` +
        `elementi fuori dallo schermo: ${state.outside}`
    );
    await ctx.close();
  }

  // 2. Recensioni senza blocchi: fuori dall'editor nessun markup; nell'editor il riquadro
  {
    const [key] = templateSection('luna-reviews');
    const wrapper = `#shopify-section-template--20261023__${key}`;
    const read = async (pageName) => {
      const ctx = await context(browser, mobileOptions);
      const page = await ctx.newPage();
      await page.goto(`${baseUrl}/${pageName}`, { waitUntil: 'networkidle' });
      const state = await page.$eval(wrapper, (element) => ({
        html: element.innerHTML.trim(),
        height: Math.round(element.getBoundingClientRect().height),
        placeholder: element.querySelector('.luna-reviews__placeholder')?.textContent.trim() || '',
      }));
      await ctx.close();
      return state;
    };
    const live = await read('index.html');
    const editor = await read('editor.html');
    record(
      '§10 · recensioni senza blocchi: la sezione non stampa nulla',
      live.html === '' && live.height === 0,
      `fuori dall'editor: ${live.html.length} caratteri di markup, altezza ${live.height} px`
    );
    record(
      '§10 · recensioni nell\'editor: riquadro per il blocco dell\'app',
      editor.placeholder.startsWith('Aggiungi qui il blocco della tua app recensioni') && editor.height > 0,
      `«${editor.placeholder}», altezza ${editor.height} px`
    );
  }

  // 3. Riga di Natale: si vede fino al giorno impostato compreso (ora italiana), poi sparisce
  {
    const [, gift] = templateSection('luna-gift');
    const deadline = gift?.settings?.christmas_deadline || '';
    const moments = [
      ['oggi', null, true],
      ['ultimo giorno alle 23:30', deadline && romeInstant(deadline, '23:30'), true],
      ['giorno dopo alle 00:30', deadline && romeInstant(nextDay(deadline), '00:30'), false],
    ];
    const seen = [];
    let ok = Boolean(deadline);
    for (const [label, when, expected] of moments) {
      const ctx = await context(browser, mobileOptions);
      const page = await ctx.newPage();
      if (when) await page.clock.setFixedTime(when);
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
      const state = await page.$eval('[data-luna-deadline]', (line) => ({
        visible: !line.hidden && line.getClientRects().length > 0,
        text: line.textContent.replace(/\s+/g, ' ').trim(),
      }));
      // «oggi» vale solo se oggi è prima della scadenza; altrimenti la riga deve mancare
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
      const want = label === 'oggi' ? today <= deadline : expected;
      if (state.visible !== want) ok = false;
      seen.push(`${label}: ${state.visible ? `visibile («${state.text}»)` : 'nascosta'}`);
      await ctx.close();
    }
    record('riga di Natale prima e dopo la scadenza', ok, `scadenza ${deadline || 'non impostata'} · ${seen.join(' · ')}`);
  }

  // 4. Come funziona: la luna sale dalla base, si accende e comincia a levitare
  {
    const read = (page) =>
      page.evaluate(() => {
        const stage = document.querySelector('[data-luna-how-stage]');
        const matrix = new DOMMatrixReadOnly(getComputedStyle(stage.querySelector('.luna-how__rise')).transform);
        return {
          rise: Math.round(matrix.m42 * 10) / 10,
          lit: Number(getComputedStyle(stage.querySelector('.luna-how__layer.luna-how__lit')).opacity),
          float: getComputedStyle(stage.querySelector('.luna-how__float')).animationName,
          classes: stage.className.replace('luna-how__stage', '').trim(),
        };
      });
    const place = (page, fraction) =>
      page.evaluate((f) => {
        const stage = document.querySelector('[data-luna-how-stage]');
        window.scrollTo(0, stage.getBoundingClientRect().top + window.scrollY - window.innerHeight * f);
      }, fraction);
    const lines = [];
    let ok = true;

    // a. animation-timeline: view() (Chromium)
    {
      const ctx = await context(browser, mobileOptions);
      const page = await ctx.newPage();
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
      const supported = await page.evaluate(() => CSS.supports('animation-timeline: view()'));
      await place(page, 0.95);
      await page.waitForTimeout(400);
      const start = await read(page);
      await place(page, 0.12);
      await page.waitForTimeout(400);
      const end = await read(page);
      if (!(supported && start.rise > 15 && start.lit === 0 && end.rise === 0 && end.lit === 1)) ok = false;
      lines.push(`view(): appena entra +${start.rise} px e spenta, in alto ${end.rise} px e accesa (${end.lit})`);
      await ctx.close();
    }
    // b. ripiego senza view(): IntersectionObserver e classi (Safari prima della 26, Firefox)
    {
      const ctx = await context(browser, mobileOptions);
      await ctx.addInitScript(() => {
        const supports = CSS.supports.bind(CSS);
        CSS.supports = (...args) => (args.join(' ').includes('animation-timeline') ? false : supports(...args));
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = '.luna-how__stage,.luna-how__rise,.luna-how__lit{animation:none!important;view-timeline:none!important}';
          document.head.append(style);
        });
      });
      const page = await ctx.newPage();
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
      const start = await read(page);
      await place(page, 0.25);
      await page.waitForTimeout(2800);
      const end = await read(page);
      if (!(start.classes === 'is-animated' && start.rise > 15 && start.lit === 0 &&
        /is-assembled/.test(end.classes) && end.rise === 0 && end.lit === 1 && end.float === 'luna-how-float')) ok = false;
      lines.push(`ripiego: «${start.classes}» +${start.rise} px spenta → «${end.classes}» ${end.rise} px, accesa, levitazione ${end.float}`);
      await ctx.close();
    }
    // c. movimento ridotto: subito lo stato finale, ferma
    {
      const ctx = await context(browser, { ...mobileOptions, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
      await place(page, 0.95);
      await page.waitForTimeout(300);
      const state = await read(page);
      if (!(state.rise === 0 && state.lit === 1 && state.float === 'none' && state.classes === '')) ok = false;
      lines.push(`movimento ridotto: ${state.rise} px, accesa (${state.lit}), levitazione ${state.float}`);
      await ctx.close();
    }
    record('come funziona: la lampada si monta mentre scorri', ok, lines.join(' · '));
  }

  // 5. Benefici: tre colonne della stessa altezza su desktop
  {
    const ctx = await context(browser, { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await scrollThrough(page);
    const cards = await page.$$eval('.luna-benefit', (list) =>
      list.map((card) => {
        const rect = card.getBoundingClientRect();
        return { top: Math.round(rect.top + window.scrollY), height: Math.round(rect.height), width: Math.round(rect.width) };
      })
    );
    const same = (key) => cards.every((card) => Math.abs(card[key] - cards[0][key]) <= 1);
    record(
      'benefici: tre colonne della stessa altezza a 1440 px',
      cards.length === 3 && same('top') && same('height') && same('width'),
      cards.map((card) => `${card.width}×${card.height}`).join(', ')
    );
    await ctx.close();
  }

  // 6. Passaggi morbidi tra le sezioni: luminosità dello sfondo lungo il margine sinistro, riga per riga
  {
    const ctx = await context(browser, mobileOptions);
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await scrollThrough(page);
    await stretchSky(page);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const strip = await page.screenshot({ fullPage: true, clip: { x: 2, y: 0, width: 12, height } });
    const result = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context2d = canvas.getContext('2d');
      context2d.drawImage(image, 0, 0);
      const { data, width } = context2d.getImageData(0, 0, canvas.width, canvas.height);
      const rows = [];
      for (let y = 0; y < canvas.height; y += 1) {
        const values = [];
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          values.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
        }
        values.sort((a, b) => a - b);
        rows.push(values[Math.floor(values.length / 2)]); // mediana: le stelle non contano
      }
      let max = 0;
      let at = 0;
      for (let y = 0; y + 2 < rows.length; y += 1) {
        const jump = Math.abs(rows[y + 2] - rows[y]);
        if (jump > max) {
          max = jump;
          at = y;
        }
      }
      return { max: Math.round(max * 10) / 10, at, rows: rows.length };
    }, `data:image/png;base64,${strip.toString('base64')}`);
    record(
      'passaggi morbidi tra le sezioni (390 px)',
      result.max <= 6,
      `salto massimo di luminosità dello sfondo ${result.max}/255 su 2 px (a ${result.at} px), su ${result.rows} px di pagina`
    );
    await ctx.close();
  }

  return results;
}

/* ---------------------------------------------------------------- step 6 */
async function offerChecks(browser, baseUrl) {
  const results = [];
  const record = (name, ok, detail = '') => results.push({ name, ok, detail });
  const { variant } = buildData(new Set());
  const expectedPct = Math.round(((variant.compare_at_price - variant.price) * 100) / variant.compare_at_price);
  const expectedPerDay = Math.floor(variant.price / 365) + 1;
  const expectedSave = `€${((variant.compare_at_price - variant.price) / 100).toFixed(2).replace('.', ',')}`;

  const readOffer = (page) =>
    page.evaluate(() => {
      const offer = document.querySelector('.luna-offer');
      const shown = (element) => Boolean(element && !element.closest('[hidden]') && element.getClientRects().length);
      const text = (selector) => offer.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() || '';
      return {
        badge: shown(offer.querySelector('.luna-offer__badge')) ? text('.luna-offer__badge') : '',
        title: text('h2'),
        heroPrice: document.querySelector('.luna-price__now')?.textContent.trim() || '',
        compare: shown(offer.querySelector('.luna-price__was')) ? text('.luna-price__was s') : '',
        save: shown(offer.querySelector('.luna-price__save')) ? text('.luna-price__save') : '',
        omnibus: shown(offer.querySelector('.luna-price__omnibus')) ? text('.luna-price__omnibus') : '',
        perDay: shown(offer.querySelector('[data-luna-per-day]')) ? text('[data-luna-per-day]') : '',
        bigPrice: offer.querySelectorAll('.luna-price__now').length,
      };
    });

  // 1. Con il barrato: badge, risparmio, riga Omnibus e prezzo a sera calcolati dai prezzi di Shopify
  {
    const ctx = await context(browser, mobileOptions);
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    const offer = await readOffer(page);
    record(
      'offerta: percentuale, risparmio e prezzo a sera dai prezzi finti',
      offer.badge.endsWith(`−${expectedPct}%`) && offer.title.includes(offer.heroPrice) && offer.heroPrice !== '' &&
        offer.compare !== '' && offer.save.endsWith(expectedSave) && offer.omnibus.endsWith(offer.compare) &&
        offer.perDay.includes(`${expectedPerDay} centesimi`) && offer.bigPrice === 0,
      `«${offer.badge}» (atteso −${expectedPct}%), «${offer.title}», barrato ${offer.compare}, «${offer.save}» (atteso ${expectedSave}), ` +
        `«${offer.omnibus}», «${offer.perDay}» (atteso ${expectedPerDay})`
    );
    await ctx.close();
  }

  // 2. Senza barrato: niente badge, niente risparmio, niente riga Omnibus
  {
    const ctx = await context(browser, mobileOptions);
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/senza-barrato.html`, { waitUntil: 'networkidle' });
    const offer = await readOffer(page);
    record(
      'offerta con il barrato vuoto (override): niente badge, risparmio né Omnibus',
      !offer.badge && !offer.compare && !offer.save && !offer.omnibus && offer.title.includes(offer.heroPrice) && offer.perDay !== '',
      `badge «${offer.badge}», barrato «${offer.compare}», risparmio «${offer.save}», Omnibus «${offer.omnibus}»; ` +
        `restano «${offer.title}» e «${offer.perDay}»`
    );
    await ctx.close();
  }

  // 3. Countdown: non c'è da spento né con la data passata; c'è con la data futura e alla fine sparisce per sempre
  {
    const futureOverride = JSON.parse(readFileSync(join(paths.preview, 'overrides', 'countdown-futuro.json'), 'utf8'));
    const end = new Date(futureOverride.sezioni.offer.settings.countdown_end);
    const lines = [];
    let ok = true;
    const state = (page) =>
      page.evaluate(() => {
        const box = document.querySelector('[data-luna-countdown]');
        return {
          present: Boolean(box),
          visible: Boolean(box && !box.hidden && box.getClientRects().length > 0),
          clock: box ? [...box.querySelectorAll('.luna-countdown__value')].map((value) => value.textContent).join(':') : '',
        };
      });
    for (const [label, pageName, expected] of [
      ['spento (template)', 'index.html', false],
      ['data passata', 'countdown-passato.html', false],
      ['data futura', 'countdown-futuro.html', true],
    ]) {
      const ctx = await context(browser, mobileOptions);
      const page = await ctx.newPage();
      await page.goto(`${baseUrl}/${pageName}`, { waitUntil: 'networkidle' });
      const now = await state(page);
      if (now.visible !== expected) ok = false;
      lines.push(`${label}: ${now.visible ? `visibile (${now.clock})` : now.present ? 'nascosto' : 'assente'}`);
      await ctx.close();
    }
    // Con la data futura: 3 secondi prima della fine si vede, allo zero sparisce e un minuto dopo è ancora nascosto
    {
      const ctx = await context(browser, mobileOptions);
      const page = await ctx.newPage();
      await page.clock.install({ time: new Date(end.getTime() - 3000) });
      await page.goto(`${baseUrl}/countdown-futuro.html`, { waitUntil: 'domcontentloaded' });
      const before = await state(page);
      await page.clock.runFor(4000);
      const after = await state(page);
      await page.clock.runFor(60000);
      const later = await state(page);
      // Durante il caricamento l'orologio simulato avanza: restano 2 o 3 secondi
      if (!(before.visible && /^00:00:00:0[23]$/.test(before.clock) && !after.visible && !later.visible)) ok = false;
      lines.push(`alla scadenza: prima ${before.visible ? `visibile (${before.clock})` : 'nascosto'}, ` +
        `poi ${after.visible ? 'visibile' : 'sparito'}, un minuto dopo ${later.visible ? 'ripartito' : 'ancora nascosto'}`);
      await ctx.close();
    }
    // Senza JavaScript non si vede mai
    {
      const ctx = await context(browser, { ...mobileOptions, javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto(`${baseUrl}/countdown-futuro.html`, { waitUntil: 'domcontentloaded' });
      const now = await state(page);
      if (now.visible) ok = false;
      lines.push(`senza JavaScript: ${now.visible ? 'visibile' : 'nascosto'}`);
      await ctx.close();
    }
    record('§10 · countdown solo con una fine reale: spento, data passata, data futura', ok, lines.join(' · '));
  }

  // 4. Garanzia e «notti di prova» solo con il reso sopra i 14 giorni (§10)
  {
    const read = async (pageName) => {
      const ctx = await context(browser, mobileOptions);
      const page = await ctx.newPage();
      await page.goto(`${baseUrl}/${pageName}`, { waitUntil: 'networkidle' });
      const state = await page.evaluate(() => {
        const guarantee = document.querySelector('.luna-offer__guarantee');
        return {
          guarantee: Boolean(guarantee),
          link: guarantee?.querySelector('a')?.getAttribute('href') || '',
          trial: (document.body.innerText.match(/notti di prova/gi) || []).length,
          final: document.querySelector('.luna-final .luna-lead')?.textContent.trim() || '',
        };
      });
      await ctx.close();
      return state;
    };
    const days30 = await read('index.html');
    const days14 = await read('reso-14.html');
    record(
      '§10 · reso di 14 giorni: niente garanzia né «notti di prova»',
      days30.guarantee && /refund/.test(days30.link) && days30.trial >= 2 && !days14.guarantee && days14.trial === 0,
      `30 giorni: garanzia ${days30.guarantee ? 'sì' : 'no'} (link ${days30.link || '—'}), «notti di prova» ×${days30.trial} · ` +
        `14 giorni: garanzia ${days14.guarantee ? 'sì' : 'no'}, «notti di prova» ×${days14.trial}, chiusura «${days14.final}»`
    );
  }

  // 5. FAQ: tutte chiuse, una alla volta, con la tastiera e anche senza JavaScript
  {
    const openState = (page) => page.$$eval('.luna-faq__item', (items) => items.map((item) => (item.open ? 1 : 0)).join(''));
    const ctx = await context(browser, mobileOptions);
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    const count = await page.locator('.luna-faq__item').count();
    const start = await openState(page);
    await page.locator('.luna-faq__question').nth(0).click();
    const first = await openState(page);
    await page.locator('.luna-faq__question').nth(4).click();
    const second = await openState(page);
    await page.locator('.luna-faq__question').nth(4).focus();
    await page.keyboard.press('Enter');
    const keyboard = await openState(page);
    await ctx.close();

    const noJs = await context(browser, { ...mobileOptions, javaScriptEnabled: false });
    const plain = await noJs.newPage();
    await plain.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    await plain.locator('.luna-faq__question').nth(2).click();
    const withoutJs = await openState(plain);
    await noJs.close();

    const closed = '0'.repeat(count);
    record(
      'FAQ: una alla volta, tastiera, senza JavaScript',
      count === 8 && start === closed && first[0] === '1' && second === `0000${'1'.padEnd(count - 4, '0')}` &&
        keyboard === closed && withoutJs[2] === '1',
      `${count} domande; aperte all'inizio ${start}, dopo un clic ${first}, dopo un altro ${second}, ` +
        `Invio sulla stessa ${keyboard}; senza JavaScript ${withoutJs}`
    );
  }

  // 6. Tre CTA in pagina più la barra sticky, tutte sullo stesso form
  {
    const ctx = await context(browser, mobileOptions);
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    const ctas = await page.$$eval('[data-luna-cta]', (buttons) =>
      buttons.map((button) => ({
        where: button.closest('[data-luna-sticky]') ? 'sticky' : button.closest('.shopify-section').id.split('__').pop(),
        form: button.getAttribute('form'),
        type: button.type,
      }))
    );
    const inPage = ctas.filter((cta) => cta.where !== 'sticky').map((cta) => cta.where);
    record(
      'tre CTA in pagina più la barra sticky',
      inPage.join(',') === 'hero,offer,final' && ctas.length === 4 &&
        ctas.every((cta) => cta.form === 'luna-buy-form' && cta.type === 'submit'),
      `${inPage.join(', ')} + ${ctas.filter((cta) => cta.where === 'sticky').length} sticky, tutte type=submit form=luna-buy-form`
    );

    // 7. La barra sticky si nasconde quando la CTA dell'offerta o quella finale sono sullo schermo
    const visibleAt = async (selector) => {
      await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), selector);
      await page.waitForTimeout(500);
      return page.$eval('[data-luna-sticky]', (bar) => bar.classList.contains('is-visible'));
    };
    const atSpecs = await visibleAt('.luna-specs');
    const atOffer = await visibleAt('.luna-offer__cta');
    const atFaq = await visibleAt('.luna-faq__item:nth-child(4)');
    const atFinal = await visibleAt('.luna-final__cta');
    record(
      'barra sticky nascosta davanti alle CTA di offerta e chiusura',
      atSpecs && !atOffer && atFaq && !atFinal,
      `specifiche ${atSpecs ? 'visibile' : 'nascosta'}, CTA dell'offerta ${atOffer ? 'visibile' : 'nascosta'}, ` +
        `FAQ ${atFaq ? 'visibile' : 'nascosta'}, CTA finale ${atFinal ? 'visibile' : 'nascosta'}`
    );
    await ctx.close();
  }

  return results;
}

/* ---------------------------------------------------------------- step 7 */
const ROME_DAY = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short' });
const FIXED_HOLIDAYS = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'];

/** Pasqua (calendario gregoriano): serve per il lunedì dell'Angelo. Calcolo indipendente da luna-landing.js. */
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day, 12);
}

function isBusinessDay(day) {
  const date = new Date(day);
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const key = `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  return !FIXED_HOLIDAYS.includes(key) && day !== easter(date.getUTCFullYear()) + 86400000;
}

/** Finestra di consegna attesa: spedizione oggi se lavorativo e prima dell'ora limite, poi +min e +max lavorativi. */
function expectedDelivery(romeDay, hour, minDays, maxDays, cutoff) {
  let day = Date.parse(`${romeDay}T12:00:00Z`);
  if (hour >= cutoff || !isBusinessDay(day)) {
    do day += 86400000; while (!isBusinessDay(day));
  }
  const add = (start, amount) => {
    let cursor = start;
    for (let left = amount; left > 0; ) {
      cursor += 86400000;
      if (isBusinessDay(cursor)) left -= 1;
    }
    return cursor;
  };
  return { ship: ROME_DAY.format(day), from: ROME_DAY.format(add(day, minDays)), to: ROME_DAY.format(add(day, maxDays)) };
}

async function deliveryChecks(browser, baseUrl) {
  const results = [];
  const hero = heroSettings();
  const min = hero.delivery_min ?? 7;
  const max = hero.delivery_max ?? 14;
  const cutoff = hero.cutoff_hour ?? 14;
  const cases = [
    ['ordine di venerdì prima dell\'ora limite', '2026-11-06', '10:00'],
    ['ordine di venerdì dopo l\'ora limite', '2026-11-06', '15:30'],
    ['ordine di sabato', '2026-11-07', '10:00'],
    ['ordine di mercoledì dopo l\'ora limite', '2026-11-04', '15:30'],
    ['ordine il giorno prima dell\'Immacolata, dopo l\'ora limite', '2026-12-07', '15:00'],
  ];
  for (const [label, day, time] of cases) {
    const ctx = await context(browser, mobileOptions);
    const page = await ctx.newPage();
    await page.clock.setFixedTime(romeInstant(day, time));
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    const shown = await page.$eval('[data-luna-delivery]', (line) => ({
      from: line.querySelector('[data-luna-date-from]')?.textContent.trim(),
      to: line.querySelector('[data-luna-date-to]')?.textContent.trim(),
      text: line.textContent.replace(/\s+/g, ' ').trim(),
    }));
    const hour = Number(time.split(':')[0]);
    const want = expectedDelivery(day, hour, min, max, cutoff);
    results.push({
      name: `consegna stimata · ${label}`,
      ok: shown.from === want.from && shown.to === want.to,
      detail: `${ROME_DAY.format(Date.parse(`${day}T12:00:00Z`))} alle ${time}, spedizione ${want.ship}: «${shown.text}» ` +
        `(attese ${want.from} e ${want.to}; ${min}–${max} giorni lavorativi, ora limite ${cutoff}:00)`,
    });
    await ctx.close();
  }
  return results;
}

/** Testo visibile e attributi letti dalle persone (alt, aria-label, title, meta) di una pagina. */
const pageWords = (page) =>
  page.evaluate(() => {
    const parts = [document.body.innerText];
    for (const element of document.querySelectorAll('[alt], [aria-label], [title], [placeholder]')) {
      for (const name of ['alt', 'aria-label', 'title', 'placeholder']) {
        if (element.hasAttribute(name)) parts.push(element.getAttribute(name));
      }
    }
    for (const meta of document.querySelectorAll('meta[name="description"], meta[property^="og:"], title')) {
      parts.push(meta.getAttribute('content') || meta.textContent);
    }
    return parts.join('\n');
  });

async function legalChecks(browser, baseUrl) {
  const results = [];
  const record = (name, ok, detail = '') => results.push({ name: `§10 · ${name}`, ok, detail });
  const open = async (pageName, options = mobileOptions) => {
    const ctx = await context(browser, options);
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/${pageName}`, { waitUntil: 'networkidle' });
    return { ctx, page };
  };
  const testPages = ['index.html', ...readdirSync(join(paths.preview, 'overrides')).filter((file) => file.endsWith('.json')).map((file) => file.replace(/\.json$/, '.html'))];

  // 1. Prezzo barrato: sempre con la riga Omnibus accanto (hero, offerta, barra sticky); senza barrato nessuna delle due
  {
    const { ctx, page } = await open('index.html');
    const blocks = await page.$$eval('[data-luna-price-block]', (list) =>
      list.map((block) => {
        const shown = (element) => Boolean(element && !element.closest('[hidden]'));
        return {
          where: block.closest('.shopify-section')?.id.split('__').pop() || '?',
          compare: shown(block.querySelector('.luna-price__was')) ? block.querySelector('.luna-price__was s').textContent.trim() : '',
          omnibus: shown(block.querySelector('.luna-price__omnibus')) ? block.querySelector('[data-luna-omnibus]').textContent.trim() : '',
        };
      })
    );
    await ctx.close();
    const plain = await open('senza-barrato.html');
    const leftovers = await plain.page.$$eval('[data-luna-sale-part]', (list) => list.filter((part) => !part.closest('[hidden]')).length);
    await plain.ctx.close();
    const paired = blocks.filter((block) => block.compare);
    record(
      'prezzo barrato sempre con la riga Omnibus',
      paired.length >= 3 && paired.every((block) => block.omnibus === block.compare) && leftovers === 0,
      `${paired.map((block) => `${block.where}: barrato ${block.compare}, Omnibus ${block.omnibus}`).join(' · ')}; ` +
        `senza barrato: ${leftovers} parti dello sconto visibili`
    );
  }

  // 2. Recensioni: niente testimonianze, voti o numeri di clienti scritti a mano (in nessuna pagina di prova)
  {
    const pattern = /★|☆|\b\d+(?:[.,]\d+)?\s*\/\s*5\b|\b\d[\d.]*\s*(?:recensioni|clienti|ordini|pezzi venduti|persone soddisfatte)\b|clienti soddisfatti|testimonianz|stelle su 5/gi;
    const found = [];
    for (const pageName of testPages) {
      const { ctx, page } = await open(pageName);
      for (const match of (await pageWords(page)).match(pattern) || []) found.push(`${pageName}: «${match}»`);
      await ctx.close();
    }
    record(
      'niente recensioni, voti o numeri di clienti scritti a mano',
      found.length === 0,
      found.length ? found.join(' · ') : `${testPages.length} pagine lette: nessuna stella, voto, numero di clienti o testimonianza`
    );
  }

  // 3. Scorte: solo dal magazzino Shopify. Senza conteggio dei pezzi nessuna riga; con 3 pezzi veri la riga c'è
  {
    const read = async (pageName) => {
      const { ctx, page } = await open(pageName);
      const state = await page.$eval('[data-luna-stock]', (line) => ({ visible: !line.hidden, text: line.textContent.trim() }));
      await ctx.close();
      return state;
    };
    const untracked = await read('index.html');
    const tracked = await read('scorte-reali.html');
    record(
      'scorte solo dal magazzino Shopify',
      !untracked.visible && untracked.text === '' && tracked.visible && tracked.text.includes('3'),
      `magazzino senza conteggio: ${untracked.visible ? `«${untracked.text}»` : 'nessuna riga'} · ` +
        `3 pezzi nel magazzino Shopify: ${tracked.visible ? `«${tracked.text}»` : 'nessuna riga'}`
    );
  }

  // 4. Niente promesse sulla salute, niente «NASA», «certificato», «brevettato»
  {
    const pattern = /\b(sonno|dormire meglio|insonnia|ansia|stress|terapi\w*|curativ\w*|benessere psicofisico|NASA|certificat\w*|brevettat\w*)\b/gi;
    const found = [];
    for (const pageName of testPages) {
      const { ctx, page } = await open(pageName);
      for (const match of (await pageWords(page)).match(pattern) || []) found.push(`${pageName}: «${match}»`);
      await ctx.close();
    }
    record(
      'niente promesse sulla salute né «NASA», «certificato», «brevettato»',
      found.length === 0,
      found.length ? found.join(' · ') : `${testPages.length} pagine lette, testi visibili e attributi alt, aria-label e title`
    );
  }

  // 5. Materiali come nella scheda del fornitore: mai «legno» da solo
  {
    const { ctx, page } = await open('index.html');
    const words = await pageWords(page);
    await ctx.close();
    const bare = (words.match(/.{0,24}\blegno\b.{0,12}/gi) || []).filter((match) => !/effetto legno/i.test(match));
    record(
      'materiali come nella scheda: mai «legno» da solo',
      bare.length === 0 && /PLA stampato in 3D/.test(words) && /ABS effetto legno chiaro/.test(words),
      bare.length
        ? bare.map((match) => `«${match.trim()}»`).join(' · ')
        : `«legno» compare ${(words.match(/\blegno\b/gi) || []).length} volte, sempre come «effetto legno»; ` +
          '«PLA stampato in 3D» e «ABS effetto legno chiaro» presenti'
    );
  }

  // 6. Scene nostre, mai le foto originali del fornitore
  {
    const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
    const supplierDir = join(paths.studio, 'input', 'luna-foto', 'fornitore');
    const supplier = new Set(readdirSync(supplierDir).filter((file) => statSync(join(supplierDir, file)).isFile()).map((file) => hash(join(supplierDir, file))));
    const copies = readdirSync(join(paths.theme, 'assets')).filter((file) => supplier.has(hash(join(paths.theme, 'assets', file))));
    const { ctx, page } = await open('index.html');
    await scrollThrough(page);
    const sources = await page.evaluate(() =>
      [...document.querySelectorAll('img, source')]
        .flatMap((element) => [element.currentSrc || element.getAttribute('src') || '', ...(element.getAttribute('srcset') || '').split(',').map((part) => part.trim().split(/\s+/)[0])])
        .filter((url) => url && !url.startsWith('data:'))
        .map((url) => new URL(url, document.baseURI).pathname)
    );
    await ctx.close();
    const unknown = [...new Set(sources)].filter((url) => !/\/assets\/luna-[\w.-]+\.(webp|jpg|png)$/.test(url));
    record(
      'scene nostre, mai le foto originali del fornitore',
      copies.length === 0 && unknown.length === 0,
      `${supplier.size} foto del fornitore confrontate con gli asset del tema: ${copies.length ? `copie ${copies.join(', ')}` : 'nessuna copia'}; ` +
        `${new Set(sources).size} immagini in pagina, ${unknown.length ? `non nostre: ${unknown.join(', ')}` : 'tutte esportate da noi (luna-*)'}`
    );
  }

  // 7. Misura reale Ø 8,5 cm: occhiello della hero, specifiche e vicino a ogni immagine grande della lampada
  {
    const { ctx, page } = await open('index.html');
    await scrollThrough(page);
    const state = await page.evaluate(() => {
      const size = 'Ø 8,5 cm';
      const sections = [...document.querySelectorAll('.shopify-section')].map((section) => {
        const big = [...section.querySelectorAll('img, canvas')].filter((element) => {
          const rect = element.getBoundingClientRect();
          const source = element.currentSrc || '';
          return rect.width >= 200 && (element.tagName === 'CANVAS' || /luna-(lamp|moon|base|scene)/.test(source));
        }).length;
        return { id: section.id.split('__').pop(), big, size: section.innerText.includes(size) };
      });
      return {
        eyebrow: document.querySelector('.luna-hero .luna-eyebrow')?.textContent.includes(size) || false,
        specs: document.querySelector('.luna-specs')?.innerText.includes(size) || false,
        sections: sections.filter((section) => section.big > 0),
      };
    });
    await ctx.close();
    const missing = state.sections.filter((section) => !section.size).map((section) => section.id);
    record(
      'misura reale Ø 8,5 cm accanto alle immagini grandi',
      state.eyebrow && state.specs && missing.length === 0,
      `occhiello della hero: ${state.eyebrow ? 'sì' : 'no'}, specifiche: ${state.specs ? 'sì' : 'no'}; ` +
        `sezioni con immagini grandi della lampada: ${state.sections.map((section) => `${section.id} ${section.size ? '✓' : '✗'}`).join(', ')}`
    );
  }

  // 8. Footer: ragione sociale, P.IVA e sede dai setting; link alle policy da shop.policies
  {
    const { globals } = buildData(new Set());
    const policies = globals.shop.policies.map((policy) => policy.url);
    const read = async (pageName) => {
      const { ctx, page } = await open(pageName);
      const state = await page.$eval('.luna-footer', (footer) => ({
        legal: footer.querySelector('.luna-footer__legal')?.textContent.replace(/\s+/g, ' ').trim() || '',
        links: [...footer.querySelectorAll('a')].map((link) => link.getAttribute('href')),
      }));
      await ctx.close();
      return state;
    };
    const empty = await read('index.html');
    const filled = await read('dati-legali.html');
    record(
      'footer con dati legali dai setting e policy da shop.policies',
      policies.every((url) => empty.links.includes(url)) && empty.legal === '' &&
        /Esempio Srl/.test(filled.legal) && /P\.IVA 00000000000/.test(filled.legal) && /Via di Prova 1/.test(filled.legal),
      `policy: ${policies.map((url) => `${url} ${empty.links.includes(url) ? '✓' : '✗'}`).join(', ')}; ` +
        `setting vuoti: ${empty.legal ? `«${empty.legal}»` : 'nessuna riga'}; setting compilati: «${filled.legal}»`
    );
  }

  // 9. Banner dei cookie: content_for_header nel <head>, così com'è (il banner vero si prova sul negozio)
  {
    const layout = readFileSync(join(paths.theme, 'layout', 'luna-landing.liquid'), 'utf8');
    const head = layout.slice(0, layout.indexOf('</head>'));
    const uses = layout.match(/content_for_header[^}]*\}\}/g) || [];
    const plain = uses.length === 1 && /\{\{\s*content_for_header\s*\}\}/.test(head);
    const afterCss = head.indexOf('content_for_header') > head.indexOf("'luna-landing.css'");
    record(
      'banner dei cookie: content_for_header nel <head> così com\'è',
      plain && afterCss,
      `${uses.length} uso, ${plain ? 'senza filtri, if o capture' : 'non pulito'}, ${afterCss ? 'dopo il CSS' : 'prima del CSS'}; ` +
        'il banner si vede solo sul negozio (step 7, sul telefono)'
    );
  }

  return results;
}

async function weightChecks(browser, baseUrl) {
  const results = [];
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const ctx = await context(browser, mobileOptions);
  const page = await ctx.newPage();
  const responses = [];
  page.on('response', (response) =>
    responses.push(response.body().then((body) => ({ url: new URL(response.url()).pathname.split('/').pop(), type: response.headers()['content-type'] || '', body }), () => null))
  );
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
  const external = await page.evaluate(() =>
    [...document.querySelectorAll('script[src], link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"]')]
      .map((element) => element.getAttribute('src') || element.getAttribute('href'))
      .filter((url) => /^(https?:)?\/\//.test(url) && !url.includes(location.host))
  );
  await ctx.close();
  const items = (await Promise.all(responses)).filter(Boolean);
  const images = items.filter((item) => /image\//.test(item.type)).sort((a, b) => b.body.length - a.body.length);
  const scripts = items.filter((item) => /javascript/.test(item.type));
  const sum = (list) => list.reduce((total, item) => total + item.body.length, 0);
  results.push({
    name: 'pesi reali · immagini del primo caricamento (390 px, prima di scorrere)',
    ok: sum(images) / 1024 <= BUDGET_KB,
    detail: `${images.length} immagini, ${kb(sum(images))}: ${images.map((item) => `${item.url} ${kb(item.body.length)}`).join(', ')}`,
  });
  const landing = readFileSync(join(paths.theme, 'assets', 'luna-landing.js'));
  const staticImports = (landing.toString().match(/^\s*import\s[^(]/gm) || []).length;
  const three = ['luna-moon3d.js', 'luna-three.module.min.js'].map((file) => {
    const body = readFileSync(join(paths.theme, 'assets', file));
    return `${file} ${kb(body.length)} (${kb(gzipSync(body, { level: 9 }).length)} gzip)`;
  });
  results.push({
    name: 'pesi reali · JavaScript, senza librerie esterne né CDN',
    ok: staticImports === 0 && external.length === 0 && scripts.every((item) => item.url.startsWith('luna-')),
    detail: `primo caricamento: ${scripts.map((item) => `${item.url} ${kb(item.body.length)} (${kb(gzipSync(item.body, { level: 9 }).length)} gzip)`).join(', ')}; ` +
      `${staticImports} import statici; solo vicino alla 3D: ${three.join(', ')}; ` +
      `script o fogli esterni: ${external.length ? external.join(', ') : 'nessuno'}`,
  });
  return results;
}

/* ---------------------------------------------------------------- avvio */
/** Esito punto per punto in studio/qa/checklist.md (lo riscrive ogni giro). */
function writeChecklist(sections, total, failed) {
  const lines = [
    '# Checklist dei controlli automatici',
    '',
    `Generata da \`npm --prefix studio run check\` (studio/preview/check.mjs) il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}, ` +
      'sull\'anteprima simulata (§13): LiquidJS, dati finti, Chromium di Playwright.',
    '',
    failed ? `**${failed} controlli falliti su ${total}.**` : `**Tutti i ${total} controlli superati.**`,
    '',
  ];
  for (const { title, results } of sections) {
    lines.push(`## ${title}`, '');
    for (const result of results) lines.push(`- ${result.ok ? '✅' : '❌'} **${result.name}** — ${result.detail}`);
    lines.push('');
  }
  lines.push(
    '## Da verificare sul negozio (non si provano nell\'anteprima)',
    '',
    '- ⏳ Checkout con 1 pezzo al prezzo giusto da ogni CTA (hero, offerta, chiusura, barra sticky).',
    '- ⏳ Pagamenti rapidi visibili accanto alla CTA della hero e coerenti con lo stile della pagina.',
    '- ⏳ Banner dei cookie presente con il layout luna-landing.',
    '- ⏳ Eventi del pixel Meta (PageView, ViewContent, AddToCart / InitiateCheckout) senza bloccare l\'invio del form.',
    '- ⏳ Lighthouse mobile sul negozio vero, con gli script di Shopify.',
    ''
  );
  writeFileSync(join(paths.qa, 'checklist.md'), lines.join('\n'));
}

async function main() {
  await render();
  const server = await serve(paths.out);
  const browser = await launchBrowser();
  let failed = 0;
  let total = 0;
  const sections = [];
  try {
    const pages = [];
    for (const pageName of PAGES) {
      for (const width of WIDTHS) {
        total += 1;
        const { failures, firstLoadKb, italic } = await checkPage(browser, server.url, pageName, width);
        const label = `${pageName.padEnd(16)} ${String(width).padStart(4)}px`;
        if (failures.length) {
          failed += 1;
          console.log(`✗ ${label}`);
          failures.forEach((failure) => console.log(`    – ${failure}`));
        } else {
          console.log(
            `✓ ${label}  console pulita · niente scroll orizzontale · font caricati${italic ? ' (anche il corsivo)' : ''}` +
              ` · primo caricamento ${firstLoadKb.toFixed(0)} KB / ${BUDGET_KB} KB`
          );
        }
        pages.push({
          name: `${pageName} a ${width} px`,
          ok: failures.length === 0,
          detail: failures.length
            ? failures.join(' · ')
            : `console pulita, niente scroll orizzontale, font caricati${italic ? ' (anche il corsivo)' : ''}, ` +
              `primo caricamento ${firstLoadKb.toFixed(0)} KB su ${BUDGET_KB}`,
        });
      }
    }
    sections.push({ title: 'Pagine: console, scroll orizzontale, font e budget (360, 390, 768, 1280, 1440 px)', results: pages });
    console.log('');
    // In sequenza: alcuni controlli misurano tempi e caricamenti, in parallelo si disturberebbero
    const groups = [
      ['Hero, acquisto e barra sticky (step 3)', heroChecks],
      ['Luna 3D (step 4)', moon3dChecks],
      ['Sezioni che convincono (step 5)', persuasionChecks],
      ['Offerta, FAQ e chiusura (step 6)', offerChecks],
      ['Consegna stimata (step 7)', deliveryChecks],
      ['Regole legali, una per una (§10)', legalChecks],
      ['Pesi reali di immagini e JavaScript (§9)', weightChecks],
    ];
    for (const [title, group] of groups) {
      const results = await group(browser, server.url);
      sections.push({ title, results });
      for (const result of results) {
        total += 1;
        if (!result.ok) failed += 1;
        console.log(`${result.ok ? '✓' : '✗'} ${result.name}  ·  ${result.detail}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  writeChecklist(sections, total, failed);
  console.log('\n✓ studio/qa/checklist.md');
  if (failed) {
    console.log(`\n${failed} controlli falliti su ${total}`);
    process.exit(1);
  }
  console.log(`\nTutti i ${total} controlli superati`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('✗ controlli interrotti:', error.message);
    process.exit(1);
  });
}
