// Copia Three.js negli asset del tema come un unico modulo ES minificato, ridotto alle sole classi che usa
// assets/luna-moon3d.js: assets/luna-three.module.min.js. Niente CDN (CLAUDE.md, regola 8).
// L'elenco si ricava dal modulo (ogni THREE.Nome), così il bundle resta allineato al codice: se il modulo usa
// una classe nuova basta rilanciare lo script. esbuild si ferma se un nome non esiste in Three.js.
// Da r16x Three.js non pubblica più build/three.module.min.js: esbuild unisce three.module.js e three.core.js,
// toglie tutto quello che non serve (tree shaking) e mette la licenza MIT in fondo.
// Uso: npm --prefix studio run three
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const studio = join(dirname(fileURLToPath(import.meta.url)), '..');
const theme = join(studio, '..');
const moduleFile = join(theme, 'assets', 'luna-moon3d.js');
const outfile = join(theme, 'assets', 'luna-three.module.min.js');
const { version } = JSON.parse(readFileSync(join(studio, 'node_modules', 'three', 'package.json'), 'utf8'));

const source = readFileSync(moduleFile, 'utf8');
const names = [...new Set([...source.matchAll(/\bTHREE\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]))].sort();
if (!names.length) throw new Error('assets/luna-moon3d.js non usa nessuna classe THREE.*');
// Il modulo deve usare Three.js solo come THREE.Nome: altrimenti l'elenco qui sopra non è completo
if (/\{[^}]*\}\s*=\s*THREE\b|THREE\[/.test(source)) {
  throw new Error('assets/luna-moon3d.js usa THREE con destrutturazione o con []: scrivi THREE.Nome');
}

await build({
  stdin: { contents: `export { ${names.join(', ')} } from 'three';`, resolveDir: studio, loader: 'js' },
  outfile,
  bundle: true,
  format: 'esm',
  minify: true,
  treeShaking: true,
  legalComments: 'eof',
  target: ['es2020'],
  logLevel: 'warning',
});

const bytes = readFileSync(outfile);
const kb = (size) => `${(size / 1024).toFixed(1)} KB`;
console.log(`✓ assets/luna-three.module.min.js · three ${version} · ${names.length} classi`);
console.log(`  ${kb(statSync(outfile).size)} · compresso con gzip ${kb(gzipSync(bytes, { level: 9 }).length)}`);
console.log(`  ${names.join(', ')}`);
