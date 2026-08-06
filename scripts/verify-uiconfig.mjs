// Boutons de barre RANGÉS derrière un réglage (retour de Frank : « les boutons
// réinitialiser les composants et effacer le schéma ne semblent plus
// nécessaires — 2 propriétés dans les options pour les afficher ou les masquer,
// masquées par défaut »).
//
// Rien n'est supprimé : les deux boutons restent codés et fonctionnels, mais
// masqués tant que le réglage ne les rappelle pas. Le banc suit la chaîne
// entière : réglage déclaré et traduit → envoyé à la vue → bouton masqué dans
// le HTML de départ → montré au réglage.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0;
const fails = [];
const check = (label, cond, detail) => {
  if (cond) {
    ok++;
    console.log(`✅ ${label}`);
  } else {
    fails.push(label);
    console.log(`❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const nlsEn = JSON.parse(readFileSync(join(ROOT, 'package.nls.json'), 'utf8'));
const nlsFr = JSON.parse(readFileSync(join(ROOT, 'package.nls.fr.json'), 'utf8'));
const html = readFileSync(join(ROOT, 'src/webview-html.ts'), 'utf8');
const sim = readFileSync(join(ROOT, 'src/webview/sim.mts'), 'utf8');
const panel = readFileSync(join(ROOT, 'src/panel.ts'), 'utf8');
const props = pkg.contributes.configuration.properties;

const BOUTONS = [
  { reglage: 'showResetPartsButton', champ: 'showResetParts', id: 'reset-sim', quoi: 'réinitialiser les composants' },
  { reglage: 'showClearDiagramButton', champ: 'showClearDiagram', id: 'clear-canvas', quoi: 'effacer le schéma' },
];

for (const { reglage, champ, id, quoi } of BOUTONS) {
  const cle = `kablix.${reglage}`;
  const p = props[cle];
  check(`« ${quoi} » : le réglage existe dans les options`, !!p, cle);
  check(`« ${quoi} » : MASQUÉ par défaut`, p?.type === 'boolean' && p?.default === false,
    `type ${p?.type}, défaut ${JSON.stringify(p?.default)}`);
  const nls = p?.description?.replace(/%/g, '');
  check(`« ${quoi} » : description en anglais ET en français`,
    !!nlsEn[nls] && !!nlsFr[nls], nls);
  check(`« ${quoi} » : la description dit qu'il est masqué par défaut`,
    /Hidden by default/.test(nlsEn[nls] ?? '') && /Masqué par défaut/.test(nlsFr[nls] ?? ''));
  check(`« ${quoi} » : le bouton part MASQUÉ du HTML (pas d'apparition fugace)`,
    new RegExp(`<button id="${id}"[^>]*\\shidden[\\s>]`).test(html),
    'sinon il clignote le temps que le réglage arrive');
  check(`« ${quoi} » : l'hôte envoie le réglage à la vue`,
    new RegExp(`${champ}: cfg\\.get<boolean>\\('${reglage}', false\\)`).test(panel));
  check(`« ${quoi} » : la vue le montre ou le masque`,
    new RegExp(`\\.hidden = !msg\\.${champ};`).test(sim));
  check(`« ${quoi} » : le bouton reste FONCTIONNEL (rien n'est supprimé)`,
    new RegExp(`getElementById\\('${id}'\\)`).test(sim)
    && new RegExp(`${id === 'reset-sim' ? 'resetSimBtn' : 'clearCanvasBtn'}\\.addEventListener\\('click'`).test(sim),
    'le réglage masque, il ne retire pas la fonction');
}

check('les réglages sont relus à CHAUD (pas besoin de recharger l\'atelier)',
  /onDidChangeConfiguration\([\s\S]{0,200}affectsConfiguration\('kablix'\)[\s\S]{0,80}postUiConfig\(\)/.test(panel));
check('la vue reçoit aussi les réglages à l\'ouverture',
  /case 'ready':[\s\S]{0,2000}this\.postUiConfig\(\);/.test(panel));

// --- Le rendu RÉEL : `hidden` masque-t-il vraiment ? -------------------------
// Retour de Frank v2026.8.6 : « ils sont décochés dans les paramètres mais les
// boutons restent présents ». Toute la chaîne ci-dessus était pourtant verte —
// parce qu'elle ne regardait que le code. La cause était dans la CASCADE CSS :
// `.canvas-controls__btn { display: flex }` (feuille de l'auteur) l'emporte sur
// le `display: none` que le navigateur pose sur [hidden] (feuille de l'UA), donc
// l'attribut ne masquait RIEN. Ce contrôle-ci mesure le vrai rendu, avec le vrai
// CSS, dans Chrome — c'est le seul qui aurait attrapé le défaut.
{
  const css = readFileSync(join(ROOT, 'media/styles.css'), 'utf8');
  const chrome = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find(existsSync);
  if (!chrome) {
    console.log('⚠️  Chrome introuvable : contrôle de rendu sauté');
  } else {
    const tmp = mkdtempSync(join(tmpdir(), 'kablix-uicfg-'));
    // Tous les boutons de la barre que du code masque par `hidden`, plus un
    // témoin visible : si le témoin disparaissait aussi, la règle serait trop large.
    const ids = ['reset-sim', 'clear-canvas', 'repl', 'internal-toggle'];
    const page = `<!doctype html><meta charset=utf8><style>${css}</style><body>
<div class="canvas-controls">
${ids.map((id) => `<button id="${id}" class="canvas-controls__btn" hidden>x</button>`).join('\n')}
<button id="temoin" class="canvas-controls__btn">v</button>
</div>
<script>
const r = {};
for (const id of ${JSON.stringify([...ids, 'temoin'])}) {
  const el = document.getElementById(id);
  r[id] = { display: getComputedStyle(el).display, w: el.getBoundingClientRect().width };
}
const pre = document.createElement('pre'); pre.id = 'm';
pre.textContent = JSON.stringify(r); document.body.appendChild(pre);
</script>`;
    writeFileSync(join(tmp, 'p.html'), page);
    const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
      '--virtual-time-budget=5000', '--dump-dom',
      `file:///${join(tmp, 'p.html').replace(/\\/g, '/')}`],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const raw = /<pre id="m">([\s\S]*?)<\/pre>/.exec(dom);
    const R = raw ? JSON.parse(raw[1].replace(/&quot;/g, '"')) : null;
    check('rendu : la barre se rend en Chrome headless', !!R, dom.slice(0, 200));
    for (const id of ids) {
      check(`rendu : #${id} avec [hidden] est VRAIMENT invisible`,
        R?.[id]?.display === 'none' && R?.[id]?.w === 0,
        `display ${R?.[id]?.display}, largeur ${R?.[id]?.w}`);
    }
    check('rendu : un bouton SANS [hidden] reste bien visible',
      R?.temoin?.display === 'flex' && R?.temoin?.w > 0,
      `display ${R?.temoin?.display}, largeur ${R?.temoin?.w}`);
  }
}

if (fails.length) {
  console.log(`\nuiconfig : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
  process.exit(1);
}
console.log(`\nuiconfig : ${ok} contrôles OK — les deux boutons sont masqués par défaut et rappelés par leur réglage.`);
