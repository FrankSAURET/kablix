// Build de l'extension Kablix.
// Produit cinq bundles :
//   - dist/extension.js : code de l'extension (hôte Node, externe : vscode)
//   - dist/zip.js       : JSZip seul, chargé au premier .projix (cf. src/zip.ts)
//   - dist/webview.js   : code du simulateur exécuté dans la webview (navigateur)
//   - dist/webview-worker.js : le moteur de simulation, dans un Web Worker
//   - dist/analyseur.js : l'onglet de l'analyseur logique (page à part)
//   - dist/i18n-<langue>.js : un dictionnaire de traduction par langue (fr, es, zh)
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { optimizeSvg } = require('./scripts/svgo-preset');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Numéro de build (buildNumber du manifeste) injecté dans le bundle webview :
// affiché sous la version, il dit quel lot on exécute. Il reste dans le .vsix et
// à la publication — contrairement à l'heure de construction qu'il remplace, un
// numéro de lot garde son sens chez l'utilisateur.
const BUILD_NUMBER = String(require('./package.json').buildNumber ?? '');

// Versions des bibliothèques de simulation (avr8js, rp2040js, lit…) injectées
// dans l'extension : updates.ts les compare au registre npm. Injectées une par
// une plutôt que par require du manifeste — 10,7 Ko de package.json en moins
// dans dist/extension.js, donc autant de moins à lire au démarrage.
const DEPENDENCIES = require('./package.json').dependencies ?? {};

// Posters de brochage (bouton ☢) : ~4,8 Mo de SVG à eux sept. Ils ne sont PAS
// inlinés dans webview.js — la webview les chargerait à chaque ouverture de
// projet alors qu'ils ne servent qu'à la demande. Copiés tels quels dans
// dist/pinout/ (déjà une racine de ressources autorisée) et récupérés par fetch.
const PINOUTS = {
  'pico.svg': 'src/webview/composants/interne/pico-pinout.svg',
  'picow.svg': 'src/webview/composants/interne/picow-pinout.svg',
  'pico2.svg': 'src/webview/composants/interne/pico2-pinout.svg',
  'pico2w.svg': 'src/webview/composants/interne/pico2w-pinout.svg',
  'uno.svg': 'src/webview/composants/interne/uno-pinout.svg',
  'mega.svg': 'src/webview/composants/interne/mega pinout.svg',
  'nano.svg': 'src/webview/composants/interne/nano pinout.svg',
};

function copyPinouts() {
  const dir = path.join(__dirname, 'dist', 'pinout');
  fs.mkdirSync(dir, { recursive: true });
  let avant = 0, apres = 0;
  for (const [out, src] of Object.entries(PINOUTS)) {
    const source = fs.readFileSync(path.join(__dirname, src), 'utf8');
    const { data } = optimizeSvg(source, out);
    // SVGO efface les commentaires : le crédit d'origine du poster (« Pinout:
    // Arduino (modified) »…) disparaissait du fichier livré. On le replace en
    // tête — il doit voyager avec le dessin, pas rester dans la source.
    const credit = /<!--\s*Pinout:[^>]*?-->/.exec(source)?.[0];
    const final = credit ? `${credit}\n${data}` : data;
    avant += source.length;
    apres += final.length;
    fs.writeFileSync(path.join(dir, out), final);
  }
  const ko = (n) => `${(n / 1024).toFixed(0)} Ko`;
  console.log(`[pinout] ${Object.keys(PINOUTS).length} posters copiés dans dist/pinout/ (${ko(avant)} → ${ko(apres)})`);
}

// Les dessins de composants sont inlinés en texte dans webview.js : les optimiser
// à la volée allège le bundle (~40 %) sans toucher aux sources retouchées.
const svgoLoader = {
  name: 'svgo',
  setup(build) {
    build.onLoad({ filter: /\.svg$/ }, (args) => {
      const source = fs.readFileSync(args.path, 'utf8');
      const { data } = optimizeSvg(source, path.basename(args.path));
      return { contents: data, loader: 'text' };
    });
  },
};

// Dictionnaires de traduction HORS des bundles de page (v2026.9.7.176) : chaque
// langue ajoutée coûtait 40 à 50 Ko à webview.js ET à analyseur.js, chargés et
// analysés à chaque ouverture même quand la langue ne sert pas. Dans les deux
// bundles, i18n.mts lit désormais `globalThis.KABLIX_DICTS`, que remplit le seul
// dist/i18n-<langue>.js de la langue de VS Code, posé par la page juste avant son
// script (webview-html.ts, analyseur-panel.ts). Les sources ne changent pas : les
// bancs qui bundlent i18n.mts eux-mêmes gardent tous les dictionnaires.
const LANGUES_DICTS = { fr: null, es: 'ES', zh: 'ZH' };
const I18N = path.join(__dirname, 'src', 'webview', 'i18n.mts');
const DEBUT_FR = 'const FR: Record<string, string> = {';
const FIN_FR = '\n// `zh` : chinois simplifié';

/** Le dictionnaire français, écrit en tête d'i18n.mts : de `{` à `}` inclus. */
function objetFr(source) {
  const i = source.indexOf(DEBUT_FR);
  const j = source.lastIndexOf('};', source.indexOf(FIN_FR));
  if (i < 0 || j < i) throw new Error('i18n.mts : dictionnaire FR introuvable');
  return source.slice(i + DEBUT_FR.length - 1, j + 1);
}

const dictionnairesExternes = {
  name: 'dictionnaires-externes',
  setup(build) {
    build.onLoad({ filter: /[\\/]webview[\\/]i18n\.mts$/ }, (args) => {
      let s = fs.readFileSync(args.path, 'utf8');
      const fr = objetFr(s);
      s = s.replace(fr, '{}').replace(/^import \{ \w+ \} from '\.\/i18n-\w+\.mjs';\r?\n/gm, '');
      const avant = s;
      s = s.replace(/const DICTS: Record<string, Record<string, string>> = \{[^}]*\};/,
        'const DICTS: Record<string, Record<string, string>> = (globalThis as { KABLIX_DICTS?: Record<string, Record<string, string>> }).KABLIX_DICTS ?? {};');
      if (s === avant) throw new Error('i18n.mts : table DICTS introuvable');
      return { contents: s, loader: 'ts' };
    });
  },
};

/** Configuration d'un dictionnaire : un IIFE qui range la langue dans KABLIX_DICTS. */
function configDict(langue) {
  const nom = LANGUES_DICTS[langue];
  const contents = nom
    ? `import { ${nom} } from './i18n-${langue}.mjs';\n((globalThis as any).KABLIX_DICTS ??= {}).${langue} = ${nom};\n`
    : `((globalThis as any).KABLIX_DICTS ??= {}).fr = ${objetFr(fs.readFileSync(I18N, 'utf8'))};\n`;
  return {
    stdin: { contents, resolveDir: path.dirname(I18N), loader: 'ts', sourcefile: `i18n-${langue}-dict.ts` },
    bundle: true,
    outfile: `dist/i18n-${langue}.js`,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    charset: 'utf8',
    minify: production,
    logLevel: 'info',
  };
}

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  // `./zip` reste un require différé vers dist/zip.js, voisin de dist/extension.js :
  // les 115 Ko de JSZip ne sont ni lus ni analysés au démarrage de VS Code.
  external: ['vscode', './zip.js'],
  // Versions des bibliothèques surveillées (updates.ts) : figées ici plutôt que
  // via `require('../package.json')`, qui aurait inliné tout le manifeste.
  define: { __DEPENDENCIES__: JSON.stringify(DEPENDENCIES) },
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const zipConfig = {
  entryPoints: ['src/zip.ts'],
  bundle: true,
  outfile: 'dist/zip.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ['src/webview/sim.mts'],
  bundle: true,
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  // Les dessins de cartes (Pico / Pico W) sont importés comme texte SVG, optimisés
  // au passage par svgoLoader (le loader texte reste le repli si le plugin saute).
  // Le feu des composants grillés (utils/boum.webp, ~21 Ko) est inliné en data URI
  // — la CSP de la webview autorise déjà `img-src … data:`.
  loader: { '.svg': 'text', '.webp': 'dataurl' },
  plugins: [svgoLoader, dictionnairesExternes],
  // Texte non ASCII (accents, chinois) écrit tel quel et non en `\\uXXXX` : plus court.
  charset: 'utf8',
  define: { __BUILD_NUMBER__: JSON.stringify(BUILD_NUMBER) },
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/**
 * Fil de simulation (Web Worker) : le moteur avr8js/rp2040js hors du fil principal.
 * Bundle à part — un worker ne partage pas le contexte de la page, il lui faut son
 * propre code. Il ne contient QUE le moteur : ni Lit, ni dessins de composants,
 * ni éditeur, d'où un bundle sans rapport avec les 3,2 Mo de webview.js.
 * @type {import('esbuild').BuildOptions}
 */
const workerConfig = {
  entryPoints: ['src/webview/engines/sim-worker.mts'],
  bundle: true,
  outfile: 'dist/webview-worker.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/**
 * Onglet de l'analyseur logique : une page à part, donc un bundle à part. Elle
 * n'a besoin ni de Lit, ni des dessins de composants, ni de l'éditeur — juste
 * de la capture, du décodage, du rendu et du dictionnaire de traduction.
 * @type {import('esbuild').BuildOptions}
 */
const analyseurConfig = {
  entryPoints: ['src/webview/analyseur.mts'],
  bundle: true,
  outfile: 'dist/analyseur.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  plugins: [dictionnairesExternes],
  charset: 'utf8',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

async function main() {
  copyPinouts();
  if (watch) {
    const ctxExt = await esbuild.context(extensionConfig);
    const ctxZip = await esbuild.context(zipConfig);
    const ctxWeb = await esbuild.context(webviewConfig);
    const ctxWorker = await esbuild.context(workerConfig);
    const ctxAnal = await esbuild.context(analyseurConfig);
    const ctxDicts = await Promise.all(Object.keys(LANGUES_DICTS).map((l) => esbuild.context(configDict(l))));
    await Promise.all([
      ctxExt.watch(),
      ctxZip.watch(),
      ctxWeb.watch(),
      ctxWorker.watch(),
      ctxAnal.watch(),
      ...ctxDicts.map((c) => c.watch()),
    ]);
    console.log('[watch] build initial terminé, surveillance des fichiers…');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(zipConfig),
      esbuild.build(webviewConfig),
      esbuild.build(workerConfig),
      esbuild.build(analyseurConfig),
      ...Object.keys(LANGUES_DICTS).map((l) => esbuild.build(configDict(l))),
    ]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
