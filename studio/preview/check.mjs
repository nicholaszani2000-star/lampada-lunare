// Controlli automatici dell'anteprima simulata (CLAUDE.md §13). Crescono step dopo step.
// Step 1: nessun errore di console, nessuno scroll orizzontale a 360, 390, 768 e 1440 px, font caricati.
import { pathToFileURL } from 'node:url';
import { launchBrowser, paths, serve } from './lib.mjs';
import { render } from './render.mjs';
import { scrollThrough, watchProblems } from './shoot.mjs';

const PAGES = ['index.html', 'styleguide.html'];
const WIDTHS = [360, 390, 768, 1440];
const FONTS = ['Luna Fraunces', 'Luna Inter'];

async function checkPage(browser, baseUrl, pageName, width) {
  const mobile = width < 768;
  const context = await browser.newContext({
    viewport: { width, height: mobile ? 800 : 900 },
    isMobile: mobile,
    hasTouch: mobile,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
  });
  const page = await context.newPage();
  const problems = [];
  watchProblems(page, '', problems);
  await page.goto(`${baseUrl}/${pageName}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await scrollThrough(page);

  const result = await page.evaluate(({ families, expected }) => {
    // Su mobile Chromium allarga la finestra per far stare un contenuto troppo largo:
    // si confronta con la larghezza impostata, non con window.innerWidth
    const viewport = expected;
    const overflow = document.documentElement.scrollWidth - viewport;
    // Con overflow-x: clip la pagina non scorre mai: si cerca anche chi esce davvero dallo schermo
    const offenders = [];
    for (const element of document.querySelectorAll('.luna-page *')) {
      if (element.closest('.luna-sky, .luna-visually-hidden, [data-luna-overflow-ok]')) continue;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.right > viewport + 1 || rect.left < -1) {
        const name = element.tagName.toLowerCase() + (element.className && typeof element.className === 'string'
          ? '.' + element.className.trim().split(/\s+/).join('.')
          : '');
        offenders.push(`${name} (${Math.round(rect.left)}→${Math.round(rect.right)})`);
      }
    }
    const loaded = [...document.fonts].filter((font) => font.status === 'loaded').map((font) => font.family.replace(/["']/g, ''));
    return {
      overflow,
      offenders: offenders.slice(0, 5),
      missingFonts: families.filter((family) => !loaded.includes(family)),
    };
  }, { families: FONTS, expected: width });
  await context.close();

  const failures = [];
  if (problems.length) failures.push(...problems.map((problem) => problem.trim()));
  if (result.overflow > 0) failures.push(`scroll orizzontale di ${result.overflow}px`);
  if (result.offenders.length) failures.push(`fuori dallo schermo: ${result.offenders.join(', ')}`);
  if (result.missingFonts.length) failures.push(`font non caricati: ${result.missingFonts.join(', ')}`);
  return failures;
}

async function main() {
  await render();
  const server = await serve(paths.out);
  const browser = await launchBrowser();
  let failed = 0;
  try {
    for (const pageName of PAGES) {
      for (const width of WIDTHS) {
        const failures = await checkPage(browser, server.url, pageName, width);
        const label = `${pageName.padEnd(16)} ${String(width).padStart(4)}px`;
        if (failures.length) {
          failed += 1;
          console.log(`✗ ${label}`);
          failures.forEach((failure) => console.log(`    – ${failure}`));
        } else {
          console.log(`✓ ${label}  console pulita · niente scroll orizzontale · font caricati`);
        }
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  if (failed) {
    console.log(`\n${failed} controlli falliti`);
    process.exit(1);
  }
  console.log(`\nTutti i ${PAGES.length * WIDTHS.length} controlli superati`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('✗ controlli interrotti:', error.message);
    process.exit(1);
  });
}
