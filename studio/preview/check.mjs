// Controlli automatici dell'anteprima simulata (CLAUDE.md §13). Crescono step dopo step.
// Step 1: nessun errore di console, nessuno scroll orizzontale a 360, 390, 768 e 1440 px, font caricati
//         (anche il corsivo di Fraunces dove i titoli hanno <em>), primo caricamento entro il budget del §9.
// Step 3: interruttore della luna, titoli per angolo (?h=), barra sticky, movimento ridotto, form d'acquisto,
//         CTA collegate a #luna-buy-form, nessun prezzo scritto a mano, un solo H1, immagini della hero (LCP).
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
    for (const result of await heroChecks(browser, server.url)) {
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
