// Build de l'extension Kablix.
// Produit deux bundles :
//   - dist/extension.js : code de l'extension (hôte Node, externe : vscode)
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

// Posters de brochage (bouton ☢) : ~3,7 Mo de SVG à eux cinq. Ils ne sont PAS
// inlinés dans webview.js — la webview les chargerait à chaque ouverture de
// projet alors qu'ils ne servent qu'à la demande. Copiés tels quels dans
// dist/pinout/ (déjà une racine de ressources autorisée) et récupérés par fetch.
const PINOUTS = {
  'pico.svg': 'src/webview/composants/interne/pico-pinout.svg',
  'picow.svg': 'src/webview/composants/interne/picow-pinout.svg',
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
  loader: { '.svg': 'text' },
  plugins: [svgoLoader],
  define: { __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

async function main() {
  copyPinouts();
  if (watch) {
    const ctxExt = await esbuild.context(extensionConfig);
    const ctxWeb = await esbuild.context(webviewConfig);
    await Promise.all([ctxExt.watch(), ctxWeb.watch()]);
    console.log('[watch] build initial terminé, surveillance des fichiers…');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
