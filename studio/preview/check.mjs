// Controlli automatici dell'anteprima simulata (CLAUDE.md §13). Crescono step dopo step.
// Step 1: nessun errore di console, nessuno scroll orizzontale a 360, 390, 768 e 1440 px, font caricati
//         (anche il corsivo di Fraunces dove i titoli hanno <em>), primo caricamento entro il budget del §9.
// Step 3: interruttore della luna, titoli per angolo (?h=), barra sticky, movimento ridotto, form d'acquisto,
//         CTA collegate a #luna-buy-form, nessun prezzo scritto a mano, un solo H1, immagini della hero (LCP).
// Step 4: Three.js non scaricato prima di avvicinarsi alla sezione 3D; poi un canvas WebGL disegnato davvero;
//         con ?luna3d=0 l'immagine di ripiego; tonalità sincronizzate hero ↔ 3D; swipe sul canvas che fa scorrere
//         la pagina; trascinamento che ruota la luna (anche con movimento ridotto); editor: unload smonta, load rimonta.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser, paths, serve } from './lib.mjs';
import { render } from './render.mjs';
import { scrollThrough, watchProblems } from './shoot.mjs';

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
    record(
      'avvicinandosi compare un canvas WebGL disegnato',
      ready && /^webgl2?$/.test(state.renderer) && state.canvasOpacity === '1' && state.fallbackOpacity === '0' &&
        state.threeModules === 1 && share > 8 && !problems.length,
      `${ready ? 'is-3d' : '3D non pronto'}, renderer ${state.renderer || '—'}, canvas ${state.size}, ` +
        `immagine di ripiego a opacità ${state.fallbackOpacity}, pixel chiari ${share.toFixed(1)}%` +
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
    await page.click('[data-luna-moon3d-switch]');
    await page.waitForTimeout(1200);
    const off = await page.evaluate((selector) => ({
      checked: document.querySelector('[data-luna-moon3d-switch]').getAttribute('aria-checked'),
      filter: getComputedStyle(document.querySelector(`${selector} .luna-moon3d__fallback img`)).filter,
    }), STAGE);
    record(
      'con ?luna3d=0 resta l\'immagine',
      /is-fallback/.test(state.classes) && !/is-3d/.test(state.classes) && state.loaded && state.opacity === '1' &&
        Boolean(state.alt) && requests.length === 0 && off.checked === 'false' && off.filter !== state.filter,
      `immagine caricata: ${state.loaded}, ${state.size}, opacità ${state.opacity}, richieste 3D: ${requests.length}; ` +
        `interruttore spento: ${state.filter} → ${off.filter}`
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
    for (const result of [...(await heroChecks(browser, server.url)), ...(await moon3dChecks(browser, server.url))]) {
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
