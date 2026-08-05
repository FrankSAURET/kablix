// Boutons de barre RANGÉS derrière un réglage (retour de Frank : « les boutons
// réinitialiser les composants et effacer le schéma ne semblent plus
// nécessaires — 2 propriétés dans les options pour les afficher ou les masquer,
// masquées par défaut »).
//
// Rien n'est supprimé : les deux boutons restent codés et fonctionnels, mais
// masqués tant que le réglage ne les rappelle pas. Le banc suit la chaîne
// entière : réglage déclaré et traduit → envoyé à la vue → bouton masqué dans
// le HTML de départ → montré au réglage.
import { readFileSync } from 'node:fs';
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

if (fails.length) {
  console.log(`\nuiconfig : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
  process.exit(1);
}
console.log(`\nuiconfig : ${ok} contrôles OK — les deux boutons sont masqués par défaut et rappelés par leur réglage.`);
