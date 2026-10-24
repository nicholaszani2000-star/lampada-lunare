// Screenshot a pagina intera dell'anteprima (CLAUDE.md §13) ed errori di console.
// Uscita: studio/qa/preview-390.png, preview-1440.png, console.txt e il catalogo dei componenti
// in styleguide-390.jpg e styleguide-1440.jpg (JPEG: la grana dello sfondo gonfierebbe i PNG)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser, paths, serve } from './lib.mjs';

const SHOTS = [
  { page: 'index.html', file: 'preview-390.png', width: 390, height: 844, mobile: true },
  { page: 'index.html', file: 'preview-1440.png', width: 1440, height: 900, mobile: false },
  { page: 'styleguide.html', file: 'styleguide-390.jpg', width: 390, height: 844, mobile: true },
  { page: 'styleguide.html', file: 'styleguide-1440.jpg', width: 1440, height: 900, mobile: false },
];

/** Scorre tutta la pagina come farebbe una persona, così le comparse partono, poi torna in cima. */
export async function scrollThrough(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const step = Math.round(window.innerHeight * 0.7);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await wait(120);
    }
    window.scrollTo(0, 0);
    await wait(120);
  });
  await page.waitForTimeout(900);
}

/**
 * Solo per gli screenshot a pagina intera: il cielo è fisso alla finestra e coprirebbe solo la prima schermata,
 * lasciando un bordo che nel browser non esiste.
 */
export async function stretchSky(page) {
  await page.addStyleTag({
    content: `.luna-sky{height:${await page.evaluate(() => document.documentElement.scrollHeight)}px!important;` +
      'contain:none!important;background-size:100% 100vh!important;background-repeat:no-repeat!important;' +
      'background-color:var(--luna-bg)!important}',
  });
}

/** Registra errori di console, eccezioni, richieste fallite e risposte HTTP ≥ 400. */
// Avvisi del renderer software di Chromium headless (SwiftShader) quando Playwright legge i pixel di un canvas WebGL
// per lo screenshot: non vengono dal nostro codice e su un telefono vero non esistono.
const HEADLESS_GL_NOISE = /GL Driver Message \(OpenGL, Performance,.*GPU stall due to ReadPixels/;

export function watchProblems(page, label, list) {
  page.on('console', (message) => {
    if ((message.type() === 'error' || message.type() === 'warning') && !HEADLESS_GL_NOISE.test(message.text())) {
      list.push(`${label}  console.${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => list.push(`${label}  eccezione: ${error.message}`));
  page.on('requestfailed', (request) =>
    list.push(`${label}  richiesta fallita: ${request.url()} (${request.failure()?.errorText})`)
  );
  page.on('response', (response) => {
    if (response.status() >= 400) list.push(`${label}  HTTP ${response.status()}: ${response.url()}`);
  });
}

async function main() {
  if (!existsSync(join(paths.out, 'index.html'))) throw new Error('manca out/index.html: lancia prima render.mjs');
  mkdirSync(paths.qa, { recursive: true });
  const server = await serve(paths.out);
  const browser = await launchBrowser();
  const problems = [];

  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({
        viewport: { width: shot.width, height: shot.height },
        deviceScaleFactor: shot.mobile ? 2 : 1,
        isMobile: shot.mobile,
        hasTouch: shot.mobile,
        locale: 'it-IT',
        timezoneId: 'Europe/Rome',
      });
      const page = await context.newPage();
      watchProblems(page, `[${shot.page} ${shot.width}px]`, problems);
      await page.goto(`${server.url}/${shot.page}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await scrollThrough(page);
      await stretchSky(page);
      const jpeg = shot.file.endsWith('.jpg');
      await page.screenshot({
        path: join(paths.qa, shot.file),
        fullPage: true,
        ...(jpeg ? { type: 'jpeg', quality: 80 } : {}),
      });
      console.log(`✓ studio/qa/${shot.file}`);
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const report = [
    `Anteprima simulata · errori di console · ${new Date().toISOString()}`,
    '',
    problems.length ? problems.join('\n') : 'Nessun errore o avviso di console, nessuna richiesta fallita.',
    '',
  ].join('\n');
  writeFileSync(join(paths.qa, 'console.txt'), report);
  console.log(`✓ studio/qa/console.txt (${problems.length} problemi)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('✗ screenshot falliti:', error.message);
    process.exit(1);
  });
}
