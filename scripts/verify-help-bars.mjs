// L'aide décrit-elle VRAIMENT les barres de commande telles qu'elles sont ?
// (demande de Frank : « Mets à jour l'aide pour les barres de commande —
// simulation, kablix, dessin »). Le texte avait dérivé : le sélecteur de vitesse
// n'avait plus 3 crans mais 5, le bouton « fichier de code » était décrit dans la
// barre de simulation alors qu'il vit dans la barre Kablix, et les boutons
// « explications de défaut » et « schéma interne » n'étaient nulle part.
//
// Le banc part du HTML de l'atelier (la seule source de vérité des barres) et
// exige, pour CHAQUE commande, une trace dans l'aide FR *et* EN. Un bouton ajouté
// demain et oublié dans l'aide fait échouer ce banc : il n'est pas dans la table.
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

const html = readFileSync(join(ROOT, 'src/webview-html.ts'), 'utf8');

/** Section « L'interface » de l'aide : c'est là que les barres sont décrites. */
function sectionInterface(fichier, debut, fin) {
  const texte = readFileSync(join(ROOT, fichier), 'utf8');
  const i = texte.indexOf(debut);
  const j = texte.indexOf(fin, i + 1);
  if (i < 0 || j < 0) return null;
  return texte.slice(i, j);
}
const fr = sectionInterface('docs/fr/USAGE.md', "## L'interface", '## Construire un montage');
const en = sectionInterface('docs/en/USAGE.md', '## The interface', '## Building a circuit');
check("l'aide FR a une section « L'interface »", !!fr);
check("l'aide EN a une section « The interface »", !!en);

/** Découpe une barre du HTML et rend les id de ses commandes. */
function commandes(source, ouverture, fermeture) {
  const i = source.indexOf(ouverture);
  if (i < 0) return [];
  // La fermeture est donnée par la barre : `</header>` pour la barre Kablix, la
  // ligne `</div>` en colonne de tête pour les deux barres du canvas (elles
  // n'imbriquent qu'un <span>, celui du sélecteur de vitesse).
  const fin = source.indexOf(fermeture, i + ouverture.length);
  const bloc = source.slice(i, fin < 0 ? undefined : fin);
  return [...bloc.matchAll(/<(?:button|select|span)\s+id="([\w-]+)"/g)].map((m) => m[1]);
}

const BARRES = [
  { nom: 'Kablix', ouverture: '<header class="toolbar">', fermeture: '</header>' },
  { nom: 'simulation', ouverture: '<div class="canvas-controls" role="toolbar">', fermeture: '\n        </div>' },
  { nom: 'dessin', ouverture: '<div class="canvas-controls canvas-controls--right"', fermeture: '\n        </div>' },
];

// Ce que l'aide doit dire de chaque commande, dans les deux langues. `null` =
// commande volontairement absente de l'aide (masquée en permanence, hors sujet).
const ATTENDU = {
  // Barre Kablix
  brand: [/Kablix v/, /Kablix v/],
  board: null, // sélecteur de carte masqué : la carte se choisit en la posant
  'load-workspace': null, // chargement d'un binaire brut, masqué
  'new-project': [/nouveau projet/i, /new project/i],
  'open-project': [/\bouvrir\b/i, /\bopen\b/i],
  'save-project': [/enregistrer/i, /\bsave\b/i],
  'save-project-as': [/enregistrer sous/i, /save as/i],
  'export-svg': [/en SVG/i, /as SVG/i],
  'toggle-labels': [/\bNoms\b/, /\bNames\b/],
  'rearrange-layout': [/réarranger/i, /rearrange/i],
  'more-btn': [/hamburger/i, /hamburger/i],
  'more-list': null, // le menu lui-même, détaillé via more-btn
  'open-help': [/aide/i, /help/i],
  'project-name': [/nom du projet/i, /project name/i],
  'code-file': [/fichier de code/i, /code file/i],
  status: [/zone d'\*\*état\*\*|d'\*\*état\*\*/i, /\*\*status\*\* area/i],
  'sim-speed': [/Ralentie ?:/i, /Slowed down/i],
  // Barre de simulation
  run: [/démarrer/i, /\bstart\b/i],
  stop: [/arrêter/i, /\bstop\b/i],
  pause: [/pause/i, /pause/i],
  step: [/pas à pas/i, /\*\*step\*\*/i],
  speed: [/🦅 500 %[\s\S]*🐌 1 %/, /🦅 500 %[\s\S]*🐌 1 %/],
  'speed-face': null, // l'animal dessiné sur le bouton `speed`
  repl: [/REPL/, /REPL/],
  'toggle-serial': [/moniteur série/i, /serial monitor/i],
  'toggle-plotter': [/traceur/i, /plotter/i],
  'toggle-faults': [/explications de défaut/i, /fault explanations/i],
  // Barre de dessin
  'internal-toggle': [/schéma interne/i, /internal schematic/i],
  'auto-route': [/autoroutage/i, /autoroute/i],
  'toggle-grid': [/grille/i, /\bgrid\b/i],
  'fit-view': [/recentrer/i, /recenter/i],
  'reset-sim': [/réinitialiser les composants/i, /reset all components/i],
  'clear-canvas': [/gomme/i, /eraser/i],
};

for (const { nom, ouverture, fermeture } of BARRES) {
  const ids = commandes(html, ouverture, fermeture);
  check(`barre ${nom} : ses commandes sont trouvées dans le HTML`, ids.length >= 5, `${ids.length} id`);
  for (const id of ids) {
    if (!(id in ATTENDU)) {
      check(`barre ${nom} : #${id} est décrit dans l'aide`, false,
        "commande inconnue du banc : l'aide (FR + EN) et ce tableau doivent être complétés");
      continue;
    }
    const attendu = ATTENDU[id];
    if (attendu === null) continue;
    const [reFr, reEn] = attendu;
    check(`barre ${nom} : #${id} décrit dans l'aide FR`, reFr.test(fr ?? ''), String(reFr));
    check(`barre ${nom} : #${id} décrit dans l'aide EN`, reEn.test(en ?? ''), String(reEn));
  }
}

// Deux boutons sont masqués par défaut (réglages) : l'aide DOIT le dire, sinon on
// envoie le lecteur chercher un bouton qu'il n'a pas.
check("l'aide FR dit que ⟲ et la gomme sont masqués par défaut",
  (fr?.match(/Masqué par défaut/g) ?? []).length >= 2);
check("l'aide EN dit que ⟲ et la gomme sont masqués par défaut",
  (en?.match(/Hidden by default/g) ?? []).length >= 2);

// Anciennes descriptions à ne pas laisser traîner.
check("l'aide ne décrit plus le sélecteur de vitesse à 3 crans",
  !/🐇\/🐢\/🐌/.test(readFileSync(join(ROOT, 'docs/fr/USAGE.md'), 'utf8'))
  && !/🐇\/🐢\/🐌/.test(readFileSync(join(ROOT, 'docs/en/USAGE.md'), 'utf8')));

if (fails.length) {
  console.log(`\naide des barres : ${fails.length} ÉCHEC(S) sur ${ok + fails.length} contrôles.`);
  process.exit(1);
}
console.log(`\naide des barres : ${ok} contrôles OK — les trois barres sont décrites, FR et EN.`);
