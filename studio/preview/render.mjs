// Anteprima simulata (CLAUDE.md §13): renderizza templates/product.luna.json con LiquidJS
// dentro layout/luna-landing.liquid, con tag, filtri e oggetti Shopify simulati.
// Uscita: studio/preview/out/index.html (+ styleguide.html) e gli asset in out/assets.
//
// Opzioni:  --senza-barrato   prodotto senza prezzo barrato (compare_at_price nullo)
//           --esaurito        variante non disponibile
//           --editor          simula l'editor del tema (request.design_mode e Shopify.designMode)
//           --varianti        due varianti finte (opzione «Confezione»), per provare il selettore
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Drop, Hash, Liquid, Tag, TypeGuards, evalToken } from 'liquidjs';
import { imageSize, paths } from './lib.mjs';

const THEME = paths.theme;
const ASSETS = join(THEME, 'assets');
const SHOP_URL = 'https://lunaria.example';

/* ------------------------------------------------------------------ */
/* Numeri: Liquid di Shopify distingue interi e decimali.               */
/* 7 | divided_by: 2 dà 3, 7 | divided_by: 2.0 dà 3.5. JavaScript no:  */
/* i letterali decimali diventano LiquidFloat prima del parsing.        */
/* ------------------------------------------------------------------ */
class LiquidFloat extends Drop {
  constructor(value) {
    super();
    this.value = Number(value);
  }
  valueOf() {
    return this.value;
  }
  toString() {
    return Number.isInteger(this.value) ? this.value.toFixed(1) : String(this.value);
  }
}

const floatLiterals = {};
// I globali del motore: ogni decimale trovato leggendo un file vi finisce subito
let liveGlobals = null;

export function markFloats(source) {
  return source.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, (code) =>
    code.replace(/('[^']*'|"[^"]*")|(?<![\w.])(\d+\.\d+)(?![\w.])/g, (match, quoted, number) => {
      if (quoted) return quoted;
      const name = '__luna_float_' + number.replace('.', '_');
      floatLiterals[name] = floatLiterals[name] || new LiquidFloat(number);
      if (liveGlobals) liveGlobals[name] = floatLiterals[name];
      return name;
    })
  );
}

function num(value) {
  if (value instanceof LiquidFloat) return { n: value.value, float: true };
  if (value instanceof Drop) value = value.valueOf();
  if (typeof value === 'number') return { n: value, float: !Number.isInteger(value) };
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return { n: Number(value), float: value.includes('.') };
  }
  return { n: 0, float: false };
}

const numberResult = (n, float) => (float ? new LiquidFloat(n) : n);
const roundHalfAway = (n) => Math.sign(n) * Math.round(Math.abs(n));

/* ------------------------------------------------------------------ */
/* Dati finti                                                           */
/* ------------------------------------------------------------------ */
const args = new Set(process.argv.slice(2));

// Immagini del prodotto (§4.7: la prima è la scena notte). Come su Shopify, ogni immagine è
// l'originale più grande; image_url sceglie l'esportazione più piccola che basta per la larghezza chiesta.
const PRODUCT_IMAGES = [
  { slug: 'notte', alt: 'Lampada Lunare Levitante accesa, Ø 8,5 cm, su un piano scuro' },
  { slug: 'misure', alt: 'Misure della Lampada Lunare Levitante: luna Ø 8,5 cm, base 10,8 × 2,2 cm' },
];

function productImages() {
  if (!existsSync(ASSETS)) return [];
  const files = readdirSync(ASSETS);
  return PRODUCT_IMAGES.map(({ slug, alt }, index) => {
    const variants = files
      .filter((file) => new RegExp(`^luna-scene-${slug}-\\d+\\.webp$`).test(file))
      .map((file) => ({ file, ...(imageSize(readFileSync(join(ASSETS, file))) || {}) }))
      .filter((variant) => variant.width)
      .sort((a, b) => a.width - b.width);
    if (!variants.length) return null;
    const original = variants[variants.length - 1];
    return {
      id: 9000 + index,
      src: `assets/${original.file}`,
      variants,
      alt,
      width: original.width,
      height: original.height,
      aspect_ratio: new LiquidFloat(original.width / original.height),
      media_type: 'image',
      position: index + 1,
    };
  }).filter(Boolean);
}

// Solo per provare il selettore: la seconda variante ha un prezzo diverso, nessun barrato e non è disponibile
function fakeVariants(first) {
  const standard = { ...first, title: 'Standard', options: ['Standard'], option1: 'Standard' };
  const gift = {
    ...first,
    id: first.id + 1,
    title: 'Confezione regalo',
    options: ['Confezione regalo'],
    option1: 'Confezione regalo',
    price: first.price + 500,
    compare_at_price: null,
    available: false,
    url: first.url.replace(/variant=\d+/, `variant=${first.id + 1}`),
  };
  return {
    has_only_default_variant: false,
    options: ['Confezione'],
    options_with_values: [
      { name: 'Confezione', position: 1, values: ['Standard', 'Confezione regalo'], selected_value: 'Standard' },
    ],
    variants: [standard, gift],
    selected_or_first_available_variant: standard,
  };
}

export function buildData(options = args) {
  const images = productImages();
  const onSale = !options.has('--senza-barrato');
  const available = !options.has('--esaurito');
  const designMode = options.has('--editor');

  const variant = {
    id: 46000000000001,
    title: 'Default Title',
    name: 'Lampada Lunare Levitante',
    price: 5990,
    compare_at_price: onSale ? 6990 : null,
    available,
    inventory_management: null,
    inventory_policy: 'deny',
    inventory_quantity: 0,
    sku: '',
    barcode: '',
    options: ['Default Title'],
    option1: 'Default Title',
    option2: null,
    option3: null,
    featured_image: images[0] || null,
    requires_shipping: true,
    taxable: true,
    url: '/products/lampada-lunare-levitante?variant=46000000000001',
  };

  const product = {
    id: 9100000000001,
    title: 'Lampada Lunare Levitante',
    handle: 'lampada-lunare-levitante',
    url: '/products/lampada-lunare-levitante',
    vendor: 'Lunaria',
    type: 'Lampada',
    description: '<p>Lampada a levitazione magnetica, Ø 8,5 cm.</p>',
    available,
    price: variant.price,
    price_min: variant.price,
    price_max: variant.price,
    compare_at_price: variant.compare_at_price,
    compare_at_price_min: variant.compare_at_price,
    compare_at_price_max: variant.compare_at_price,
    has_only_default_variant: true,
    options: ['Title'],
    options_with_values: [{ name: 'Title', position: 1, values: ['Default Title'], selected_value: 'Default Title' }],
    variants: [variant],
    ...(options.has('--varianti') ? fakeVariants(variant) : {}),
    selected_variant: null,
    selected_or_first_available_variant: variant,
    first_available_variant: available ? variant : null,
    images,
    media: images,
    featured_image: images[0] || null,
    featured_media: images[0] || null,
    tags: [],
  };

  const refund = { title: 'Politica di rimborso', url: '/policies/refund-policy', handle: 'refund-policy' };
  const privacy = { title: 'Informativa sulla privacy', url: '/policies/privacy-policy', handle: 'privacy-policy' };

  const globals = {
    shop: {
      name: 'Lunaria',
      description: '',
      url: SHOP_URL,
      domain: 'lunaria.example',
      currency: 'EUR',
      money_format: '€{{amount_with_comma_separator}}',
      policies: [refund, privacy],
      refund_policy: refund,
      privacy_policy: privacy,
      enabled_payment_types: ['visa', 'master'],
    },
    cart: { taxes_included: true, item_count: 0, items: [], currency: { iso_code: 'EUR', symbol: '€' } },
    request: {
      locale: { iso_code: 'it', primary: true, name: 'Italiano' },
      design_mode: designMode,
      visual_preview_mode: false,
      page_type: 'product',
      host: 'lunaria.example',
      path: product.url,
    },
    routes: {
      root_url: '/',
      cart_url: '/cart',
      cart_add_url: '/cart/add',
      cart_change_url: '/cart/change',
      cart_update_url: '/cart/update',
      search_url: '/search',
      all_products_collection_url: '/collections/all',
      collections_url: '/collections',
      account_url: '/account',
      product_recommendations_url: '/recommendations/products',
    },
    canonical_url: SHOP_URL + product.url,
    page_title: 'Lampada Lunare Levitante',
    page_description: 'Lampada a levitazione magnetica, Ø 8,5 cm, luce calda.',
    template: { name: 'product', suffix: 'luna', directory: null },
    settings: {},
    ...floatLiterals,
  };

  const editorScript = designMode ? '<script>window.Shopify = { designMode: true };</script>' : '';
  return { product, variant, globals, editorScript };
}

/* ------------------------------------------------------------------ */
/* Filtri simulati                                                      */
/* ------------------------------------------------------------------ */
function kwargs(list) {
  const named = {};
  const positional = [];
  for (const item of list) {
    if (Array.isArray(item) && item.length === 2 && typeof item[0] === 'string') named[item[0]] = item[1];
    else positional.push(item);
  }
  return { named, positional };
}

function formatMoney(cents) {
  if (cents === null || cents === undefined || cents === '') return '';
  const value = roundHalfAway(num(cents).n);
  const negative = value < 0;
  const abs = Math.abs(value);
  const units = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const amount = `${units},${String(abs % 100).padStart(2, '0')}`;
  return { amount: (negative ? '-' : '') + amount, negative };
}

const escapeAttr = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

class ImageUrl extends Drop {
  constructor(image, width, height) {
    super();
    this.image = image;
    this.width = width;
    this.height = height;
  }
  url(width) {
    const w = width || this.width;
    if (!w) return this.image.src;
    // Come il CDN di Shopify: il file esportato più piccolo che copre la larghezza chiesta
    const variants = this.image.variants || [];
    const match = variants.find((variant) => variant.width >= w) || variants[variants.length - 1];
    return `${match ? `assets/${match.file}` : this.image.src}?width=${w}`;
  }
  valueOf() {
    return this.url();
  }
  toString() {
    return this.url();
  }
}

function assetPath(name) {
  const file = String(name);
  if (!existsSync(join(ASSETS, file))) throw new Error(`asset_url: il file assets/${file} non esiste`);
  return `assets/${file}`;
}

const PAYMENT_LABELS = { visa: 'VISA', master: 'MC', american_express: 'AMEX', paypal: 'PayPal' };

function registerFilters(engine) {
  const f = (name, fn) => engine.registerFilter(name, fn);

  // Prezzi: i valori sono in centesimi, come in Shopify
  f('money', (cents) => {
    const m = formatMoney(cents);
    return m ? `€${m.amount}` : '';
  });
  f('money_with_currency', (cents) => {
    const m = formatMoney(cents);
    return m ? `€${m.amount} EUR` : '';
  });
  f('money_without_currency', (cents) => {
    const m = formatMoney(cents);
    return m ? m.amount : '';
  });
  f('money_without_trailing_zeros', (cents) => {
    const m = formatMoney(cents);
    return m ? `€${m.amount.replace(/,00$/, '')}` : '';
  });

  // Aritmetica con la semantica di Shopify (interi e decimali)
  f('plus', (a, b) => {
    const x = num(a), y = num(b);
    return numberResult(x.n + y.n, x.float || y.float);
  });
  f('minus', (a, b) => {
    const x = num(a), y = num(b);
    return numberResult(x.n - y.n, x.float || y.float);
  });
  f('times', (a, b) => {
    const x = num(a), y = num(b);
    return numberResult(x.n * y.n, x.float || y.float);
  });
  f('divided_by', (a, b) => {
    const x = num(a), y = num(b);
    if (y.n === 0) throw new Error('divided_by: divisione per zero');
    return x.float || y.float ? new LiquidFloat(x.n / y.n) : Math.floor(x.n / y.n);
  });
  f('modulo', (a, b) => {
    const x = num(a), y = num(b);
    const r = ((x.n % y.n) + y.n) % y.n;
    return numberResult(r, x.float || y.float);
  });
  f('round', (a, digits) => {
    const x = num(a);
    const d = digits === undefined ? 0 : num(digits).n;
    if (!d) return roundHalfAway(x.n);
    const factor = 10 ** d;
    return new LiquidFloat(roundHalfAway(x.n * factor) / factor);
  });
  f('floor', (a) => Math.floor(num(a).n));
  f('ceil', (a) => Math.ceil(num(a).n));
  f('abs', (a) => {
    const x = num(a);
    return numberResult(Math.abs(x.n), x.float);
  });
  f('at_least', (a, b) => {
    const x = num(a), y = num(b);
    return x.n >= y.n ? numberResult(x.n, x.float) : numberResult(y.n, y.float);
  });
  f('at_most', (a, b) => {
    const x = num(a), y = num(b);
    return x.n <= y.n ? numberResult(x.n, x.float) : numberResult(y.n, y.float);
  });

  // Asset e tag HTML
  f('asset_url', (name) => assetPath(name));
  f('stylesheet_tag', (url, ...rest) => {
    const { named } = kwargs(rest);
    return `<link href="${escapeAttr(url)}" rel="stylesheet" type="text/css" media="${escapeAttr(named.media || 'all')}" />`;
  });
  f('script_tag', (url) => `<script src="${escapeAttr(url)}" type="text/javascript"></script>`);
  f('preload_tag', (url, ...rest) => {
    const { named } = kwargs(rest);
    if (!named.as) throw new Error('preload_tag: manca il parametro as');
    const attrs = Object.entries(named)
      .map(([key, value]) => (value === true ? key : `${key}="${escapeAttr(value)}"`))
      .join(' ');
    return `<link href="${escapeAttr(url)}" ${attrs} rel="preload">`;
  });

  // Immagini
  f('image_url', (image, ...rest) => {
    if (!image) return null;
    if (typeof image === 'string') throw new Error('image_url: serve un oggetto immagine, non una stringa');
    const { named } = kwargs(rest);
    return new ImageUrl(image, named.width ? num(named.width).n : null, named.height ? num(named.height).n : null);
  });
  f('image_tag', (input, ...rest) => {
    if (!input) return '';
    if (!(input instanceof ImageUrl)) throw new Error('image_tag: va applicato al risultato di image_url');
    const { named } = kwargs(rest);
    const image = input.image;
    const ratio = image.width / image.height;
    const width = named.width ? num(named.width).n : input.width || image.width;
    const height = named.height ? num(named.height).n : Math.round(width / ratio);
    const widths = named.widths
      ? String(named.widths).split(',').map((w) => Number(w.trim())).filter(Boolean)
      : [352, 832, 1200, 1920].filter((w) => w <= image.width);
    const attrs = [
      ['src', input.url(input.width || width)],
      ['alt', named.alt !== undefined && named.alt !== null ? named.alt : image.alt || ''],
      ['srcset', widths.map((w) => `${input.url(w)} ${w}w`).join(', ')],
      ['width', width],
      ['height', height],
    ];
    for (const [key, value] of Object.entries(named)) {
      if (['widths', 'width', 'height', 'alt', 'preload'].includes(key)) continue;
      if (value === null || value === undefined || value === false || value === '') continue;
      attrs.push([key, value]);
    }
    return '<img ' + attrs.map(([key, value]) => (value === true ? key : `${key}="${escapeAttr(value)}"`)).join(' ') + '>';
  });

  // Pagamenti
  f('payment_button', (form) => {
    if (!form) throw new Error('payment_button: va applicato a form, dentro {% form %}');
    return (
      '<div data-shopify="payment-button" class="shopify-payment-button">' +
      '<div style="display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:999px;' +
      'border:1px dashed rgba(242,239,232,.35);color:rgba(242,239,232,.8);font:500 15px/1.2 system-ui,sans-serif">' +
      'Pagamento rapido</div></div>'
    );
  });
  f('payment_type_svg_tag', (type, ...rest) => {
    const { named } = kwargs(rest);
    const label = PAYMENT_LABELS[type] || String(type);
    return (
      `<svg class="${escapeAttr(named.class || '')}" viewBox="0 0 38 24" width="38" height="24" role="img" ` +
      `aria-labelledby="pi-${escapeAttr(type)}" xmlns="http://www.w3.org/2000/svg"><title id="pi-${escapeAttr(type)}">${label}</title>` +
      '<rect x=".5" y=".5" width="37" height="23" rx="3.5" fill="#fff" stroke="#000" stroke-opacity=".07"/>' +
      `<text x="19" y="15.5" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#1a1f71">${label}</text></svg>`
    );
  });

  // Dati e testo
  f('structured_data', (product) => {
    if (!product || !product.variants) return '{}';
    const offers = product.variants.map((variant) => ({
      '@type': 'Offer',
      availability: variant.available ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock',
      price: (variant.price / 100).toFixed(2),
      priceCurrency: 'EUR',
      url: SHOP_URL + variant.url,
    }));
    return JSON.stringify({
      '@context': 'http://schema.org/',
      '@type': 'Product',
      name: product.title,
      url: SHOP_URL + product.url,
      brand: { '@type': 'Brand', name: product.vendor },
      image: product.featured_image ? [product.featured_image.src] : [],
      offers,
    });
  });
  f('json', (value) =>
    JSON.stringify(value, (key, item) => (item instanceof Drop ? item.valueOf() : item)).replace(/<\//g, '<\\/')
  );
}

/* ------------------------------------------------------------------ */
/* Tag simulati                                                         */
/* ------------------------------------------------------------------ */
function silentBlock(name) {
  return class extends Tag {
    constructor(token, remainTokens, liquid) {
      super(token, remainTokens, liquid);
      while (remainTokens.length) {
        const next = remainTokens.shift();
        if (TypeGuards.isTagToken(next) && next.name === 'end' + name) return;
      }
      throw new Error(`{% ${name} %} senza {% end${name} %}`);
    }
    render() {
      return '';
    }
  };
}

class FormTag extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    const tokenizer = this.tokenizer;
    this.formType = tokenizer.readValue();
    tokenizer.skipBlank();
    if (tokenizer.peek() === ',') tokenizer.advance();
    // Secondo argomento facoltativo: l'oggetto (product, customer...), se non è una coppia chiave: valore
    const begin = tokenizer.p;
    tokenizer.skipBlank();
    const identifier = tokenizer.readIdentifier();
    tokenizer.skipBlank();
    const isHash = identifier.content && tokenizer.peek() === ':';
    tokenizer.p = begin;
    if (!isHash && !tokenizer.end()) {
      this.object = tokenizer.readValue();
      tokenizer.skipBlank();
      if (tokenizer.peek() === ',') tokenizer.advance();
    }
    this.hash = new Hash(tokenizer, liquid.options.keyValueSeparator);
    this.templates = [];
    while (remainTokens.length) {
      const next = remainTokens.shift();
      if (TypeGuards.isTagToken(next) && next.name === 'endform') return;
      this.templates.push(parser.parseToken(next, remainTokens));
    }
    throw new Error('{% form %} senza {% endform %}');
  }
  *render(ctx, emitter) {
    const type = yield evalToken(this.formType, ctx);
    const object = this.object ? yield evalToken(this.object, ctx) : null;
    const attrs = yield this.hash.render(ctx);
    if (type !== 'product') throw new Error(`{% form '${type}' %} non è simulato: aggiungilo in render.mjs`);
    const form = { type, id: attrs.id || `product-form-${object ? object.id : ''}`, product: object, errors: null };
    ctx.push({ form });
    const inner = yield this.liquid.renderer.renderTemplates(this.templates, ctx);
    ctx.pop();
    const extra = Object.entries(attrs)
      .filter(([key]) => key !== 'id' && key !== 'class')
      .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
      .join(' ');
    emitter.write(
      `<form method="post" action="/cart/add" id="${escapeAttr(form.id)}" accept-charset="UTF-8" ` +
        `class="shopify-product-form${attrs.class ? ' ' + escapeAttr(attrs.class) : ''}" enctype="multipart/form-data"` +
        (extra ? ' ' + extra : '') +
        '><input type="hidden" name="form_type" value="product" /><input type="hidden" name="utf8" value="✓" />' +
        inner +
        '</form>'
    );
  }
}

class StyleTag extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    this.templates = [];
    while (remainTokens.length) {
      const next = remainTokens.shift();
      if (TypeGuards.isTagToken(next) && next.name === 'endstyle') return;
      this.templates.push(parser.parseToken(next, remainTokens));
    }
    throw new Error('{% style %} senza {% endstyle %}');
  }
  *render(ctx, emitter) {
    const inner = yield this.liquid.renderer.renderTemplates(this.templates, ctx);
    emitter.write(`<style data-shopify>${inner}</style>`);
  }
}

class IncludeTag extends Tag {
  constructor(token) {
    super(token, [], null);
    throw new Error(`{% include %} è vietato (CLAUDE.md §4.4): usa {% render %} — ${token.getText()}`);
  }
}

/* ------------------------------------------------------------------ */
/* Motore                                                               */
/* ------------------------------------------------------------------ */
export function createEngine(globals) {
  liveGlobals = globals;
  Object.assign(globals, floatLiterals);
  const snippets = join(THEME, 'snippets');
  // File system per {% render %}: legge solo da snippets/ e marca i decimali
  const fs = {
    resolve: (dir, file, ext) => resolvePath(snippets, file.endsWith(ext) ? file : file + ext),
    exists: async (file) => existsSync(file),
    existsSync: (file) => existsSync(file),
    readFile: async (file) => markFloats(readFileSync(file, 'utf8')),
    readFileSync: (file) => markFloats(readFileSync(file, 'utf8')),
    contains: async (root, file) => file.startsWith(root),
    containsSync: (root, file) => file.startsWith(root),
    dirname: (file) => dirname(file),
    sep: '/',
  };
  const engine = new Liquid({
    root: [snippets],
    partials: [snippets],
    extname: '.liquid',
    fs,
    relativeReference: false,
    strictFilters: true,
    strictVariables: false,
    jsTruthy: false,
    dynamicPartials: true,
    timezoneOffset: 'Europe/Rome',
    globals,
    cache: false,
  });
  for (const name of ['schema', 'stylesheet', 'javascript', 'doc']) engine.registerTag(name, silentBlock(name));
  engine.registerTag('form', FormTag);
  engine.registerTag('style', StyleTag);
  engine.registerTag('include', IncludeTag);
  registerFilters(engine);
  return engine;
}

function readJson(file) {
  // I JSON generati dall'editor possono iniziare con un commento /* ... */
  const text = readFileSync(file, 'utf8').replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
  return JSON.parse(text);
}

function extractSchema(source, file) {
  const match = source.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  if (!match) throw new Error(`${file}: manca {% schema %}`);
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`${file}: schema non valido — ${error.message}`);
  }
}

function settingsFrom(schemaSettings = [], values = {}) {
  const settings = {};
  for (const setting of schemaSettings) {
    if (!setting.id) continue;
    if (values[setting.id] !== undefined) settings[setting.id] = values[setting.id];
    else if (setting.default !== undefined) settings[setting.id] = setting.default;
    else settings[setting.id] = setting.type === 'checkbox' ? false : null;
    // Le immagini scelte dall'editor (shopify://...) qui non esistono
    if (['image_picker', 'video'].includes(setting.type) && typeof settings[setting.id] === 'string') {
      settings[setting.id] = null;
    }
  }
  return settings;
}

function blocksFrom(schema, entry, sectionId) {
  const definitions = schema.blocks || [];
  let list = [];
  if (entry.blocks && (entry.block_order || Object.keys(entry.blocks).length)) {
    const order = entry.block_order || Object.keys(entry.blocks);
    list = order.map((id) => ({ id, ...entry.blocks[id] }));
  } else if (schema.presets && schema.presets[0] && schema.presets[0].blocks) {
    const presetBlocks = schema.presets[0].blocks;
    list = Array.isArray(presetBlocks)
      ? presetBlocks.map((block, index) => ({ id: `${block.type}_${index + 1}`, ...block }))
      : (schema.presets[0].block_order || Object.keys(presetBlocks)).map((id) => ({ id, ...presetBlocks[id] }));
  }
  return list
    .filter((block) => !block.disabled && !String(block.type).startsWith('@'))
    .map((block) => {
      const definition = definitions.find((item) => item.type === block.type) || {};
      return {
        id: `${sectionId}-${block.id}`,
        type: block.type,
        settings: settingsFrom(definition.settings, block.settings || {}),
        shopify_attributes: '',
      };
    });
}

async function renderSections(engine, data, templateFile) {
  const template = readJson(templateFile);
  const order = template.order || Object.keys(template.sections);
  const seen = new Set();
  let html = '';
  for (const [index, key] of order.entries()) {
    if (seen.has(key)) throw new Error(`${templateFile}: la sezione "${key}" compare due volte in order`);
    seen.add(key);
    const entry = template.sections[key];
    if (!entry) throw new Error(`${templateFile}: la sezione "${key}" è in order ma non in sections`);
    if (entry.disabled) continue;
    const file = join(THEME, 'sections', `${entry.type}.liquid`);
    const source = readFileSync(file, 'utf8');
    const schema = extractSchema(source, `sections/${entry.type}.liquid`);
    const id = `template--20261023__${key}`;
    const section = {
      id,
      index: index + 1,
      index0: index,
      location: 'template',
      settings: settingsFrom(schema.settings, entry.settings || {}),
      blocks: blocksFrom(schema, entry, id),
    };
    const inner = await engine.parseAndRender(markFloats(source), { section, product: data.product });
    const tag = schema.tag || 'div';
    const classes = ['shopify-section', schema.class].filter(Boolean).join(' ');
    html += `<${tag} id="shopify-section-${id}" class="${classes}">${inner}</${tag}>\n`;
  }
  return html;
}

async function renderPage(engine, data, contentForLayout) {
  const layout = readFileSync(join(THEME, 'layout', 'luna-landing.liquid'), 'utf8');
  return engine.parseAndRender(markFloats(layout), {
    content_for_header: data.editorScript,
    content_for_layout: contentForLayout,
    product: data.product,
  });
}

export async function render(options = args) {
  const data = buildData(options);
  const engine = createEngine(data.globals);

  rmSync(paths.out, { recursive: true, force: true });
  mkdirSync(paths.out, { recursive: true });
  cpSync(ASSETS, join(paths.out, 'assets'), { recursive: true });

  const sections = await renderSections(engine, data, join(THEME, 'templates', 'product.luna.json'));
  writeFileSync(join(paths.out, 'index.html'), await renderPage(engine, data, sections));

  // Catalogo dei componenti (snippet, CSS): non fa parte del tema
  const saleFree = buildData(new Set([...options, '--senza-barrato']));
  const soldOut = buildData(new Set([...options, '--esaurito']));
  const guide = await engine.parseAndRender(
    markFloats(readFileSync(join(paths.preview, 'styleguide.liquid'), 'utf8')),
    { product: data.product, product_full_price: saleFree.product, product_sold_out: soldOut.product }
  );
  writeFileSync(join(paths.out, 'styleguide.html'), await renderPage(engine, data, guide));

  const size = statSync(join(paths.out, 'index.html')).size;
  console.log(`✓ studio/preview/out/index.html (${(size / 1024).toFixed(1)} KB) e styleguide.html`);
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  render().catch((error) => {
    console.error('✗ render fallito:', error.message);
    process.exit(1);
  });
}
