// Build de l'extension Kablix.
// Produit deux bundles :
//   - dist/extension.js : code de l'extension (hôte Node, externe : vscode)
//   - dist/webview.js   : code du simulateur exécuté dans la webview (navigateur)
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

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
  for (const [out, src] of Object.entries(PINOUTS)) {
    fs.copyFileSync(path.join(__dirname, src), path.join(dir, out));
  }
  console.log(`[pinout] ${Object.keys(PINOUTS).length} posters copiés dans dist/pinout/`);
}

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
  // Les dessins de cartes (Pico / Pico W) sont importés comme texte SVG.
  loader: { '.svg': 'text' },
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
