// Fabrique les paquets .kompix de la bibliothèque publique `kablix_components/`
// à partir des dessins de la planche Inkscape (« Composants2D.svg »).
//
// Un composant de bibliothèque n'est PAS un composant natif : il ne vit pas dans
// `src/webview/composants/`, il n'a pas d'élément Lit, il se télécharge depuis le
// dépôt par le gestionnaire de composants. Son dessin vient pourtant de la même
// planche, avec les mêmes conventions (groupe nommé, pastilles rouges) — d'où ce
// script, qui appelle le lecteur de planche puis empaquette.
//
// Ce qu'il produit, par composant décrit dans `kablix_components/_sources.json` :
//   - schema.svg     : `<g id="<type>">` (+ `<g id="<type>-interne">` si dessiné),
//                      defs À L'INTÉRIEUR du groupe — la bibliothèque n'extrait
//                      que le contenu du groupe, un dégradé laissé dehors serait
//                      perdu et le composant s'afficherait en noir ;
//   - manifest.json  : identité, brochage, classement ;
//   - thumbnail.webp : vignette 200 × 150 du gestionnaire (rendue par Chrome).
//
// Usage : node scripts/build-kompix.mjs            (tous les composants décrits)
//         node scripts/build-kompix.mjs spot       (celui-là seulement)
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireDessins, findChrome } from './_extract-composants.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'kablix_components');
const SCRATCH = join(ROOT, 'node_modules', '.cache-composants');
const SOURCES = join(OUT_DIR, '_sources.json');

/** Vignette du gestionnaire de composants. */
const VIGNETTE = { w: 200, h: 150 };

/**
 * Noms de pattes uniques. Deux pastilles peuvent porter le MÊME nom sur la
 * planche — la carte Grove-DMX512 a une masse côté Grove et une masse côté XLR,
 * toutes deux marquées « GND ». La netlist, elle, désigne une patte par son nom :
 * le doublon est numéroté comme partout ailleurs dans le projet (`GND.1`,
 * `GND.2`, comme `Com.1`/`Com.2` du relais).
 */
function nomsUniques(pins) {
  const compte = new Map();
  for (const p of pins) compte.set(p.name, (compte.get(p.name) ?? 0) + 1);
  const vus = new Map();
  return pins.map((p) => {
    if (compte.get(p.name) === 1) return p;
    const n = (vus.get(p.name) ?? 0) + 1;
    vus.set(p.name, n);
    return { ...p, name: `${p.name}.${n}` };
  });
}

/**
 * Recale les broches sur la grille de 10 px du canevas. Un dessin fait à la main
 * donne des centres à 0,1 px du croisement : le fil s'y accroche quand même,
 * mais le brochage publié doit être propre. Au-delà d'un demi-pas, le script
 * PRÉVIENT au lieu de déplacer — c'est alors le dessin qu'il faut reprendre.
 */
function calerGrille(pins, type) {
  return pins.map((p) => {
    const x = Math.round(p.x / 10) * 10;
    const y = Math.round(p.y / 10) * 10;
    const ecart = Math.max(Math.abs(x - p.x), Math.abs(y - p.y));
    if (ecart > 2) {
      console.log(`  ! ${type}/${p.name} : ${ecart.toFixed(2)} px hors grille (${p.x},${p.y} → ${x},${y})`);
    }
    return { name: p.name, x, y };
  });
}

/** Corps d'un dessin extrait, defs comprises, prêt à être enveloppé dans un `<g>`. */
function contenu(item) {
  return (item.defs.length ? `<defs>${item.defs.join('')}</defs>` : '') + item.body;
}

/** Vignettes WebP : un seul passage de Chrome pour tout le lot. */
function vignettes(dessins) {
  mkdirSync(SCRATCH, { recursive: true });
  const page = join(SCRATCH, 'kompix-thumbs.html');
  const svgs = dessins.map((d) => Buffer.from(d.svg, 'utf8').toString('base64'));
  writeFileSync(page, `<!doctype html><meta charset="utf-8"><body><pre id="out"></pre><script>
const SVGS = ${JSON.stringify(svgs)};
const W = ${VIGNETTE.w}, H = ${VIGNETTE.h};
(async () => {
  const parts = [];
  for (const b64 of SVGS) {
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = 'data:image/svg+xml;base64,' + b64; });
    // Dessin CONTENU dans la vignette, proportions gardées, fond transparent.
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const k = Math.min(W / img.width, H / img.height);
    const w = img.width * k, h = img.height * k;
    c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    parts.push(c.toDataURL('image/webp', 0.92).split(',')[1]);
  }
  document.getElementById('out').textContent = JSON.stringify(parts);
})();
</script></body>`);
  const dom = execFileSync(findChrome(), ['--headless', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=20000', '--dump-dom', `file:///${page.replace(/\\/g, '/')}`],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const a = dom.indexOf('<pre id="out">') + 14;
  const b = dom.indexOf('</pre>', a);
  const raw = dom.slice(a, b).replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  if (!raw.trim().startsWith('[')) throw new Error(`vignettes : réponse inattendue de Chrome (${raw.slice(0, 200)})`);
  return JSON.parse(raw).map((b64) => Buffer.from(b64, 'base64'));
}

async function main() {
  if (!existsSync(SOURCES)) {
    console.error(`Rien à faire : ${SOURCES} est absent.`);
    process.exit(1);
  }
  const spec = JSON.parse(readFileSync(SOURCES, 'utf8'));
  const only = new Set(process.argv.slice(2).filter((a) => !a.startsWith('--')));
  const comps = spec.components.filter((c) => only.size === 0 || only.has(c.type));
  if (comps.length === 0) {
    console.error(`Aucun composant décrit ne correspond à : ${[...only].join(', ')}`);
    process.exit(1);
  }

  // Une seule lecture de planche pour tout le lot (Chrome démarre lentement).
  const items = extraireDessins({ names: comps.map((c) => ({ id: c.group, host: null })) });
  const parItem = new Map(items.filter((i) => !i.missing && !i.deja).map((i) => [i.name, i]));

  const dessins = [];
  for (const c of comps) {
    const ext = parItem.get(c.group);
    if (!ext) { console.error(`  ! ${c.type} : groupe « ${c.group} » absent de la planche.`); continue; }
    dessins.push({ comp: c, ext, int: parItem.get(`${c.group}-interne`) ?? null });
  }
  if (dessins.length === 0) process.exit(1);

  const thumbs = vignettes(dessins.map((d) => d.ext));

  mkdirSync(OUT_DIR, { recursive: true });
  for (const [i, d] of dessins.entries()) {
    const { comp, ext, int } = d;
    const pins = calerGrille(nomsUniques(ext.pins), comp.type);
    const groupes =
      `<g id="${comp.type}">${contenu(ext)}</g>` +
      (int ? `<g id="${comp.type}-interne">${contenu(int)}</g>` : '');
    const schema =
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${ext.viewBox}">` +
      groupes + '</svg>\n';

    const manifest = {
      kompixVersion: 1,
      type: comp.type,
      label: comp.label,
      description: comp.description ?? '',
      version: comp.version ?? '1.0.0',
      author: comp.author ?? 'Frank Sauret',
      reference: comp.reference,
      kind: comp.kind ?? 'passive',
      category: comp.category,
      pins,
      pinRoles: comp.pinRoles,
      attrs: comp.attrs,
      params: comp.params,
      control: comp.control ?? null,
    };
    for (const k of Object.keys(manifest)) if (manifest[k] === undefined) delete manifest[k];

    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('schema.svg', schema);
    zip.file('thumbnail.webp', thumbs[i]);
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    const file = join(OUT_DIR, `${comp.type}.kompix`);
    writeFileSync(file, buf);
    console.log(`  ✓ ${comp.type}.kompix  (${(buf.length / 1024).toFixed(1)} Ko, viewBox ${ext.viewBox}${int ? ', schéma interne' : ''})`);
    console.log(`    pins : ${pins.map((p) => `${p.name}(${p.x},${p.y})`).join(' ')}`);
  }
  console.log(`\n→ ${dessins.length} paquet(s) dans kablix_components/ — lancer « node scripts/build-components-index.mjs » pour l'index.`);
}

main().catch((err) => {
  console.error('\n✗ Erreur :', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
