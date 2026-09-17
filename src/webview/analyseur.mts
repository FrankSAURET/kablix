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
  decoderTous,
  rolesDe,
  type Annotation,
  type Protocole,
  type ReglageDecodage,
  type ReglagesVoies,
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
  /**
   * Ancien champ : UN seul décodage. Gardé en lecture pour les .projix
   * enregistrés avant v2026.9.4.94, qui doivent rouvrir avec leur réglage.
   */
  decodage?: ReglageDecodage | null;
  /** Décodages actifs, depuis qu'on peut en mener plusieurs de front. */
  decodages?: ReglageDecodage[];
  /** Réglages d'affichage et de seuils, par indice de voie. */
  voiesReglages?: ReglagesVoies;
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
/**
 * Décodages actifs. Plusieurs à la fois : un montage porte souvent deux bus
 * (l'I²C d'un capteur et la ligne DMX qu'il commande), et devoir choisir lequel
 * regarder empêchait justement de voir ce qui relie les deux.
 */
let decodages: ReglageDecodage[] = [];
/** Réglages par voie : nom, teinte, inversion, masquage, seuils. */
let reglagesVoies: ReglagesVoies = {};
/** Compteur d'identifiants de décodage (stable le temps de la session). */
let idDecodage = 0;
/** Vrai pendant un run : la vue se redessine en continu. */
let enCours = false;

const canvas = document.getElementById('trace') as HTMLCanvasElement;
const vue = new AnalyseurVue(canvas);

const textes = (): TextesVue => ({
  aucuneSonde: t('No logic probe on the board — clip one onto a pin.'),
  aucuneDonnee: t('No edge captured yet.'),
  // Les trois raisons d'être muette disent ce qu'il faut FAIRE, pas seulement
  // ce qui ne va pas : sans cela l'élève relit dix fois la même phrase sans
  // savoir où déplacer sa pince (retour de Frank sur dmx-pico, où les trois
  // sondes étaient muettes chacune pour une raison différente).
  nowhere: t('Probe not clipped: drop its tip right onto a pad.'),
  notMcu: t('Nothing to listen to here: this point never reaches a board pin. Clip onto the signal pad.'),
  power: t('Power pad (VCC/GND): a steady level, no edge. Clip onto the signal pad.'),
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

/**
 * Ramène la vue sur toute la capture (bouton « Toute la capture »).
 *
 * La fenêtre se cale sur l'intervalle RÉELLEMENT occupé par les fronts, du
 * premier au dernier, et non sur `[0, fin]`. Une capture ne commence pas
 * forcément à zéro : sur une liaison série, le premier octet part souvent après
 * des dizaines de secondes de programme. Cadrer depuis zéro tassait alors toute
 * la mesure dans les derniers pixels de l'écran, et l'onglet paraissait vide
 * (retour de Frank sur dmx-pico, .96) — le défaut n'était pas dans la capture,
 * qui était bel et bien là, mais dans le cadrage.
 */
function ajuster(): void {
  const debut = capture.tDebut;
  const fin = capture.tFin;
  const etendue = fin - debut;
  if (!(etendue > 0)) {
    // Rien, ou un seul front : on garde une fenêtre de travail lisible autour de
    // ce qu'on a, plutôt qu'une durée nulle qui ne saurait rien afficher.
    fenetre = { t0: Math.max(0, debut - 5), duree: 10 };
  } else {
    // Une marge de 1 % de chaque côté : les fronts extrêmes ne collent pas au
    // bord, où ils seraient coupés par les graduations.
    const marge = etendue * 0.01;
    fenetre = { t0: debut - marge, duree: etendue + 2 * marge };
  }
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

/** Voies effectivement dessinées : les masquées gardent leur capture, pas leur piste. */
function voiesVisibles(): VoieVue[] {
  return diagnostics
    .filter((d) => !reglagesVoies[d.voie]?.masquee)
    .map((d) => ({
      ...d,
      nomChoisi: reglagesVoies[d.voie]?.nom,
      couleur: reglagesVoies[d.voie]?.couleur,
    }));
}

function rendu(): void {
  const voies = voiesVisibles();
  const n = Math.max(voies.length, 1);
  const hauteur = vue.hauteurPour(n);
  if (canvas.style.height !== `${hauteur}px`) canvas.style.height = `${hauteur}px`;
  annotations = calculerAnnotations();
  vue.dessiner({
    capture,
    voies,
    fenetre,
    annotations,
    souris,
    textes: textes(),
    lang: locale(),
  });
  majEtiquettes();
}

/**
 * Répercute les inversions sur la capture. Appelé à chaque changement de
 * réglage : c'est la capture qui inverse, une fois, pour la vue ET pour le
 * décodage — ce que l'élève voit est donc toujours ce que le décodeur a lu.
 */
function majInversions(): void {
  capture.reglerInversion(
    Object.entries(reglagesVoies)
      .filter(([, r]) => r?.repos === 1)
      .map(([v]) => Number(v))
  );
}

/** Décodage : recalculé à chaque rendu, sur la fenêtre visible seulement. */
function calculerAnnotations(): Annotation[] {
  if (decodages.length === 0) return [];
  // On ne décode QUE la fenêtre visible, marge d'un octet de chaque côté : à
  // pleine profondeur (60 000 fronts par voie) décoder tout l'enregistrement à
  // chaque image de l'écran coûterait des centaines de milliers d'opérations
  // pour afficher vingt étiquettes.
  const marge = fenetre.duree * 0.1;
  const t0 = fenetre.t0 - marge;
  const t1 = fenetre.t0 + fenetre.duree + marge;
  // `capture.fenetre` rend déjà les fronts INVERSÉS sur les voies réglées
  // actives-bas : le décodeur lit donc exactement ce que la vue dessine.
  const tranche = capture.listeVoies.map((v) => {
    const f = capture.fenetre(v.voie, t0, t1);
    return { ...v, niveauInitial: f.entrant, fronts: f.fronts };
  });
  // Les seuils de voie (vitesse, tolérance) priment sur ceux du décodage : deux
  // lignes série d'un même montage ne tournent pas forcément à la même vitesse.
  const avecSeuils = decodages.map((d) => {
    const rv = d.donnees !== undefined ? reglagesVoies[d.donnees] : undefined;
    if (!rv?.bauds && !rv?.tolerance) return d;
    return {
      ...d,
      ...(rv.bauds ? { bauds: rv.bauds } : {}),
      ...(rv.tolerance ? { tolerance: rv.tolerance } : {}),
    };
  });
  return decoderTous(tranche, avecSeuils);
}

// --- Barre d'outils ----------------------------------------------------------

const selDeclVoie = document.getElementById('decl-voie') as HTMLSelectElement;
const selDeclSens = document.getElementById('decl-sens') as HTMLSelectElement;
const zoneDecodages = document.getElementById('decodages') as HTMLDivElement;
const boutonAjoutDecodage = document.getElementById('ajout-decodage') as HTMLButtonElement;
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
    o.textContent = nomAffiche(d);
    sel.append(o);
  }
  sel.value = [...sel.options].some((o) => o.value === avant) ? avant : '';
}

/** Nom d'une voie tel qu'il s'affiche : celui choisi, sinon l'automatique. */
function nomAffiche(d: VoieVue): string {
  const n = (reglagesVoies[d.voie]?.nom ?? '').trim();
  return n === '' ? d.nom : n;
}

/** Reconstruit la zone des décodages : un groupe par décodage actif. */
function majDecodages(): void {
  zoneDecodages.textContent = '';
  for (const d of decodages) zoneDecodages.append(groupeDecodage(d));
}

/** Un décodage dans la barre : son protocole, ses rôles de voie, sa croix. */
function groupeDecodage(d: ReglageDecodage): HTMLElement {
  const boite = document.createElement('div');
  boite.className = 'deco';

  const labProto = document.createElement('label');
  labProto.className = 'role';
  labProto.textContent = t('Decode');
  const selProto = document.createElement('select');
  for (const [v, nom] of [
    ['i2c', 'I²C'],
    ['spi', 'SPI'],
    ['dmx', 'DMX512'],
  ] as Array<[Protocole, string]>) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = nom;
    selProto.append(o);
  }
  selProto.value = d.protocole;
  selProto.addEventListener('change', () => {
    // Changer de protocole vide les rôles : les voies d'un I²C (SCL/SDA) ne
    // veulent rien dire pour un DMX, et les garder ferait décoder n'importe quoi.
    const id = d.id;
    for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k];
    d.protocole = selProto.value as Protocole;
    d.id = id;
    majDecodages();
    dessiner();
    envoyerReglages();
  });
  labProto.append(selProto);
  boite.append(labProto);

  for (const role of rolesDe(d.protocole)) {
    const lab = document.createElement('label');
    lab.className = 'role';
    lab.textContent = role.nom;
    const sel = document.createElement('select');
    remplirVoies(sel, role.obligatoire ? '—' : t('none'));
    const courant = d[role.cle];
    if (typeof courant === 'number') sel.value = String(courant);
    sel.addEventListener('change', () => {
      const v = sel.value === '' ? -1 : Number(sel.value);
      // Les rôles de voie (`horloge`, `donnees`…) sont tous des indices de voie :
      // l'écriture indexée est sûre, le nom de clé vient de `rolesDe`.
      (d as unknown as Record<string, number>)[role.cle] = v;
      dessiner();
      envoyerReglages();
    });
    lab.append(sel);
    boite.append(lab);
  }

  if (d.protocole === 'spi') {
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
    sel.value = String(d.mode ?? 0);
    sel.addEventListener('change', () => {
      d.mode = Number(sel.value) as 0 | 1 | 2 | 3;
      dessiner();
      envoyerReglages();
    });
    lab.append(sel);
    boite.append(lab);
  }

  const oter = document.createElement('button');
  oter.type = 'button';
  oter.className = 'oter';
  oter.textContent = '×';
  oter.title = t('Remove this decoding');
  oter.addEventListener('click', () => {
    decodages = decodages.filter((x) => x !== d);
    majDecodages();
    dessiner();
    envoyerReglages();
  });
  boite.append(oter);
  return boite;
}

boutonAjoutDecodage.addEventListener('click', () => {
  idDecodage += 1;
  decodages.push({ protocole: 'i2c', id: `d${idDecodage}` });
  majDecodages();
  dessiner();
  envoyerReglages();
});

/** Voie dont les réglages sont dépliés sous la légende, ou null. */
let voieReglee: number | null = null;

/** Légende : une puce de la couleur de la pince, son nom, sa broche. */
function majEtiquettes(): void {
  const sombre = themeSombre();
  legende.textContent = '';
  for (const d of diagnostics) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    // La pastille est un BOUTON : c'est là qu'on règle la voie (nom, teinte,
    // sens de lecture, masquage, vitesse). Régler la courbe au même endroit
    // qu'on la reconnaît évite un panneau de plus dans la barre.
    const puce = document.createElement('button');
    puce.type = 'button';
    puce.style.background = couleurVoie(reglagesVoies[d.voie]?.couleur ?? d.voie, sombre);
    puce.title = t('Channel settings');
    puce.addEventListener('click', () => {
      voieReglee = voieReglee === d.voie ? null : d.voie;
      majEtiquettes();
    });
    chip.append(puce);
    // « SD2 · GP3 ↝ » : la flèche dit que la pince n'est pas sur la broche
    // nommée mais sur un point relié à elle. L'infobulle l'écrit en toutes
    // lettres — un symbole seul n'explique rien.
    const base = nomAffiche(d);
    const nom = d.pin ? `${base} · ${d.pin}` : base;
    chip.append(document.createTextNode(d.suivi ? `${nom} ↝` : nom));
    if (d.suivi) chip.title = t('Clipped away from the board: this point is wired to {0}.', d.pin);
    if (d.probleme || reglagesVoies[d.voie]?.masquee) chip.classList.add('chip--muet');
    legende.append(chip);
  }
  if (voieReglee !== null) {
    const d = diagnostics.find((x) => x.voie === voieReglee);
    if (d) legende.append(panneauReglages(d));
    else voieReglee = null;
  }
  const fin = capture.tFin;
  etatTexte.textContent = enCours
    ? t('Capturing… {0}', fin.toFixed(1))
    : capture.aDesDonnees
      ? t('Last capture: {0} ms', fin.toFixed(1))
      : '';
}

/**
 * Réglages d'UNE voie, dépliés sous la légende. Tout y est propre à la voie :
 * ce qu'elle montre (nom, teinte, masquage) et comment elle se lit (sens au
 * repos, vitesse). Rien de tout cela ne dépend d'un protocole — une voie garde
 * son nom et son sens même sans décodage.
 */
function panneauReglages(d: VoieVue): HTMLElement {
  const sombre = themeSombre();
  const boite = document.createElement('div');
  boite.className = 'reglages';
  const r = (reglagesVoies[d.voie] ??= {});
  const change = (): void => {
    majInversions();
    majEtiquettes();
    dessiner();
    envoyerReglages();
  };

  // Nom : vide = on revient au nom automatique, qui suit la pince.
  const labNom = document.createElement('label');
  labNom.textContent = t('Name');
  const champNom = document.createElement('input');
  champNom.type = 'text';
  champNom.size = 10;
  champNom.value = r.nom ?? '';
  champNom.placeholder = d.nom;
  champNom.addEventListener('input', () => {
    r.nom = champNom.value;
    change();
    // Réécrire la légende reprend le focus : on le rend au champ, sinon on ne
    // peut pas taper deux lettres de suite.
    (legende.querySelector('.reglages input[type=text]') as HTMLInputElement | null)?.focus();
  });
  labNom.append(champNom);
  boite.append(labNom);

  // Teinte : la palette des voies, pas un choix libre — les huit teintes sont
  // celles qui se distinguent sur les deux thèmes.
  const labTeinte = document.createElement('label');
  labTeinte.textContent = t('Color');
  const teintes = document.createElement('span');
  teintes.className = 'teintes';
  for (let i = 0; i < 8; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = couleurVoie(i, sombre);
    b.setAttribute('aria-pressed', String((r.couleur ?? d.voie) === i));
    b.addEventListener('click', () => {
      r.couleur = i === d.voie ? undefined : i;
      change();
    });
    teintes.append(b);
  }
  labTeinte.append(teintes);
  boite.append(labTeinte);

  // Niveau au repos : une ligne active-bas (RESET, CS, bus à collecteur ouvert)
  // se lit à l'envers. Sans ce réglage l'élève lit le complément de ses octets.
  const labRepos = document.createElement('label');
  labRepos.title = t('Active-low line: read the channel upside down (idle high).');
  const caseRepos = document.createElement('input');
  caseRepos.type = 'checkbox';
  caseRepos.checked = r.repos === 1;
  caseRepos.addEventListener('change', () => {
    r.repos = caseRepos.checked ? 1 : 0;
    change();
  });
  labRepos.append(caseRepos, document.createTextNode(t('Idle high')));
  boite.append(labRepos);

  const labMasque = document.createElement('label');
  labMasque.title = t('Hide this channel: it keeps its capture, it just leaves the screen.');
  const caseMasque = document.createElement('input');
  caseMasque.type = 'checkbox';
  caseMasque.checked = r.masquee === true;
  caseMasque.addEventListener('change', () => {
    r.masquee = caseMasque.checked;
    change();
  });
  labMasque.append(caseMasque, document.createTextNode(t('Hide')));
  boite.append(labMasque);

  // Vitesse : elle prime sur celle du décodage. Vide = celle du protocole.
  const labBauds = document.createElement('label');
  labBauds.textContent = t('Baud');
  const champBauds = document.createElement('input');
  champBauds.type = 'number';
  champBauds.min = '1';
  champBauds.size = 8;
  champBauds.value = r.bauds ? String(r.bauds) : '';
  champBauds.placeholder = t('auto');
  champBauds.addEventListener('change', () => {
    const n = Number(champBauds.value);
    r.bauds = Number.isFinite(n) && n > 0 ? n : undefined;
    change();
  });
  labBauds.append(champBauds);
  boite.append(labBauds);

  // Tolérance sur la durée d'un bit, en pourcentage : un signal bruité cadre
  // mal avec la valeur par défaut, et le décodeur rend alors des erreurs.
  const labTol = document.createElement('label');
  labTol.textContent = t('Tolerance %');
  const champTol = document.createElement('input');
  champTol.type = 'number';
  champTol.min = '1';
  champTol.max = '90';
  champTol.size = 4;
  champTol.value = r.tolerance ? String(Math.round(r.tolerance * 100)) : '';
  champTol.placeholder = t('auto');
  champTol.addEventListener('change', () => {
    const n = Number(champTol.value);
    r.tolerance = Number.isFinite(n) && n > 0 ? n / 100 : undefined;
    change();
  });
  labTol.append(champTol);
  boite.append(labTol);

  return boite;
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
    decodages,
    voiesReglages: reglagesVoies,
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
      majDecodages();
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
  // Les PISTES viennent normalement du message `voies`, que pousse l'atelier.
  // Mais à la réouverture d'un projet sans avoir relancé la simulation, l'atelier
  // n'a encore rien poussé : la liste de l'hôte est vide, et la capture du
  // .projix — pourtant complète — n'avait alors aucune piste où se dessiner.
  // L'onglet affichait « aucune sonde » par-dessus des milliers de fronts bien
  // présents : la page grise signalée par Frank sur dmx-pico.
  // La capture est autoportante (chaque voie porte son numéro, sa broche et son
  // nom) : on s'en sert pour dresser les pistes tant que rien d'autre ne l'a
  // fait. Le message `voies`, quand il arrive, reprend la main.
  if (diagnostics.length === 0 && etat.voies.length > 0) {
    diagnostics = etat.voies.map((v) => ({
      voie: v.voie,
      nom: v.nom,
      pin: v.pin,
      probleme: null,
      analogique: false,
      suivi: false,
    }));
    remplirVoies(selDeclVoie, t('none'));
  }
  if (etat.declenchement) {
    selDeclVoie.value = String(etat.declenchement.voie);
    selDeclSens.value = etat.declenchement.sens;
  }
  // `decodages` depuis v2026.9.4.94 ; `decodage` (un seul) est ce qu'ont écrit
  // les .projix d'avant, qui doivent rouvrir avec leur réglage.
  decodages = etat.decodages ?? (etat.decodage ? [etat.decodage] : []);
  for (const d of decodages) {
    if (!d.id) {
      idDecodage += 1;
      d.id = `d${idDecodage}`;
    }
  }
  reglagesVoies = etat.voiesReglages ?? {};
  majInversions();
  majDecodages();
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
