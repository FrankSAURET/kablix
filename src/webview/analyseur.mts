// Page de l'ONGLET « Analyseur logique ».
//
// POURQUOI UN ONGLET SÉPARÉ, et rien sous le canvas. Le traceur de courbes vit
// dans un bandeau sous la zone de dessin : il regarde quelques valeurs lentes,
// un bandeau suffit. Un analyseur logique regarde huit voies avec leurs
// créneaux et leurs trames décodées — il lui faut de la HAUTEUR et de la
// LARGEUR, et surtout il se lit EN MÊME TEMPS que le schéma. Un onglet que
// l'élève pose à côté de l'atelier donne exactement ça ; un bandeau sous le
// dessin volerait la place du dessin.
//
// D'OÙ VIENNENT LES DONNÉES. Cette page ne simule rien et ne parle pas au
// moteur : l'atelier (sim.mts) lui envoie, par l'hôte, les voies déclarées puis
// les salves de fronts au fil du run. L'onglet n'est donc jamais un second
// client de la simulation — il ne peut pas la ralentir ni la faire diverger.
//
// HORS SIMULATION. L'onglet montre la DERNIÈRE capture, pas du vide : elle est
// enregistrée dans le .projix avec le schéma. Ouvert le lendemain, il montre ce
// que l'élève avait mesuré la veille.

import { AnalyseurCapture } from './analyseur-capture.mjs';
import { AnalyseurVue, type Fenetre, type TextesVue, type VoieVue } from './analyseur-vue.mjs';
import {
  decoder,
  reglageComplet,
  rolesDe,
  type Annotation,
  type Protocole,
  type ReglageDecodage,
} from './analyseur-decodage.mjs';
import { couleurVoie, themeSombre } from './voies-couleurs.mjs';
import { initLocale, locale, t } from './i18n.mjs';

declare global {
  interface Window {
    KABLIX_LANG?: string;
    acquireVsCodeApi?: () => { postMessage(m: unknown): void };
  }
}

/** Message reçu de l'hôte (relayé depuis l'atelier). */
type MessageEntrant =
  /** Déclaration des voies : envoyée au départ du run et à chaque changement de sonde. */
  | {
      type: 'voies';
      voies: Array<{
        voie: number;
        nom: string;
        pin: string;
        probleme: 'nowhere' | 'not-mcu' | 'power' | null;
        analogique: boolean;
        /** Broche trouvée en suivant le fil, la pince n'étant pas sur la carte. */
        suivi?: boolean;
      }>;
    }
  /** Salve de fronts : `{ broche: [t, niveau, …] }`, en ms simulées. */
  | { type: 'fronts'; salves: Record<string, number[]> }
  /** Départ d'un run : la capture précédente est effacée. */
  | { type: 'depart' }
  /** Fin d'un run : la vue se fige sur ce qu'elle a. */
  | { type: 'arret' }
  /** Capture complète restaurée depuis le .projix (ouverture hors simulation). */
  | { type: 'restaure'; etat: EtatSerialise };

/** Capture enregistrée dans le .projix (forme compacte). */
export interface EtatSerialise {
  voies: Array<{
    voie: number;
    nom: string;
    pin: string;
    /** Fronts à plat : [t, niveau, t, niveau, …]. */
    fronts: number[];
    niveauInitial: 0 | 1 | null;
  }>;
  declenchement?: { voie: number; sens: 'rising' | 'falling' } | null;
  decodage?: ReglageDecodage | null;
}

const vscode = window.acquireVsCodeApi?.();
initLocale(window.KABLIX_LANG);

const capture = new AnalyseurCapture();
/** Diagnostic de câblage par voie : il vient du schéma, pas de la capture. */
let diagnostics: VoieVue[] = [];
let fenetre: Fenetre = { t0: 0, duree: 10 };
/** Vrai tant que la vue suit la fin de la capture (zoom molette la libère). */
let suivi = true;
let souris: { x: number; y: number } | null = null;
let annotations: Annotation[] = [];
let reglage: ReglageDecodage | null = null;
/** Vrai pendant un run : la vue se redessine en continu. */
let enCours = false;

const canvas = document.getElementById('trace') as HTMLCanvasElement;
const vue = new AnalyseurVue(canvas);

const textes = (): TextesVue => ({
  aucuneSonde: t('No logic probe on the board — clip one onto a pin.'),
  aucuneDonnee: t('No edge captured yet.'),
  nowhere: t('This probe is not on any pad.'),
  notMcu: t('This point is not wired to any board pin.'),
  power: t('Power pin: a constant level, no edge to show.'),
  analogique: t('analog-capable pin: only 0/1 shown'),
  enAttente: t('Waiting for the trigger edge…'),
});

// --- Fenêtre de temps : zoom, défilement, suivi -------------------------------

/**
 * Recale la fenêtre sur la fin de la capture tant que l'élève n'a pas zoomé.
 * Le suivi est ce qui rend l'onglet lisible pendant un run : sans lui, les
 * créneaux défileraient hors de l'écran dès la première seconde.
 */
function suivreFin(): void {
  if (!suivi) return;
  const fin = capture.tFin;
  if (fin <= 0) return;
  fenetre = { t0: Math.max(0, fin - fenetre.duree), duree: fenetre.duree };
}

/** Zoom autour d'un point de temps (molette) : le point sous la souris ne bouge pas. */
function zoomer(facteur: number, tAncre: number): void {
  const duree = Math.min(600_000, Math.max(0.0005, fenetre.duree * facteur));
  const part = (tAncre - fenetre.t0) / fenetre.duree;
  fenetre = { t0: tAncre - part * duree, duree };
  suivi = false;
  dessiner();
}

/** Ramène la vue sur toute la capture (bouton « Tout »). */
function ajuster(): void {
  const fin = capture.tFin;
  fenetre = { t0: 0, duree: fin > 0 ? fin * 1.02 : 10 };
  suivi = false;
  dessiner();
}

/** Remet le suivi de la fin (bouton « Suivre »). */
function suivreFinDemande(): void {
  suivi = true;
  suivreFin();
  dessiner();
}

// --- Rendu -------------------------------------------------------------------

let raf = 0;

function dessiner(): void {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    rendu();
  });
}

function rendu(): void {
  const n = Math.max(diagnostics.length, 1);
  const hauteur = vue.hauteurPour(n);
  if (canvas.style.height !== `${hauteur}px`) canvas.style.height = `${hauteur}px`;
  annotations = calculerAnnotations();
  vue.dessiner({
    capture,
    voies: diagnostics,
    fenetre,
    annotations,
    souris,
    textes: textes(),
    lang: locale(),
  });
  majEtiquettes();
}

/** Décodage : recalculé à chaque rendu, sur la fenêtre visible seulement. */
function calculerAnnotations(): Annotation[] {
  if (!reglage || !reglageComplet(reglage)) return [];
  // On ne décode QUE la fenêtre visible, marge d'un octet de chaque côté : à
  // pleine profondeur (60 000 fronts par voie) décoder tout l'enregistrement à
  // chaque image de l'écran coûterait des centaines de milliers d'opérations
  // pour afficher vingt étiquettes.
  const marge = fenetre.duree * 0.1;
  const t0 = fenetre.t0 - marge;
  const t1 = fenetre.t0 + fenetre.duree + marge;
  const tranche = capture.listeVoies.map((v) => ({
    ...v,
    niveauInitial: capture.niveauA(v.voie, t0),
    fronts: v.fronts.filter((f) => f.t >= t0 && f.t <= t1),
  }));
  return decoder(tranche, reglage);
}

// --- Barre d'outils ----------------------------------------------------------

const selDeclVoie = document.getElementById('decl-voie') as HTMLSelectElement;
const selDeclSens = document.getElementById('decl-sens') as HTMLSelectElement;
const selProto = document.getElementById('proto') as HTMLSelectElement;
const zoneRoles = document.getElementById('roles') as HTMLDivElement;
const etatTexte = document.getElementById('etat') as HTMLSpanElement;
const legende = document.getElementById('legende') as HTMLDivElement;

/** Remplit un sélecteur de voie avec les voies traçables. */
function remplirVoies(sel: HTMLSelectElement, aucun: string): void {
  const avant = sel.value;
  sel.textContent = '';
  const vide = document.createElement('option');
  vide.value = '';
  vide.textContent = aucun;
  sel.append(vide);
  for (const d of diagnostics) {
    if (d.probleme) continue; // une voie en défaut ne déclenche ni ne décode rien
    const o = document.createElement('option');
    o.value = String(d.voie);
    o.textContent = d.nom;
    sel.append(o);
  }
  sel.value = [...sel.options].some((o) => o.value === avant) ? avant : '';
}

/** Reconstruit les sélecteurs de rôle du protocole choisi. */
function majRoles(): void {
  zoneRoles.textContent = '';
  const p = selProto.value as Protocole | '';
  if (!p) {
    reglage = null;
    return;
  }
  const precedent = reglage && reglage.protocole === p ? reglage : null;
  const neuf: ReglageDecodage = precedent ?? { protocole: p };
  neuf.protocole = p;
  for (const role of rolesDe(p)) {
    const lab = document.createElement('label');
    lab.className = 'role';
    lab.textContent = role.nom;
    const sel = document.createElement('select');
    remplirVoies(sel, role.obligatoire ? '—' : t('none'));
    const courant = neuf[role.cle];
    if (typeof courant === 'number') sel.value = String(courant);
    sel.addEventListener('change', () => {
      const v = sel.value === '' ? -1 : Number(sel.value);
      // Les rôles de voie (`horloge`, `donnees`…) sont tous des indices de voie :
      // l'écriture indexée est sûre, le nom de clé vient de `rolesDe`.
      (neuf as unknown as Record<string, number>)[role.cle] = v;
      dessiner();
      envoyerReglages();
    });
    lab.append(sel);
    zoneRoles.append(lab);
  }
  if (p === 'spi') {
    // Le mode SPI (CPOL/CPHA) n'est pas devinable depuis les créneaux : deux
    // modes donnent les mêmes fronts et des octets différents. C'est un réglage,
    // comme sur un analyseur du commerce.
    const lab = document.createElement('label');
    lab.className = 'role';
    lab.textContent = t('Mode');
    const sel = document.createElement('select');
    for (const m of [0, 1, 2, 3]) {
      const o = document.createElement('option');
      o.value = String(m);
      o.textContent = String(m);
      sel.append(o);
    }
    sel.value = String(neuf.mode ?? 0);
    sel.addEventListener('change', () => {
      neuf.mode = Number(sel.value) as 0 | 1 | 2 | 3;
      dessiner();
      envoyerReglages();
    });
    lab.append(sel);
    zoneRoles.append(lab);
  }
  reglage = neuf;
}

/** Légende : une puce de la couleur de la pince, son nom, sa broche. */
function majEtiquettes(): void {
  const sombre = themeSombre();
  legende.textContent = '';
  for (const d of diagnostics) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const puce = document.createElement('i');
    puce.style.background = couleurVoie(d.voie, sombre);
    chip.append(puce);
    // « SD2 · GP3 ↝ » : la flèche dit que la pince n'est pas sur la broche
    // nommée mais sur un point relié à elle. L'infobulle l'écrit en toutes
    // lettres — un symbole seul n'explique rien.
    const nom = d.pin ? `${d.nom} · ${d.pin}` : d.nom;
    chip.append(document.createTextNode(d.suivi ? `${nom} ↝` : nom));
    if (d.suivi) chip.title = t('Clipped away from the board: this point is wired to {0}.', d.pin);
    if (d.probleme) chip.classList.add('chip--muet');
    legende.append(chip);
  }
  const fin = capture.tFin;
  etatTexte.textContent = enCours
    ? t('Capturing… {0}', fin.toFixed(1))
    : capture.aDesDonnees
      ? t('Last capture: {0} ms', fin.toFixed(1))
      : '';
}

/** Applique le réglage de déclenchement choisi dans la barre. */
function majDeclenchement(): void {
  const v = selDeclVoie.value;
  if (v === '') {
    capture.reglerDeclenchement(null);
  } else {
    capture.reglerDeclenchement({
      voie: Number(v),
      sens: selDeclSens.value === 'falling' ? 'falling' : 'rising',
    });
  }
  dessiner();
  envoyerReglages();
}

/**
 * Renvoie les réglages à l'hôte pour qu'ils soient enregistrés dans le .projix :
 * retrouver son déclenchement et son décodage à la réouverture fait partie de
 * l'instrument (personne ne rerègle un analyseur à chaque ouverture).
 */
function envoyerReglages(): void {
  vscode?.postMessage({
    type: 'analyseurReglages',
    declenchement: capture.reglageDeclenchement,
    decodage: reglage,
  });
}

// --- Entrées de l'hôte -------------------------------------------------------

window.addEventListener('message', (ev) => {
  const msg = ev.data as MessageEntrant;
  switch (msg.type) {
    case 'voies': {
      diagnostics = msg.voies.map((v) => ({
        voie: v.voie,
        nom: v.nom,
        pin: v.pin,
        probleme: v.probleme,
        analogique: v.analogique,
        suivi: v.suivi === true,
      }));
      // Seules les voies traçables entrent dans la capture : une sonde en l'air
      // n'a pas de broche, donc rien à quoi rattacher des fronts.
      capture.declarerVoies(
        diagnostics
          .filter((d) => !d.probleme && d.pin)
          .map((d) => ({ voie: d.voie, pin: d.pin, nom: d.nom }))
      );
      remplirVoies(selDeclVoie, t('none'));
      majRoles();
      dessiner();
      return;
    }
    case 'fronts':
      capture.verser(msg.salves);
      suivreFin();
      dessiner();
      return;
    case 'depart':
      enCours = true;
      capture.reinitialiser();
      suivi = true;
      dessiner();
      return;
    case 'arret':
      enCours = false;
      dessiner();
      return;
    case 'restaure':
      restaurer(msg.etat);
      return;
  }
});

/** Recharge une capture enregistrée (ouverture de l'onglet hors simulation). */
function restaurer(etat: EtatSerialise): void {
  capture.declarerVoies(etat.voies.map((v) => ({ voie: v.voie, pin: v.pin, nom: v.nom })));
  const salves: Record<string, number[]> = {};
  for (const v of etat.voies) salves[v.pin] = v.fronts;
  capture.verser(salves);
  if (etat.declenchement) {
    selDeclVoie.value = String(etat.declenchement.voie);
    selDeclSens.value = etat.declenchement.sens;
  }
  if (etat.decodage) {
    selProto.value = etat.decodage.protocole;
    reglage = etat.decodage;
    majRoles();
  }
  ajuster();
}

// --- Souris ------------------------------------------------------------------

canvas.addEventListener('pointermove', (ev) => {
  const r = canvas.getBoundingClientRect();
  souris = { x: ev.clientX - r.left, y: ev.clientY - r.top };
  dessiner();
});
canvas.addEventListener('pointerleave', () => {
  souris = null;
  dessiner();
});
canvas.addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault();
    const r = canvas.getBoundingClientRect();
    const tAncre = vue.tDe(ev.clientX - r.left, fenetre, canvas.clientWidth);
    zoomer(ev.deltaY > 0 ? 1.25 : 0.8, tAncre);
  },
  { passive: false }
);

// Glisser latéral : décale la fenêtre. Un analyseur se lit en se promenant dans
// l'enregistrement, pas en le rejouant.
let glisse: { x: number; t0: number } | null = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  glisse = { x: ev.clientX, t0: fenetre.t0 };
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!glisse) return;
  const plot = canvas.clientWidth - 116;
  const dt = ((ev.clientX - glisse.x) / plot) * fenetre.duree;
  fenetre = { t0: glisse.t0 - dt, duree: fenetre.duree };
  suivi = false;
  dessiner();
});
canvas.addEventListener('pointerup', (ev) => {
  glisse = null;
  if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
});

// --- Câblage de la barre -----------------------------------------------------

selDeclVoie.addEventListener('change', majDeclenchement);
selDeclSens.addEventListener('change', majDeclenchement);
selProto.addEventListener('change', () => {
  majRoles();
  dessiner();
  envoyerReglages();
});
document.getElementById('tout')?.addEventListener('click', ajuster);
document.getElementById('suivre')?.addEventListener('click', suivreFinDemande);
window.addEventListener('resize', () => dessiner());
// Changement de thème VS Code : les couleurs de voie ont une variante claire et
// une sombre, il faut redessiner.
new MutationObserver(() => dessiner()).observe(document.body, {
  attributes: true,
  attributeFilter: ['class'],
});

// L'onglet signale qu'il est prêt : l'hôte lui envoie alors l'état courant
// (voies + dernière capture). Sans ce signal, un onglet ouvert après le départ
// du run resterait vide jusqu'au run suivant.
vscode?.postMessage({ type: 'analyseurPret' });
dessiner();
