// Copia Three.js negli asset del tema come un unico modulo ES minificato: assets/luna-three.module.min.js.
// Da r16x Three.js non pubblica più build/three.module.min.js: build/three.module.js importa ./three.core.js.
// esbuild li unisce in un solo file, con la licenza MIT in fondo. Niente CDN (CLAUDE.md, regola 8).
// Uso: npm --prefix studio run three
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const studio = join(dirname(fileURLToPath(import.meta.url)), '..');
const three = join(studio, 'node_modules', 'three');
const outfile = join(studio, '..', 'assets', 'luna-three.module.min.js');
const { version } = JSON.parse(readFileSync(join(three, 'package.json'), 'utf8'));

await build({
  entryPoints: [join(three, 'build', 'three.module.js')],
  outfile,
  bundle: true,
  format: 'esm',
  minify: true,
  legalComments: 'eof',
  target: ['es2020'],
  logLevel: 'warning',
});

console.log(`✓ assets/luna-three.module.min.js · three ${version} · ${(statSync(outfile).size / 1024).toFixed(0)} KB`);
