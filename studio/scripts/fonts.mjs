// Copia i font variabili (sottoinsieme latin) da @fontsource-variable negli asset del tema
// e le licenze OFL in studio/licenses. Uso: npm --prefix studio run fonts
import { copyFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(studio, '..');
const pkg = (name) => join(studio, 'node_modules', '@fontsource-variable', name);
const MAX_BYTES = 120 * 1024;

const fonts = [
  // Fraunces: il file «opsz» contiene gli assi opsz (9–144) e wght (100–900)
  { from: join(pkg('fraunces'), 'files', 'fraunces-latin-opsz-normal.woff2'), to: 'luna-fraunces.woff2' },
  // Inter: asse wght (100–900)
  { from: join(pkg('inter'), 'files', 'inter-latin-wght-normal.woff2'), to: 'luna-inter.woff2' },
];

for (const font of fonts) {
  const size = statSync(font.from).size;
  if (size > MAX_BYTES) {
    console.error(`✗ ${font.to}: ${(size / 1024).toFixed(1)} KB, oltre il limite di 120 KB`);
    process.exit(1);
  }
  copyFileSync(font.from, join(root, 'assets', font.to));
  console.log(`✓ assets/${font.to}  ${(size / 1024).toFixed(1)} KB`);
}

copyFileSync(join(pkg('fraunces'), 'LICENSE'), join(studio, 'licenses', 'fraunces-OFL.txt'));
copyFileSync(join(pkg('inter'), 'LICENSE'), join(studio, 'licenses', 'inter-OFL.txt'));
console.log('✓ licenze OFL in studio/licenses');
