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
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { launchBrowser, paths, serve } from './lib.mjs';
import { render } from './render.mjs';
import { scrollThrough, stretchSky, watchProblems } from './shoot.mjs';

const PAGES = ['index.html', 'styleguide.html'];
const WIDTHS = [360, 390, 768, 1440];
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
  for (const height of [844, 560]) {
    const ctx = await context(browser, { ...mobileOptions, viewport: { width: 390, height } });
    const page = await ctx.newPage();
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const state = () =>
      page.evaluate(() => {
        const rect = document.querySelector('[data-luna-hero-cta]').getBoundingClientRect();
        return {
          ctaOnScreen: rect.bottom > 0 && rect.top < window.innerHeight,
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
    const consistent = [atLoad, atEnd, atTop].every((item) => item.visible === !item.ctaOnScreen);
    record(
      `barra sticky a 390×${height}`,
      consistent,
      `al caricamento ${atLoad.visible ? 'visibile' : 'nascosta'} (CTA ${atLoad.ctaOnScreen ? 'sullo schermo' : 'sotto la piega'}), ` +
        `in fondo ${atEnd.visible ? 'visibile' : 'nascosta'} (CTA ${atEnd.ctaOnScreen ? 'sullo schermo' : 'superata'}), ` +
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
      'recensioni senza blocchi: non stampa nulla',
      live.html === '' && live.height === 0,
      `fuori dall'editor: ${live.html.length} caratteri di markup, altezza ${live.height} px`
    );
    record(
      'recensioni nell\'editor: riquadro per l\'app',
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

/* ---------------------------------------------------------------- avvio */
async function main() {
  await render();
  const server = await serve(paths.out);
  const browser = await launchBrowser();
  let failed = 0;
  let total = 0;
  try {
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
      }
    }
    console.log('');
    // In sequenza: alcuni controlli misurano tempi e caricamenti, in parallelo si disturberebbero
    const results = [];
    for (const group of [heroChecks, moon3dChecks, persuasionChecks]) results.push(...(await group(browser, server.url)));
    for (const result of results) {
      total += 1;
      if (!result.ok) failed += 1;
      console.log(`${result.ok ? '✓' : '✗'} ${result.name}  ·  ${result.detail}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
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
