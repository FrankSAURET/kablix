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
//   - thumbnail.webp : vignette 200 × 150 du gestionnaire (rendue par Chrome) ;
//   - help/<lang>.md : la fiche d'aide du composant, prise dans
//                      `kablix_components/help/<type>/<lang>.md`, avec les images
//                      posées à côté d'elle. C'est ELLE qu'ouvre le bouton
//                      « Aide du composant » de l'inspecteur : un composant de
//                      bibliothèque n'a rien dans `docs/`, son aide voyage dans
//                      son paquet. `help/<type>.webp` (illustration du dessin,
//                      600 × 450) est ajoutée d'office, comme la vignette.
//
// Usage : node scripts/build-kompix.mjs            (tous les composants décrits)
//         node scripts/build-kompix.mjs spot       (celui-là seulement)
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraireDessins, findChrome } from './_extract-composants.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'kablix_components');
const SCRATCH = join(ROOT, 'node_modules', '.cache-composants');
const SOURCES = join(OUT_DIR, '_sources.json');
const HELP_DIR = join(OUT_DIR, 'help');

/** Vignette du gestionnaire de composants. */
const VIGNETTE = { w: 200, h: 150 };
/** Illustration de tête de fiche (le dessin, en grand). */
const ILLUSTRATION = { w: 600, h: 450 };

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
      // Trop loin pour être un tremblement de souris : c'est voulu (le shield
      // Grove a deux connecteurs à mi-pas). On garde la position vraie.
      const vx = Math.round(p.x * 100) / 100;
      const vy = Math.round(p.y * 100) / 100;
      console.log(`  ! ${type}/${p.name} : ${ecart.toFixed(2)} px hors grille — position gardée telle quelle (${vx},${vy})`);
      return { name: p.name, x: vx, y: vy };
    }
    return { name: p.name, x, y };
  });
}

/**
 * Développe le bloc `shield` d'une carte fille (Grove Shield…). La source décrit
 * les connecteurs UNE fois — nom, colonne, hauteur du premier signal, les quatre
 * signaux du haut vers le bas ; le manifeste, lui, doit être bête et complet.
 * On en tire :
 *   - les pattes supplémentaires (les prises Grove, qui ne sont pas des pastilles
 *     rouges : elles ne se branchent qu'à l'intérieur de la carte) ;
 *   - `socket`   : les pastilles qui s'emboîtent sur la carte hôte ;
 *   - `strips`   : les pistes internes, c'est-à-dire les pattes qui sont un seul
 *                  et même fil (masse commune, un signal Grove et la broche de la
 *                  carte hôte où il aboutit) ;
 *   - `switch.pins` : les VCC des prises, que l'interrupteur bascule d'un rail à
 *                  l'autre — le rail choisi est ajouté à leur piste à l'exécution.
 */
function etendreShield(comp, socket) {
  const src = comp.shield;
  if (!src) return null;
  const connus = new Set(socket.map((p) => p.name));
  const pins = [];
  const masses = [...(src.ground ?? [])];
  const alims = [];
  const parCible = new Map(); // broche de la carte hôte -> signaux Grove qui y vont
  for (const port of src.ports) {
    port.pins.forEach((sig, i) => {
      const name = `${port.name}.${sig}`;
      pins.push({ name, x: port.x, y: port.y + i * 10 });
      if (sig === 'GND') { masses.push(name); return; }
      if (sig === 'VCC') { alims.push(name); return; }
      const cible = src.signals?.[sig];
      if (!cible) throw new Error(`${comp.type} : le signal « ${sig} » du connecteur ${port.name} n'a pas de destination (bloc signals).`);
      if (!connus.has(cible)) throw new Error(`${comp.type} : ${name} vise « ${cible} », qui n'est pas une pastille du dessin.`);
      if (!parCible.has(cible)) parCible.set(cible, []);
      parCible.get(cible).push(name);
    });
  }
  // Pattes doublées sur la carte : deux trous, un seul fil (A4/A4.2…).
  const jumelles = new Map();
  for (const groupe of src.ties ?? []) for (const n of groupe) jumelles.set(n, groupe);
  const strips = [masses];
  const vus = new Set();
  for (const cible of parCible.keys()) {
    if (vus.has(cible)) continue;
    const groupe = jumelles.get(cible) ?? [cible];
    for (const n of groupe) vus.add(n);
    strips.push([...groupe, ...groupe.flatMap((n) => parCible.get(n) ?? [])]);
  }
  const shield = { host: src.host ?? 'mcu', socket: socket.map((p) => p.name), strips };
  if (src.switch) shield.switch = { ...src.switch, pins: alims };
  return { pins, shield };
}

/** Corps d'un dessin extrait, defs comprises, prêt à être enveloppé dans un `<g>`. */
function contenu(item) {
  return (item.defs.length ? `<defs>${item.defs.join('')}</defs>` : '') + item.body;
}

/**
 * Images WebP du lot, en un seul passage de Chrome : la vignette du gestionnaire
 * ET l'illustration de tête de fiche, qui est le même dessin en plus grand —
 * jamais une capture d'écran à la main.
 */
function vignettes(dessins) {
  mkdirSync(SCRATCH, { recursive: true });
  const page = join(SCRATCH, 'kompix-thumbs.html');
  const svgs = dessins.map((d) => Buffer.from(d.svg, 'utf8').toString('base64'));
  writeFileSync(page, `<!doctype html><meta charset="utf-8"><body><pre id="out"></pre><script>
const SVGS = ${JSON.stringify(svgs)};
const TAILLES = ${JSON.stringify([VIGNETTE, ILLUSTRATION])};
(async () => {
  const parts = [];
  for (const b64 of SVGS) {
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = 'data:image/svg+xml;base64,' + b64; });
    const rendus = [];
    for (const { w: W, h: H } of TAILLES) {
      // Dessin CONTENU dans le cadre, proportions gardées, fond transparent.
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const k = Math.min(W / img.width, H / img.height);
      const w = img.width * k, h = img.height * k;
      c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      rendus.push(c.toDataURL('image/webp', 0.92).split(',')[1]);
    }
    parts.push(rendus);
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
  return JSON.parse(raw).map(([thumb, illu]) => ({
    thumb: Buffer.from(thumb, 'base64'),
    illustration: Buffer.from(illu, 'base64'),
  }));
}

/**
 * Fiches d'aide et images à embarquer, prises dans `kablix_components/help/<type>/`.
 * Convention : un fichier `<lang>.md` par langue (`fr.md`, la langue de base des
 * documents du projet), les illustrations posées à CÔTÉ et référencées en chemin
 * relatif depuis le Markdown (`![…](montage.webp)`).
 */
function aide(type) {
  const dir = join(HELP_DIR, type);
  if (!existsSync(dir)) return { langs: [], files: new Map() };
  const langs = [];
  const files = new Map();
  for (const name of readdirSync(dir)) {
    const lang = /^([a-z]{2})\.md$/i.exec(name)?.[1]?.toLowerCase();
    if (lang) {
      langs.push(lang);
      files.set(`${lang}.md`, readFileSync(join(dir, name)));
    } else if (/\.(webp|png|jpe?g|gif|svg|mp4|webm)$/i.test(name)) {
      files.set(name, readFileSync(join(dir, name)));
    }
  }
  return { langs: langs.sort(), files };
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
    const socket = calerGrille(nomsUniques(ext.pins), comp.type);
    const shield = etendreShield(comp, socket);
    const pins = shield ? [...socket, ...calerGrille(shield.pins, comp.type)] : socket;
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
      // Sortie à collecteur ouvert : nom de la patte de sortie et paires
      // [V+, GND] à alimenter. Sans ce bloc, Kablix ne saurait pas qu'il faut
      // un rappel au plus pour que le composant marche.
      openDrain: comp.openDrain,
      // Traductions des libellés du composant : le catalogue de Kablix ne
      // connaît que ses composants natifs, un composant de bibliothèque emporte
      // donc les siennes dans son paquet (voir kompix_specification.md).
      l10n: comp.l10n,
      // Carte fille : ce qui s'emboîte sur la carte hôte et ce qui est relié à
      // quoi à l'intérieur. Sans ce bloc, les prises Grove ne seraient câblées
      // sur rien du tout.
      shield: shield?.shield,
    };
    const fiche = aide(comp.type);
    if (fiche.langs.length) manifest.help = fiche.langs;
    for (const k of Object.keys(manifest)) if (manifest[k] === undefined) delete manifest[k];

    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('schema.svg', schema);
    zip.file('thumbnail.webp', thumbs[i].thumb);
    if (fiche.langs.length) {
      // L'illustration de tête est refaite à chaque construction : elle suit le
      // dessin de la planche, la fiche n'a qu'à la nommer `<type>.webp`.
      zip.file(`help/${comp.type}.webp`, thumbs[i].illustration);
      for (const [name, bytes] of fiche.files) zip.file(`help/${name}`, bytes);
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    const file = join(OUT_DIR, `${comp.type}.kompix`);
    writeFileSync(file, buf);
    const mentionAide = fiche.langs.length ? `, aide ${fiche.langs.join('/')}` : ', SANS aide';
    console.log(`  ✓ ${comp.type}.kompix  (${(buf.length / 1024).toFixed(1)} Ko, viewBox ${ext.viewBox}${int ? ', schéma interne' : ''}${mentionAide})`);
    console.log(`    pins : ${pins.map((p) => `${p.name}(${p.x},${p.y})`).join(' ')}`);
  }
  console.log(`\n→ ${dessins.length} paquet(s) dans kablix_components/ — lancer « node scripts/build-components-index.mjs » pour l'index.`);
}

main().catch((err) => {
  console.error('\n✗ Erreur :', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
