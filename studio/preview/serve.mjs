// Serve l'anteprima già renderizzata (studio/preview/out) su un indirizzo locale fisso, compressa come il CDN di
// Shopify: per aprirla nel browser o per lanciare Lighthouse da riga di comando (step 7).
// Uso: npm --prefix studio run serve   →   http://127.0.0.1:4173/index.html (porta: LUNA_PORT). Ctrl+C per fermarla.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { paths, serve } from './lib.mjs';

if (!existsSync(join(paths.out, 'index.html'))) {
  console.error('✗ manca studio/preview/out/index.html: lancia prima npm --prefix studio run preview');
  process.exit(1);
}
const server = await serve(paths.out, { compress: true, port: Number(process.env.LUNA_PORT) || 4173 });
console.log(`✓ anteprima su ${server.url}/index.html (compressa)`);
