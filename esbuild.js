// Build de l'extension Kablix.
// Produit trois bundles :
//   - dist/extension.js : code de l'extension (hôte Node, externe : vscode)
//   - dist/zip.js       : JSZip seul, chargé au premier .projix (cf. src/zip.ts)
//   - dist/webview.js   : code du simulateur exécuté dans la webview (navigateur)
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { optimizeSvg } = require('./scripts/svgo-preset');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Heure de build (HH:MM:SS) injectée dans le bundle webview : repère visuel sous
// le nom Kablix pour confirmer, pendant les tests F5, qu'on exécute bien le
// dernier build (cf. habitude de codage). Figée à la compilation.
const BUILD_TIME = new Date().toLocaleTimeString('fr-FR', { hour12: false });

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
    avant += source.length;
    apres += data.length;
    fs.writeFileSync(path.join(dir, out), data);
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
  plugins: [svgoLoader],
  define: { __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
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

async function main() {
  copyPinouts();
  if (watch) {
    const ctxExt = await esbuild.context(extensionConfig);
    const ctxZip = await esbuild.context(zipConfig);
    const ctxWeb = await esbuild.context(webviewConfig);
    const ctxWorker = await esbuild.context(workerConfig);
    await Promise.all([ctxExt.watch(), ctxZip.watch(), ctxWeb.watch(), ctxWorker.watch()]);
    console.log('[watch] build initial terminé, surveillance des fichiers…');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(zipConfig),
      esbuild.build(webviewConfig),
      esbuild.build(workerConfig),
    ]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
