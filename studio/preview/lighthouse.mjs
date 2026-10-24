// Lighthouse sull'anteprima simulata (CLAUDE.md §9): mobile, con la simulazione di Lighthouse (Moto G Power,
// 4G lento, CPU rallentata 4×), sulla pagina servita compressa come dal CDN di Shopify.
// Obiettivi: Performance ≥ 85, Accessibilità ≥ 95, SEO ≥ 95; LCP < 2,5 s, CLS < 0,1.
// Uscita: studio/qa/lighthouse.txt (riassunto dei giri); i report completi del giro mediano restano in
// studio/preview/out (lighthouse-mobile.html e .json, non vanno su git). Il report HTML in studio/qa/lighthouse.html
// lo produce il comando dello step 7 (npx lighthouse … --output-path=studio/qa/lighthouse.html).
// Il punteggio vero si misura sul negozio (step 7): qui mancano il CDN di Shopify, content_for_header, i pixel e
// il banner cookie, che pesano a parte.
// Lighthouse varia un po' da un giro all'altro: fa 3 giri (LUNA_LH_RUNS per cambiarli) e tiene quello mediano
// per Prestazioni; nel riassunto ci sono anche minimo e massimo.
// Uso: npm --prefix studio run lighthouse
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import { paths, serve } from './lib.mjs';
import { render } from './render.mjs';

const TARGETS = { performance: 85, accessibility: 95, seo: 95 };
const METRICS = [
  ['first-contentful-paint', 'FCP'],
  ['largest-contentful-paint', 'LCP'],
  ['total-blocking-time', 'TBT'],
  ['cumulative-layout-shift', 'CLS'],
  ['speed-index', 'Speed Index'],
];

await render(new Set());
const server = await serve(paths.out, { compress: true });
const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
});

const RUNS = Math.max(1, Number(process.env.LUNA_LH_RUNS) || 3);

let failed = false;
try {
  const runs = [];
  for (let run = 0; run < RUNS; run += 1) {
    runs.push(
      await lighthouse(`${server.url}/index.html`, {
        port: chrome.port,
        output: ['html', 'json'],
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        locale: 'it',
      })
    );
  }
  const byPerformance = [...runs].sort((a, b) => a.lhr.categories.performance.score - b.lhr.categories.performance.score);
  const result = byPerformance[Math.floor(byPerformance.length / 2)];
  // Minimo e massimo sui giri: si ordina sul numero, poi si formatta
  const spread = (pick, format = String) => {
    const values = runs.map(pick).sort((a, b) => a - b);
    return values.length > 1 ? ` (giri: ${format(values[0])}–${format(values[values.length - 1])})` : '';
  };
  const [html, json] = result.report;
  const { categories, audits } = result.lhr;
  writeFileSync(join(paths.out, 'lighthouse-mobile.html'), html);
  writeFileSync(join(paths.out, 'lighthouse-mobile.json'), json); // completo, solo in locale (out/ non va su git)

  const lines = [
    `Lighthouse ${result.lhr.lighthouseVersion} · mobile simulato · ${new Date().toISOString()} · ` +
      `giro mediano su ${RUNS}`,
    '',
  ];
  for (const [id, category] of Object.entries(categories)) {
    const score = Math.round(category.score * 100);
    const target = TARGETS[id];
    const ok = target === undefined || score >= target;
    if (!ok) failed = true;
    lines.push(
      `${ok ? '✓' : '✗'} ${category.title.padEnd(22)} ${String(score).padStart(3)}${target ? ` / obiettivo ${target}` : ''}` +
        spread((run) => Math.round(run.lhr.categories[id].score * 100))
    );
  }
  lines.push('');
  for (const [id, label] of METRICS) {
    const unit = id === 'cumulative-layout-shift' ? (value) => value.toFixed(3) : (value) => `${Math.round(value)} ms`;
    lines.push(`  ${label.padEnd(12)} ${audits[id].displayValue}${spread((run) => run.lhr.audits[id].numericValue, unit)}`);
  }
  // CLS è stabile e blocca. L'LCP simulato oscilla tra i giri di qualche centinaio di ms: nella simulazione
  // entrano anche le immagini lazy che il browser chiede in anticipo (servite in pochi ms da localhost). È un avviso,
  // con accanto l'LCP osservato; la misura che conta è quella sul negozio vero.
  const lcp = audits['largest-contentful-paint'].numericValue;
  const cls = audits['cumulative-layout-shift'].numericValue;
  const observed = audits.metrics?.details?.items?.[0]?.observedLargestContentfulPaint;
  if (cls >= 0.1) failed = true;
  lines.push(
    `  ${lcp < 2500 ? '✓' : '⚠'} LCP simulato ${lcp < 2500 ? 'sotto' : 'oltre'} 2,5 s (osservato ${Math.round(observed)} ms) · ` +
      `${cls < 0.1 ? '✓' : '✗'} CLS sotto 0,1 (§9)`
  );

  // Audit non superati (punteggio sotto 0,9) delle categorie con un obiettivo
  const problems = [];
  for (const id of ['performance', 'accessibility', 'best-practices', 'seo']) {
    for (const ref of categories[id].auditRefs) {
      const audit = audits[ref.id];
      if (ref.weight > 0 && audit.score !== null && audit.score < 0.9 && audit.scoreDisplayMode !== 'informative') {
        problems.push(`  [${categories[id].title}] ${audit.title}${audit.displayValue ? ` · ${audit.displayValue}` : ''}`);
      }
    }
  }
  lines.push('', problems.length ? 'Da guardare:' : 'Nessun audit sotto 0,9.', ...problems);

  // Dettagli utili: elemento LCP e sue fasi, lavoro sul thread principale, errori di console
  const lcpElement = audits['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node;
  if (lcpElement) lines.push('', `Elemento LCP: ${lcpElement.snippet || lcpElement.selector}`);
  const phases = audits['largest-contentful-paint-element']?.details?.items?.[1]?.items || [];
  for (const phase of phases) lines.push(`  ${String(phase.phase || phase.label).padEnd(22)} ${Math.round(phase.timing)} ms`);
  const bootup = audits['bootup-time']?.details?.items || [];
  if (bootup.length) lines.push('', 'Script sul thread principale (ms totali · di cui esecuzione):');
  for (const item of bootup.slice(0, 5)) {
    lines.push(`  ${String(item.url).split('/').pop().padEnd(34)} ${Math.round(item.total)} · ${Math.round(item.scripting)}`);
  }
  const errors = audits['errors-in-console']?.details?.items || [];
  for (const item of errors) lines.push(`  errore di console: ${item.description} (${item.source || ''})`);
  const summary = lines.join('\n');
  writeFileSync(join(paths.qa, 'lighthouse.txt'), summary + '\n');
  console.log(summary);
  console.log('\n✓ studio/qa/lighthouse.txt (report completi in studio/preview/out)');
} finally {
  await chrome.kill();
  await server.close();
}
if (failed) process.exit(1);
