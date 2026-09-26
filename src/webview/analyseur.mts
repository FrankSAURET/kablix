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

import {
  AnalyseurCapture,
  FRONTS_MAX_PAR_VOIE,
  PROFONDEURS,
  type Declenchement,
  type SensDeclenchement,
  type VoieCapture,
} from './analyseur-capture.mjs';
import {
  AnalyseurVue,
  DISPOSITION,
  nomVoie,
  type BoutonVoie,
  type Fenetre,
  type TextesVue,
  type VoieVue,
  type ZoneBouton,
} from './analyseur-vue.mjs';
import {
  changementsDeTrame,
  decoderTous,
  lignesSousVoie,
  reculNecessaireMs,
  rolesDe,
  type Annotation,
  type Protocole,
  type ReglageDecodage,
  type ReglagesVoies,
} from './analyseur-decodage.mjs';
import { initLocale, locale, t } from './i18n.mjs';

declare global {
  interface Window {
    KABLIX_LANG?: string;
    /** Clé du projet, posée par l'hôte dans la page (cf. analyseur-panel.ts). */
    KABLIX_ANALYSEUR_CLE?: string;
    acquireVsCodeApi?: () => {
      postMessage(m: unknown): void;
      setState?(s: unknown): void;
      getState?(): unknown;
    };
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
        /** Pince derrière un reflet inversant (`-` d'une paire DMX) : tracée à l'envers. */
        inverse?: boolean;
        /** Tension du niveau haut, en volts (celle de la carte). */
        volts?: number;
        /** Tension du niveau bas, en volts, quand elle n'est pas 0 V (paire DMX). */
        voltsBas?: number;
      }>;
    }
  /** Salve de fronts : `{ broche: [t, niveau, …] }`, en ms simulées. */
  | { type: 'fronts'; salves: Record<string, number[]> }
  /** Départ d'un run : la capture précédente est effacée. */
  | { type: 'depart' }
  /** Fin d'un run : la vue se fige sur ce qu'elle a. */
  | { type: 'arret' }
  /** Capture complète restaurée depuis le .projix (ouverture hors simulation). */
  | { type: 'restaure'; etat: EtatSerialise }
  /**
   * L'onglet vient de repasser DEVANT : l'hôte le dit, parce que la page ne
   * l'apprend pas autrement (ni `resize`, ni `visibilitychange`). Voir le
   * commentaire du `ResizeObserver`, plus bas.
   */
  | { type: 'repeindre' };

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
  declenchement?: { voie: number; sens: SensDeclenchement } | null;
  /**
   * Ancien champ : UN seul décodage. Gardé en lecture pour les .projix
   * enregistrés avant v2026.9.4.94, qui doivent rouvrir avec leur réglage.
   */
  decodage?: ReglageDecodage | null;
  /** Décodages actifs, depuis qu'on peut en mener plusieurs de front. */
  decodages?: ReglageDecodage[];
  /** Réglages d'affichage et de seuils, par indice de voie. */
  voiesReglages?: ReglagesVoies;
  /** Fréquence d'échantillonnage simulée, en hertz ; 0 = illimitée. */
  echantillonnage?: number;
  /** Profondeur de capture, en fronts par voie ; absente = 60 000. */
  profondeur?: number;
}

const vscode = window.acquireVsCodeApi?.();

/** Ce que la page confie à VS Code (`setState`), qui le lui rend à chaque rechargement. */
interface EtatPage {
  /** Clé du projet : le sérialiseur la relit pour rendre l'onglet à son atelier. */
  cle?: string;
  /** Fenêtre de temps affichée : le zoom de l'élève. */
  fenetre?: Fenetre;
  /** La vue suivait-elle la fin de la capture ? */
  suivi?: boolean;
}
const etatRendu = (vscode?.getState?.() ?? {}) as EtatPage;
// LA CLÉ CONFIÉE À VS CODE. C'est le seul état qui survive à la fermeture de
// l'éditeur, et c'est ce que le sérialiseur recevra au prochain démarrage pour
// rendre l'onglet à son atelier. Sans lui, l'onglet restauré revient à l'écran
// détaché de tout : plus un message ne l'atteint, la page reste vide.
// La CAPTURE, elle, n'est pas mémorisée : une mesure appartient à une
// simulation, pas à une fenêtre. La FENÊTRE, si : voir `fenetreAReprendre`.
let etatPage: EtatPage = window.KABLIX_ANALYSEUR_CLE
  ? { ...etatRendu, cle: window.KABLIX_ANALYSEUR_CLE }
  : etatRendu;
if (window.KABLIX_ANALYSEUR_CLE) vscode?.setState?.(etatPage);
initLocale(window.KABLIX_LANG);

const capture = new AnalyseurCapture();
/** Diagnostic de câblage par voie : il vient du schéma, pas de la capture. */
let diagnostics: VoieVue[] = [];
let fenetre: Fenetre = { t0: 0, duree: 10 };
/** Vrai tant que la vue suit la fin de la capture (zoom molette la libère). */
let suivi = true;
/**
 * Fenêtre que VS Code vient de rendre à la page, à reprendre sur la première
 * capture qui arrive.
 *
 * Déplacer l'onglet vers une autre fenêtre RECHARGE la page : elle repartait de
 * sa fenêtre par défaut, et la capture que l'hôte lui rend était recadrée en
 * entier — la courbe revenait, pas le zoom (Frank, 25/09). La fenêtre est donc
 * confiée à VS Code à chaque rendu (`memoriserFenetre`), et reprise ici une
 * seule fois : une capture rendue plus tard (autre projet) se recadre comme
 * avant.
 */
let fenetreAReprendre: { fenetre: Fenetre; suivi: boolean } | null = fenetreValide(etatRendu.fenetre)
  ? { fenetre: { t0: etatRendu.fenetre.t0, duree: etatRendu.fenetre.duree }, suivi: etatRendu.suivi === true }
  : null;
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
/**
 * Instants de M1 et M2, en ms simulées ; null = garé à gauche de la barre de
 * temps, où les deux attendent à l'ouverture. Ce sont des outils de lecture,
 * comme le réticule : ils ne s'enregistrent pas dans le projet.
 */
const marqueurs: Array<number | null> = [null, null];
/** Marqueur tenu à la souris, ou null. */
let marqueurPris: number | null = null;

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

/** Fenêtre lisible, telle que VS Code la rend (l'état peut venir d'une ancienne page). */
function fenetreValide(f: unknown): f is Fenetre {
  const g = f as Fenetre | undefined;
  return !!g && Number.isFinite(g.t0) && Number.isFinite(g.duree) && g.duree > 0;
}

/** Dernière fenêtre confiée à VS Code : on ne la réécrit que si elle change. */
let fenetreMemorisee = '';

/** Confie la fenêtre affichée à VS Code, qui la rendra si la page est rechargée. */
function memoriserFenetre(): void {
  // Tant que la fenêtre rendue n'est pas reprise, la vue montre la fenêtre par
  // défaut : l'écrire effacerait celle qu'on attend de reprendre.
  if (!vscode?.setState || fenetreAReprendre) return;
  // En suivi, t0 court avec la capture : seul le zoom compte.
  const empreinte = suivi ? `s|${fenetre.duree}` : `${fenetre.t0}|${fenetre.duree}`;
  if (empreinte === fenetreMemorisee) return;
  fenetreMemorisee = empreinte;
  etatPage = { ...etatPage, fenetre: { t0: fenetre.t0, duree: fenetre.duree }, suivi };
  vscode.setState(etatPage);
}

/**
 * Reprend la fenêtre rendue par VS Code sur la capture qui vient d'arriver.
 * Rend faux si elle ne montre rien de cette capture : la vue se cadre alors
 * comme d'habitude.
 */
function reprendreFenetre(): boolean {
  const reprise = fenetreAReprendre;
  fenetreAReprendre = null;
  if (!reprise) return false;
  if (enCours) {
    // En plein run, le zoom revient ; la position suit le direct, sauf si
    // l'élève regardait un passage qui est toujours là.
    const dedans = capture.aDesDonnees && reprise.fenetre.t0 < capture.tFin;
    fenetre = dedans ? reprise.fenetre : { t0: fenetre.t0, duree: reprise.fenetre.duree };
    suivi = dedans ? reprise.suivi : true;
    suivreFin();
    return true;
  }
  const f = reprise.fenetre;
  if (!capture.aDesDonnees || f.t0 >= capture.tFin || f.t0 + f.duree <= capture.tDebut) return false;
  fenetre = f;
  suivi = reprise.suivi;
  suivreFin();
  return true;
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

/**
 * Décale la vue d'une DEMI-fenêtre vers le passé (-1) ou l'avenir (+1) :
 * flèches ◀ ▶ de la barre et touches ← → (demande de Frank, 23/09).
 *
 * Une demi-largeur, pas une largeur entière : la moitié de ce qu'on regardait
 * reste à l'écran, on ne perd pas le fil d'une trame en avançant. Le zoom ne
 * bouge pas ; le suivi de la fin s'arrête, comme au glissé.
 */
function defiler(sens: -1 | 1): void {
  fenetre = { t0: fenetre.t0 + sens * fenetre.duree * 0.5, duree: fenetre.duree };
  suivi = false;
  dessiner();
}

/**
 * Amène la vue sur le déclenchement, au dixième de sa largeur : un peu de ce
 * qui l'a précédé, surtout ce qui l'a suivi. Le suivi de la fin s'arrête — la
 * vue doit RESTER sur l'événement qu'on a demandé de saisir.
 *
 * C'est ce qui manquait au déclenchement : il ne faisait que poser l'origine de
 * la règle, et la vue continuait de courir après la fin du run. Sur une ligne
 * 1-Wire qui ne parle que de loin en loin, l'écran montrait alors un trait
 * continu, et la trame déclenchée filait hors de portée (ds18b20-pico2, Frank
 * 23/09).
 */
function allerAuDeclenchement(): void {
  const t = capture.tTrigger;
  if (t === null) return;
  fenetre = { t0: t - fenetre.duree * 0.1, duree: fenetre.duree };
  suivi = false;
  dessiner();
}

/**
 * Pose ou retire le déclenchement depuis le menu « T ».
 *
 * En plein run, le réglage réarme : la vue revient au direct en attendant le
 * front, et `fronts` l'y amènera dès qu'il tombe. Sur une capture arrêtée,
 * aucun front ne viendra plus : on cherche le premier qui répond dans ce qui
 * est déjà capturé.
 */
function choisirDeclenchement(d: Declenchement | null): void {
  majDecodagesCapture();
  capture.reglerDeclenchement(d);
  if (enCours) {
    suivi = true;
    suivreFin();
  } else if (d && capture.chercherDeclenchement() !== null) {
    allerAuDeclenchement();
  }
  dessiner();
  envoyerReglages();
}

// --- Rendu -------------------------------------------------------------------

let raf = 0;
let filet = 0;

/**
 * Délai du FILET de secours, en ms. Assez court pour que l'élève ne voie pas
 * l'onglet traîner, assez long pour qu'une image normale (16 ms) passe toujours
 * la première et que le filet se contente d'annuler.
 */
const FILET_MS = 120;

/**
 * Demande un rendu — par IMAGE quand le navigateur en sert, PAR MINUTERIE
 * sinon.
 *
 * Un onglet de webview VS Code qui n'est pas au premier plan ne reçoit AUCUNE
 * image : `requestAnimationFrame` y est gelé. Or l'analyseur s'ouvre justement
 * à côté de l'atelier, sans lui voler le focus (`preserveFocus`) — il est donc
 * caché au moment précis où l'hôte lui pousse ses voies et sa capture.
 *
 * Mesuré (lot .98, banc `_diag-onglet-analyseur.mjs`) : ZÉRO image servie en
 * 500 ms, l'état arrivait bien (la liste de déclenchement se remplissait à
 * quatre entrées) mais le canvas gardait sa hauteur d'une piste et ses 936
 * pixels de message d'accueil. C'est la page blanche que Frank photographie :
 * l'onglet n'avait pas trop peu de données, il n'avait jamais repeint.
 *
 * Pire, le verrou `raf` restait armé pendant tout le gel : chaque demande
 * suivante repartait aussitôt, et la seule image finalement servie ne peignait
 * que le dernier état — tout ce qui s'était passé entre-temps était perdu.
 *
 * Les deux voies sont donc armées ensemble et la première qui tire annule
 * l'autre : jamais deux rendus pour une demande.
 */
function dessiner(): void {
  if (raf || filet) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (filet) { clearTimeout(filet); filet = 0; }
    rendu();
  });
  filet = window.setTimeout(() => {
    filet = 0;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    rendu();
  }, FILET_MS);
}

/**
 * Repeint TOUT DE SUITE, verrou compris.
 *
 * Réservé au cas où l'on SAIT que la vue affichée est fausse et qu'attendre une
 * image serait attendre pour rien : le retour de l'onglet au premier plan. Les
 * demandes ordinaires passent par `dessiner()`, qui regroupe.
 */
function redessinerMaintenant(): void {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  if (filet) { clearTimeout(filet); filet = 0; }
  rendu();
}

/** Voies effectivement dessinées : les masquées gardent leur capture, pas leur piste. */
function voiesVisibles(): VoieVue[] {
  const decl = capture.reglageDeclenchement;
  return diagnostics
    .filter((d) => !reglagesVoies[d.voie]?.masquee)
    .map((d) => ({
      ...d,
      nomChoisi: reglagesVoies[d.voie]?.nom,
      // Les deux boutons de la colonne de gauche lisent leur état ici : le
      // déclenchement n'appartient qu'à UNE voie, le protocole est celui du
      // décodage dont cette voie porte les données.
      declenchement: decl?.voie === d.voie ? decl.sens : null,
      protocole: (() => {
        const p = decodageDe(d.voie)?.protocole;
        return p ? NOMS_PROTOCOLE[p] : null;
      })(),
      // Lignes de la bande de décodage : fixées par les RÉGLAGES (un DHT en
      // réserve deux), pas par ce qui est décodé — la hauteur ne saute pas
      // quand une trame entre ou sort de la fenêtre.
      lignesDecodage: lignesSousVoie(decodages, d.voie),
    }));
}

function rendu(): void {
  const voies = voiesVisibles();
  const hauteur = vue.hauteurPour(voies);
  if (canvas.style.height !== `${hauteur}px`) canvas.style.height = `${hauteur}px`;
  // Un décodage qui lève ne doit pas emporter le rendu : sans ce filet, la même
  // exception revenait à CHAQUE image et l'onglet ne peignait plus rien — zoom,
  // curseurs, déclenchement figés (le gel du 26/09, pile débordée au décodage).
  try {
    annotations = calculerAnnotations();
  } catch (e) {
    console.error('Kablix analyseur : décodage abandonné', e);
    annotations = [];
  }
  vue.dessiner({
    capture,
    voies,
    fenetre,
    annotations,
    souris,
    textes: textes(),
    lang: locale(),
    marqueurs,
    marqueurPris,
  });
  memoriserFenetre();
  majEtat();
  majMasquees();
}

/**
 * Bouton « Réafficher les voies masquées ». Une voie masquée emporte sa piste,
 * donc aussi le bouton de teinte qui ouvrait son menu — et avec lui la case
 * « Masquer » qui l'aurait fait revenir. Sans ce bouton, rien ne la ramenait
 * (Frank, 23/09 : « je la fais réapparaître comment ? »).
 *
 * Seules comptent les voies du montage : un réglage resté sur une voie
 * disparue ne cache rien à l'écran.
 */
function majMasquees(): void {
  if (!btnReafficher) return;
  const n = diagnostics.filter((d) => reglagesVoies[d.voie]?.masquee).length;
  btnReafficher.hidden = n === 0;
  if (n > 0) btnReafficher.textContent = t('Show hidden channels ({0})', n);
}

/**
 * Texte d'état de la barre du haut.
 *
 * C'est tout ce qui reste de l'ancienne légende : les noms de voie, leur
 * teinte, leur déclenchement et leur décodage sont passés SUR la piste, à
 * gauche du tracé (demande de Frank du 19/09). Une ligne de plus en haut ne
 * servait qu'à répéter ce que la piste montre déjà.
 */
function majEtat(): void {
  // Virgule décimale en français, comme la règle des temps (« 1,5 ms ») ; sans
  // séparateur de milliers, pour rester lisible pendant que le compte défile.
  const fin = capture.tFin.toLocaleString(locale(), {
    minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false,
  });
  // Capture pleine : la DURÉE gardée, pas l'heure de la simulation. Après une
  // relance, l'heure grandit à chaque essai alors que la capture tient autant.
  etatTexte.textContent = enCours
    ? capture.pleine
      ? t('Capture full: {0} kept ({1} edges per channel). Click Restart capture to capture anew.',
          duree(capture.tFin - capture.tDebutComplet), nomProfondeur(capture.profondeur))
      : capture.enAttente
        ? t('Capturing… {0} (waiting for the trigger edge)', fin)
        : t('Capturing… {0}', fin)
    : capture.aDesDonnees
      ? t('Last capture: {0} ms', fin)
      : '';
  // Hors simulation, plus rien à capturer : relancer viderait la mesure pour
  // n'y remettre rien.
  if (btnRelancer) btnRelancer.disabled = !enCours;
  majProfondeurs();
}

/**
 * Durée que tiendrait chaque profondeur au débit mesuré, écrite dans les choix
 * de la liste : « 60 k (≈ 8,3 s) ». Comme sur un analyseur du commerce, on
 * choisit sa mémoire en voyant ce qu'elle couvre. Le débit est celui de la
 * voie la plus active : c'est elle qui remplit la capture la première.
 */
function majProfondeurs(): void {
  if (!selProfondeur) return;
  const debit = capture.debit;
  for (const o of selProfondeur.options) {
    const nom = nomProfondeur(Number(o.value));
    const texte = debit > 0 ? `${nom} (≈ ${duree(Number(o.value) / debit)})` : nom;
    // Réécrit seulement s'il change : la liste peut être ouverte, et le rendu
    // passe à chaque image.
    if (o.textContent !== texte) o.textContent = texte;
  }
}

/** Profondeur écrite court : « 60 k », « 1 M ». */
function nomProfondeur(n: number): string {
  return n >= 1e6 ? `${n / 1e6} M` : `${n / 1000} k`;
}

/** Durée, deux chiffres significatifs, dans l'unité qui lui va. */
function duree(ms: number): string {
  const [val, unite] =
    ms < 1000 ? [ms, 'ms'] : ms < 60_000 ? [ms / 1000, 's'] : ms < 3_600_000 ? [ms / 60_000, 'min'] : [ms / 3_600_000, 'h'];
  return `${val.toLocaleString(locale(), { maximumSignificantDigits: 2, useGrouping: false })} ${unite}`;
}

/**
 * Répercute les inversions sur la capture. Appelé à chaque changement de
 * réglage : c'est la capture qui inverse, une fois, pour la vue ET pour le
 * décodage — ce que l'élève voit est donc toujours ce que le décodeur a lu.
 */
function majInversions(): void {
  // Deux inversions se composent : celle du CÂBLAGE (pince sur la patte `-`
  // d'une paire DMX, qui porte le signal inversé) et celle que l'élève règle
  // (« Invert », ligne active-bas). Régler « Invert » sur la voie `-` la remet
  // donc à l'endroit — de quoi la décoder comme la voie `+`.
  const cablees = new Set(diagnostics.filter((d) => d.inverse).map((d) => d.voie));
  const reglees = new Set(
    Object.entries(reglagesVoies)
      .filter(([, r]) => r?.repos === 1)
      .map(([v]) => Number(v))
  );
  capture.reglerInversion([...new Set([...cablees, ...reglees])].filter((v) => cablees.has(v) !== reglees.has(v)));
}

/**
 * Répercute les vitesses de voie sur la capture : le déclenchement sur START
 * code DMX en tire la durée d'un bit, comme le décodeur.
 */
function majVitesses(): void {
  const parVoie = new Map<number, number>();
  for (const [v, r] of Object.entries(reglagesVoies)) if (r?.bauds) parVoie.set(Number(v), r.bauds);
  capture.reglerVitesses(parVoie);
}

/** Décodage : recalculé à chaque rendu, sur la fenêtre visible seulement. */
function calculerAnnotations(): Annotation[] {
  return annotationsEntre(fenetre);
}

/** Décodage d'une fenêtre de temps : la vue, ou la plage d'un export SVG. */
function annotationsEntre(f: Fenetre): Annotation[] {
  if (decodages.length === 0) return [];
  // On ne décode QUE la fenêtre visible, marge d'un octet de chaque côté : à
  // pleine profondeur (60 000 fronts par voie) décoder tout l'enregistrement à
  // chaque image de l'écran coûterait des centaines de milliers d'opérations
  // pour afficher vingt étiquettes.
  const marge = f.duree * 0.1;
  // À gauche, certains protocoles doivent remonter jusqu'au début de leur
  // trame, loin hors de l'écran quand on zoome (DHT : 18 ms de départ).
  const recul = Math.max(marge, ...decodages.map((d) => reculNecessaireMs(d.protocole)));
  const t0 = f.t0 - recul;
  const t1 = f.t0 + f.duree + marge;
  // `capture.fenetre` rend déjà les fronts INVERSÉS sur les voies réglées
  // actives-bas : le décodeur lit donc exactement ce que la vue dessine.
  return decoderTous(trancheCapture(t0, t1), reglagesEffectifs());
}

/** Les voies de la capture entre t0 et t1, telles que la vue les montre. */
function trancheCapture(t0: number, t1: number): VoieCapture[] {
  return capture.listeVoies.map((v) => {
    const f = capture.fenetre(v.voie, t0, t1);
    return { ...v, niveauInitial: f.entrant, fronts: f.fronts };
  });
}

/**
 * Les décodages avec les seuils de leur voie (vitesse, tolérance), qui priment
 * sur ceux du décodage : deux lignes série d'un même montage ne tournent pas
 * forcément à la même vitesse.
 */
function reglagesEffectifs(): ReglageDecodage[] {
  return decodages.map((d) => {
    const rv = d.donnees !== undefined ? reglagesVoies[d.donnees] : undefined;
    if (!rv?.bauds && !rv?.tolerance) return d;
    return {
      ...d,
      ...(rv.bauds ? { bauds: rv.bauds } : {}),
      ...(rv.tolerance ? { tolerance: rv.tolerance } : {}),
    };
  });
}

/**
 * Le déclenchement « début de trame » décode dans la capture : elle doit
 * connaître les décodages tels que la vue les applique. Tout changement de
 * réglage passe par `envoyerReglages`, qui l'appelle.
 */
function majDecodagesCapture(): void {
  capture.reglerDecodages(reglagesEffectifs());
  // ⏮ ⏭ n'ont rien à chercher sans décodage.
  for (const id of ['trame-prec', 'trame-suiv']) {
    const b = document.getElementById(id) as HTMLButtonElement | null;
    if (b) b.disabled = decodages.length === 0;
  }
}

/**
 * Part de la largeur laissée AVANT le début de trame quand ⏮ ⏭ y amènent la
 * vue : le trait vert qui l'ouvre reste visible, décollé du bord.
 */
const MARGE_TRAME = 0.02;

/**
 * Flèches ⏮ ⏭ : amène le début de la trame précédente (-1) ou suivante (+1)
 * au bord gauche de la vue, zoom inchangé (Frank, 25/09). Seulement les trames
 * dont le contenu change (Frank, 26/09) : les répétitions identiques sont
 * sautées, ⏮ revient au début de la série précédente.
 *
 * Les trames sont cherchées dans TOUTE la capture, pas dans la fenêtre : la
 * suivante peut être à des secondes de là (un DS18B20 ne parle qu'une fois par
 * seconde). Décoder toute la capture coûte, mais seulement au clic. Tous les
 * décodages comptent : un montage à deux bus passe de l'un à l'autre dans
 * l'ordre du temps.
 */
function sauterTrame(sens: -1 | 1): void {
  if (decodages.length === 0 || !capture.aDesDonnees) return;
  const debuts = changementsDeTrame(trancheCapture(capture.tDebut, capture.tFin), reglagesEffectifs());
  // Le bord actuel, là où ⏮ ⏭ posent une trame ; un millième de largeur
  // d'écart pour ne pas retomber sur celle qu'on vient de poser.
  const bord = fenetre.t0 + fenetre.duree * MARGE_TRAME;
  const eps = fenetre.duree * 1e-3;
  const cible = sens > 0
    ? debuts.find((t) => t > bord + eps)
    : [...debuts].reverse().find((t) => t < bord - eps);
  if (cible === undefined) return;
  fenetre = { t0: cible - fenetre.duree * MARGE_TRAME, duree: fenetre.duree };
  suivi = false;
  dessiner();
}

// --- Barre d'outils ----------------------------------------------------------

const selHorloge = document.getElementById('horloge') as HTMLSelectElement;
/** Profondeur et bouton « Relancer la capture » : absents d'une page d'avant v2026.9.5.161. */
const selProfondeur = document.getElementById('profondeur') as HTMLSelectElement | null;
const btnRelancer = document.getElementById('relancer') as HTMLButtonElement | null;
const etatTexte = document.getElementById('etat') as HTMLSpanElement;
const btnReafficher = document.getElementById('reafficher') as HTMLButtonElement | null;
/** Bouton ☰ des exports, et son menu (posé hors de la barre, voir analyseur-panel.ts). */
const btnMenuExport = document.getElementById('menu-export') as HTMLButtonElement | null;
const menuExport = document.getElementById('menu-export-liste') as HTMLDivElement | null;

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

/** Nom court d'un protocole, tel que le bouton « P » d'une voie l'affiche. */
const NOMS_PROTOCOLE: Record<Protocole, string> = {
  i2c: 'I²C',
  spi: 'SPI',
  uart: 'UART',
  onewire: '1-W',
  dht: 'DHT',
  dmx: 'DMX',
};

/** Protocoles proposés, dans l'ordre du menu du bouton « P ». */
const PROTOCOLES: Array<[Protocole, string]> = [
  ['i2c', 'I²C / TWI'],
  ['spi', 'SPI'],
  ['uart', 'UART'],
  ['onewire', '1-Wire'],
  ['dht', 'DHT11 / DHT22'],
  ['dmx', 'DMX512'],
];

/** Décodage dont CETTE voie porte les données, ou undefined. */
function decodageDe(voie: number): ReglageDecodage | undefined {
  return decodages.find((d) => d.donnees === voie);
}

// --- Panneaux flottants ------------------------------------------------------
//
// Les trois boutons d'une voie (teinte, « T », « P ») sont DESSINÉS dans le
// canvas, sous le nom de la voie : ils doivent suivre exactement la piste, qui
// se déplace dès qu'on masque une voie. Leurs menus, eux, sont du HTML — une
// liste déroulante et des champs de saisie se font mal à la main sur un
// canvas, et perdraient le clavier.
//
// Un seul panneau à la fois : ouvrir le « P » d'une voie ferme le « T » d'une
// autre. Il se ferme au clic à côté, à la touche Échap, et dès que la vue
// change de taille (sinon il resterait accroché au vide).

/** Panneau ouvert, ou null. */
let panneau: HTMLDivElement | null = null;
/** Ce que le panneau ouvert montre — sert à refermer au second clic. */
let panneauPour: { voie: number; quoi: BoutonVoie } | null = null;

/** Ferme le panneau flottant s'il y en a un, menu ☰ compris. */
function fermerPanneau(): void {
  panneau?.remove();
  panneau = null;
  panneauPour = null;
  fermerMenuExport();
}

/**
 * Ouvre un panneau ancré SOUS un bouton du canvas.
 *
 * L'ancrage se fait en coordonnées de page : le canvas défile avec elle, et un
 * panneau posé aux coordonnées du canvas seul finirait décalé dès que la liste
 * des voies dépasse la hauteur de la fenêtre.
 */
function ouvrirPanneau(z: ZoneBouton, contenu: HTMLElement, liste: boolean): void {
  fermerPanneau();
  const r = canvas.getBoundingClientRect();
  const boite = document.createElement('div');
  boite.className = liste ? 'flottant flottant--liste' : 'flottant';
  boite.append(contenu);
  document.body.append(boite);
  // Posé d'abord, mesuré ensuite : sa largeur dépend de son contenu, et il ne
  // doit pas dépasser le bord droit de la page.
  const x = r.left + window.scrollX + z.x;
  const y = r.top + window.scrollY + z.y + z.h + 4;
  const largeur = boite.offsetWidth;
  boite.style.left = `${Math.max(4, Math.min(x, window.scrollX + document.documentElement.clientWidth - largeur - 6))}px`;
  boite.style.top = `${y}px`;
  panneau = boite;
  panneauPour = { voie: z.voie, quoi: z.quoi };
}

/** Une entrée de menu : un dessin optionnel, un libellé, un état enfoncé. */
function entreeMenu(
  libelle: string,
  actif: boolean,
  action: () => void,
  dessin?: SVGElement
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-pressed', String(actif));
  if (dessin) b.append(dessin);
  b.append(document.createTextNode(libelle));
  b.addEventListener('click', () => {
    action();
    fermerPanneau();
  });
  return b;
}

/** Marche montante ou descendante, en SVG, pour les entrées du menu « T ». */
function dessinMarche(sens: 'rising' | 'falling'): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 18 14');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', sens === 'rising' ? 'M2 11 H9 V3 H16' : 'M2 3 H9 V11 H16');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.8');
  svg.append(p);
  return svg;
}

/**
 * Début de trame en SVG : un trait, puis le bloc de la trame qu'il ouvre. Le
 * bouton « T » armé dessus montre le même dessin.
 */
function dessinDebutTrame(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 18 14');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M3 2 H4.8 V12 H3 Z M7 4 H16 V10 H7 Z');
  p.setAttribute('fill', 'currentColor');
  svg.append(p);
  return svg;
}

/** « SC » en SVG : ce que montre le bouton « T » armé sur un START code DMX. */
function dessinStartCode(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 18 14');
  const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  txt.setAttribute('x', '9');
  txt.setAttribute('y', '10.5');
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('font-size', '9');
  txt.setAttribute('font-weight', 'bold');
  txt.setAttribute('fill', 'currentColor');
  txt.textContent = 'SC';
  svg.append(txt);
  return svg;
}

/**
 * Menu du bouton « T » d'une voie : aucun déclenchement, front montant, front
 * descendant — et, sur une voie décodée, le début de trame (le START code 0x00
 * pour le DMX512).
 *
 * Le déclenchement reste UNIQUE pour toute la capture — c'est ainsi que
 * fonctionne un analyseur, et `AnalyseurCapture` n'en tient qu'un. Choisir un
 * front sur une voie le retire donc de celle qui l'avait : les autres boutons
 * reviennent à leur « T », ce que Frank décrit exactement.
 */
function menuDeclenchement(z: ZoneBouton): void {
  const boite = document.createElement('div');
  boite.style.display = 'contents';
  const courant = capture.reglageDeclenchement;
  const sur = courant && courant.voie === z.voie ? courant.sens : null;
  boite.append(
    // « Aucun » ne retire que le déclenchement DE CETTE VOIE : celui d'une
    // autre voie reste en place.
    entreeMenu(t('No trigger'), sur === null, () => {
      if (sur !== null) choisirDeclenchement(null);
    }),
    entreeMenu(
      t('Rising edge'),
      sur === 'rising',
      () => choisirDeclenchement({ voie: z.voie, sens: 'rising' }),
      dessinMarche('rising')
    ),
    entreeMenu(
      t('Falling edge'),
      sur === 'falling',
      () => choisirDeclenchement({ voie: z.voie, sens: 'falling' }),
      dessinMarche('falling')
    )
  );
  // Début de trame : sur toute voie décodée — le DMX a déjà le sien, plus
  // précis, juste en dessous. Ce qu'est une trame, c'est le décodeur qui le
  // dit (START I²C, CS ↓, RESET, départ DHT, caractère série après un silence).
  const proto = decodageDe(z.voie)?.protocole;
  if ((proto !== undefined && proto !== 'dmx') || sur === 'trame') {
    boite.append(
      entreeMenu(
        t('Frame start'),
        sur === 'trame',
        () => choisirDeclenchement({ voie: z.voie, sens: 'trame' }),
        dessinDebutTrame()
      )
    );
  }
  // Proposé seulement là où il a un sens : une voie décodée en DMX512 (ou
  // déjà armée dessus, pour pouvoir le voir coché). Terme de la norme, jamais
  // traduit.
  if (proto === 'dmx' || sur === 'dmxStart') {
    boite.append(
      entreeMenu(
        'START code 0x00',
        sur === 'dmxStart',
        () => choisirDeclenchement({ voie: z.voie, sens: 'dmxStart' }),
        dessinStartCode()
      )
    );
  }
  ouvrirPanneau(z, boite, true);
}

/**
 * Menu du bouton « P » d'une voie : quel bus décoder sur elle.
 *
 * La voie cliquée devient la voie de DONNÉES du décodage — c'est toujours elle
 * qu'on regarde. Les rôles complémentaires (l'horloge d'un I²C, le CS d'un SPI)
 * et les options du protocole (mode, format, modèle de capteur) se règlent dans
 * le second panneau, celui qui s'ouvre quand un décodage est déjà posé.
 */
function menuProtocole(z: ZoneBouton): void {
  const existant = decodageDe(z.voie);
  if (existant) {
    ouvrirPanneau(z, panneauDecodage(existant, z.voie), false);
    return;
  }
  const boite = document.createElement('div');
  boite.style.display = 'contents';
  boite.append(
    entreeMenu(t('No decoding'), true, () => {
      /* déjà le cas : le menu se referme sans rien changer */
    })
  );
  for (const [cle, nom] of PROTOCOLES) {
    boite.append(
      entreeMenu(nom, false, () => {
        idDecodage += 1;
        decodages.push({ protocole: cle, id: `d${idDecodage}`, donnees: z.voie });
        dessiner();
        envoyerReglages();
      })
    );
  }
  ouvrirPanneau(z, boite, true);
}

/**
 * Formats série proposés, écrits comme dans un programme Arduino
 * (`SERIAL_8N1`). On s'en tient aux formats réellement rencontrés : les
 * combinaisons exotiques (5 bits, parité impaire sur 9 bits) n'apprennent rien
 * et allongent la liste jusqu'à la rendre illisible.
 */
const FORMATS_UART: Array<{
  cle: string;
  bits: 5 | 6 | 7 | 8 | 9;
  parite: 'none' | 'even' | 'odd';
  stop: 1 | 2;
}> = [
  { cle: '8N1', bits: 8, parite: 'none', stop: 1 },
  { cle: '8N2', bits: 8, parite: 'none', stop: 2 },
  { cle: '8E1', bits: 8, parite: 'even', stop: 1 },
  { cle: '8O1', bits: 8, parite: 'odd', stop: 1 },
  { cle: '7N1', bits: 7, parite: 'none', stop: 1 },
  { cle: '7E1', bits: 7, parite: 'even', stop: 1 },
  { cle: '7O1', bits: 7, parite: 'odd', stop: 1 },
];

/** Clé du format courant d'un décodage UART, 8N1 s'il n'a rien de réglé. */
function formatUart(d: ReglageDecodage): string {
  const bits = d.bitsDonnees ?? 8;
  const parite = d.parite ?? 'none';
  const stop = d.bitsArret ?? 1;
  const f = FORMATS_UART.find((x) => x.bits === bits && x.parite === parite && x.stop === stop);
  return f ? f.cle : '8N1';
}

/**
 * Réglages d'un décodage POSÉ sur une voie : son protocole, les voies de ses
 * autres rôles, ses options, et de quoi l'ôter.
 *
 * La voie de données n'y figure pas : c'est la voie du bouton qu'on a cliqué,
 * et la déplacer ici ferait sauter le réglage sur une piste qu'on ne regarde
 * pas.
 */
function panneauDecodage(d: ReglageDecodage, voie: number): HTMLElement {
  const boite = document.createElement('div');
  boite.style.display = 'contents';
  const refaire = (): void => {
    dessiner();
    envoyerReglages();
  };

  const labProto = document.createElement('label');
  labProto.textContent = t('Bus');
  const selProto = document.createElement('select');
  for (const [v, nom] of PROTOCOLES) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = nom;
    selProto.append(o);
  }
  selProto.value = d.protocole;
  selProto.addEventListener('change', () => {
    // Changer de protocole vide les rôles : les voies d'un I²C (SCL/SDA) ne
    // veulent rien dire pour un DMX, et les garder ferait décoder n'importe
    // quoi. La voie de données, elle, reste — c'est celle qu'on regarde.
    // La base d'affichage et les bits, eux, sont une façon de LIRE, pas un
    // rôle : ils restent.
    const { id, base, bits } = d;
    for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k];
    d.protocole = selProto.value as Protocole;
    d.id = id;
    if (base) d.base = base;
    if (bits) d.bits = true;
    d.donnees = voie;
    refaire();
    // Le panneau montre d'autres rôles selon le bus : on le refait sur place.
    const z = zoneDe(voie, 'protocole');
    if (z) ouvrirPanneau(z, panneauDecodage(d, voie), false);
  });
  labProto.append(selProto);
  boite.append(labProto);

  for (const role of rolesDe(d.protocole)) {
    if (role.cle === 'donnees') continue; // c'est la voie du bouton cliqué
    const lab = document.createElement('label');
    lab.textContent = role.nom;
    const sel = document.createElement('select');
    remplirVoies(sel, role.obligatoire ? '—' : t('none'));
    const courant = d[role.cle];
    if (typeof courant === 'number') sel.value = String(courant);
    sel.addEventListener('change', () => {
      const v = sel.value === '' ? -1 : Number(sel.value);
      // Les rôles de voie (`horloge`, `selection`…) sont tous des indices de
      // voie : l'écriture indexée est sûre, le nom de clé vient de `rolesDe`.
      (d as unknown as Record<string, number>)[role.cle] = v;
      refaire();
    });
    lab.append(sel);
    boite.append(lab);
  }

  if (d.protocole === 'spi') {
    // Le mode SPI (CPOL/CPHA) n'est pas devinable depuis les créneaux : deux
    // modes donnent les mêmes fronts et des octets différents. C'est un réglage,
    // comme sur un analyseur du commerce.
    const lab = document.createElement('label');
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
      refaire();
    });
    lab.append(sel);
    boite.append(lab);
  }

  if (d.protocole === 'uart') {
    // Le format (bits de données, parité, bits d'arrêt) ne se devine pas depuis
    // les créneaux : 8N1 et 7E1 donnent les mêmes fronts et des octets
    // différents. Une liste unique plutôt que trois réglages — c'est ainsi que
    // l'élève l'écrit dans son programme (`Serial.begin(9600, SERIAL_8N1)`).
    const lab = document.createElement('label');
    lab.textContent = t('Format');
    const sel = document.createElement('select');
    for (const f of FORMATS_UART) {
      const o = document.createElement('option');
      o.value = f.cle;
      o.textContent = f.cle;
      sel.append(o);
    }
    sel.value = formatUart(d);
    sel.addEventListener('change', () => {
      const f = FORMATS_UART.find((x) => x.cle === sel.value) ?? FORMATS_UART[0]!;
      d.bitsDonnees = f.bits;
      d.parite = f.parite;
      d.bitsArret = f.stop;
      refaire();
    });
    lab.append(sel);
    boite.append(lab);
  }

  if (d.protocole === 'dht') {
    // Les deux capteurs envoient la MÊME trame, avec les mêmes durées : rien
    // sur le fil ne dit lequel parle. Seule l'interprétation des octets change
    // — d'où un réglage, comme le mode SPI ou le format UART.
    const lab = document.createElement('label');
    lab.textContent = t('Sensor');
    const sel = document.createElement('select');
    for (const [v, nom] of [
      ['dht22', 'DHT22'],
      ['dht11', 'DHT11'],
    ] as Array<['dht11' | 'dht22', string]>) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = nom;
      sel.append(o);
    }
    sel.value = d.modele ?? 'dht22';
    sel.addEventListener('change', () => {
      d.modele = sel.value as 'dht11' | 'dht22';
      refaire();
    });
    lab.append(sel);
    boite.append(lab);
  }

  // Hexadécimal ou décimal, pour tous les bus : une fiche technique écrit
  // `0x44`, le programme compare souvent à `68`. Les deux doivent pouvoir se
  // retrouver sous la courbe sans calcul de tête.
  const labBase = document.createElement('label');
  labBase.textContent = t('Values');
  const selBase = document.createElement('select');
  for (const [v, nom] of [
    ['hex', t('Hexadecimal')],
    ['dec', t('Decimal')],
  ] as Array<['hex' | 'dec', string]>) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = nom;
    selBase.append(o);
  }
  selBase.value = d.base ?? 'hex';
  selBase.addEventListener('change', () => {
    // L'hexadécimal est le défaut : on ne l'écrit pas dans le projet.
    if (selBase.value === 'dec') d.base = 'dec';
    else delete d.base;
    refaire();
  });
  labBase.append(selBase);
  boite.append(labBase);

  // Affichage binaire, pour tous les bus : chaque bit sous son créneau, borné
  // par un séparateur. Décochée (défaut), la case n'écrit rien dans le projet.
  const labBits = document.createElement('label');
  labBits.title = t('Write each bit under the signal, with a marker between bits.');
  const caseBits = document.createElement('input');
  caseBits.type = 'checkbox';
  caseBits.checked = d.bits === true;
  caseBits.addEventListener('change', () => {
    if (caseBits.checked) d.bits = true;
    else delete d.bits;
    refaire();
  });
  labBits.append(caseBits, document.createTextNode(t('Bits')));
  boite.append(labBits);

  const oter = document.createElement('button');
  oter.type = 'button';
  oter.textContent = t('Remove');
  oter.title = t('Remove this decoding');
  oter.addEventListener('click', () => {
    decodages = decodages.filter((x) => x !== d);
    fermerPanneau();
    dessiner();
    envoyerReglages();
  });
  boite.append(oter);
  return boite;
}

/**
 * Renvoie les réglages à l'hôte pour qu'ils soient enregistrés dans le .projix :
 * retrouver son déclenchement et son décodage à la réouverture fait partie de
 * l'instrument (personne ne rerègle un analyseur à chaque ouverture).
 */
function envoyerReglages(): void {
  majDecodagesCapture();
  vscode?.postMessage({
    type: 'analyseurReglages',
    declenchement: capture.reglageDeclenchement,
    decodages,
    voiesReglages: reglagesVoies,
    echantillonnage,
    profondeur,
  });
}

// --- Fréquence d'échantillonnage --------------------------------------------

/**
 * Fréquence d'échantillonnage simulée, en hertz. 0 = illimitée (réglage par
 * défaut).
 *
 * Kablix date ses fronts au CYCLE du processeur : il n'échantillonne pas, il
 * sait exactement quand chaque broche a basculé. Un vrai analyseur, lui, regarde
 * ses entrées à intervalle fixe, et deux fronts plus rapprochés qu'un
 * échantillon se confondent — c'est ainsi qu'on rate une impulsion trop brève
 * en sondant un bus SPI à 1 MHz. Le réglage reproduit cette limite : il n'ajoute
 * rien à la capture, il en RETIRE ce qu'un instrument de cette fréquence
 * n'aurait pas vu. L'élève découvre ainsi pourquoi son analyseur du commerce
 * doit échantillonner bien plus vite que le signal qu'il observe.
 */
let echantillonnage = 0;

/** Répercute la fréquence choisie sur la capture. */
function majEchantillonnage(): void {
  capture.reglerEchantillonnage(echantillonnage);
}

/**
 * Profondeur de capture, en fronts par voie (liste « Profondeur » de la barre,
 * Frank 26/09). Elle vaut pour l'acquisition en cours pendant un run, et pour
 * le run suivant sinon : une capture arrêtée reste celle qui a été mesurée.
 */
let profondeur: number = FRONTS_MAX_PAR_VOIE;

/** Profondeur lue d'un réglage enregistré : une des valeurs de la liste, sinon le défaut. */
function profondeurValide(p: unknown): number {
  return (PROFONDEURS as readonly number[]).includes(p as number) ? (p as number) : FRONTS_MAX_PAR_VOIE;
}

// --- Boutons dessinés sur les pistes -----------------------------------------

/** Zone d'un bouton de voie, telle que le dernier rendu l'a posée. */
function zoneDe(voie: number, quoi: BoutonVoie): ZoneBouton | null {
  return vue.zoneDe(voie, quoi);
}

/**
 * Menu de la pastille de teinte : tous les réglages propres à la voie (nom,
 * sens au repos, masquage, vitesse, tolérance). Le choix de la couleur en est
 * sorti en v2026.9.4.130 (Frank : « ne sert à rien ») — la pastille garde la
 * teinte de l'indice de voie.
 *
 * Ils étaient dans la légende du haut, qui n'existe plus : régler une voie se
 * fait maintenant là où on la regarde.
 */
function menuVoie(z: ZoneBouton): void {
  const d = diagnostics.find((x) => x.voie === z.voie);
  if (!d) return;
  const boite = document.createElement('div');
  boite.style.display = 'contents';
  const r = (reglagesVoies[d.voie] ??= {});
  const change = (): void => {
    majInversions();
    majVitesses();
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
  });
  labNom.append(champNom);
  boite.append(labNom);

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
  // « Invert » plutôt que « Idle high » (Frank, 24/09) : on dit ce que fait la
  // case, pas la raison de la cocher — la raison reste dans l'infobulle.
  labRepos.append(caseRepos, document.createTextNode(t('Invert')));
  boite.append(labRepos);

  const labMasque = document.createElement('label');
  labMasque.title = t('Hide this channel: it keeps its capture, it just leaves the screen.');
  const caseMasque = document.createElement('input');
  caseMasque.type = 'checkbox';
  caseMasque.checked = r.masquee === true;
  caseMasque.addEventListener('change', () => {
    r.masquee = caseMasque.checked;
    // La piste disparaît : le panneau était ancré dessus, il n'a plus d'appui.
    fermerPanneau();
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

  ouvrirPanneau(z, boite, false);
}

/**
 * Clic sur le canvas : s'il tombe sur un bouton de voie, il ouvre son menu.
 *
 * Posé en capture, AVANT le `pointerdown` qui commence un glissé : cliquer un
 * bouton ne doit pas faire défiler l'enregistrement de quelques millisecondes
 * au passage.
 */
canvas.addEventListener(
  'pointerdown',
  (ev) => {
    const r = canvas.getBoundingClientRect();
    // Bouton de rappel : M1 et M2 retournent au garage (Frank, 26/09 — en
    // zoomant, un marqueur posé sort de la vue et on ne le retrouve plus).
    if (ev.button === 0 && vue.rappelA(ev.clientX - r.left, ev.clientY - r.top)) {
      ev.stopPropagation();
      ev.preventDefault();
      fermerPanneau();
      marqueurs[0] = null;
      marqueurs[1] = null;
      canvas.style.cursor = '';
      canvas.title = '';
      dessiner();
      return;
    }
    // Un marqueur sous la souris : on le prend, et la vue ne défile pas.
    const m = ev.button === 0 ? vue.marqueurA(ev.clientX - r.left, ev.clientY - r.top) : null;
    if (m !== null) {
      ev.stopPropagation();
      ev.preventDefault();
      fermerPanneau();
      marqueurPris = m;
      canvas.setPointerCapture(ev.pointerId);
      canvas.style.cursor = 'ew-resize';
      dessiner();
      return;
    }
    const z = vue.boutonA(ev.clientX - r.left, ev.clientY - r.top);
    if (!z) return;
    ev.stopPropagation();
    ev.preventDefault();
    // Second clic sur le même bouton : on referme, comme tout menu.
    if (panneauPour && panneauPour.voie === z.voie && panneauPour.quoi === z.quoi) {
      fermerPanneau();
      return;
    }
    if (z.quoi === 'teinte') menuVoie(z);
    else if (z.quoi === 'declenchement') menuDeclenchement(z);
    else menuProtocole(z);
  },
  true
);

// Clic à côté, ou touche Échap : le panneau se referme, comme tout menu.
document.addEventListener(
  'pointerdown',
  (ev) => {
    if (panneau && !panneau.contains(ev.target as Node)) fermerPanneau();
    // Le bouton ☰ lui-même est exclu : son clic referme le menu ouvert, le
    // fermer ici le rouvrirait aussitôt.
    const cible = ev.target as Node;
    if (menuExport && !menuExport.hidden && !menuExport.contains(cible) && !btnMenuExport?.contains(cible)) {
      fermerMenuExport();
    }
  },
  true
);
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') fermerPanneau();
  // ← → : défilement d'une demi-fenêtre, comme les flèches de la barre. Pas
  // quand la frappe va à un champ : la flèche y déplace le curseur du nom de
  // voie, ou change l'échantillonnage dans sa liste.
  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
  if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
  const cible = ev.target as HTMLElement | null;
  if (cible?.closest?.('input, select, textarea')) return;
  ev.preventDefault();
  defiler(ev.key === 'ArrowLeft' ? -1 : 1);
});

// --- Entrées de l'hôte -------------------------------------------------------

window.addEventListener('message', (ev) => {
  const msg = ev.data as MessageEntrant;
  switch (msg.type) {
    case 'voies': {
      // LISTE VIDE, HORS SIMULATION, alors qu'une capture est affichée : on la
      // garde. L'atelier pousse ses voies à chaque `onChange` du schéma, y
      // compris les onChange « neutres » qui suivent le chargement d'un projet —
      // et à cet instant il n'a encore résolu aucune sonde, donc il envoie une
      // liste VIDE. Elle arrivait APRÈS le `restaure` de l'hôte et écrasait
      // tout : `diagnostics` remis à zéro ET `capture.declarerVoies([])`, qui
      // jette les fronts. Mesuré : 23 897 pixels de courbes tombant aux 936 du
      // message « aucune sonde ». C'est la page grise de Frank (20/09).
      // Le repli de `restaurer()` ne rattrapait rien : il ne dresse les pistes
      // que si `diagnostics` est vide AU MOMENT du `restaure`, pas après.
      // Pendant une capture en cours, au contraire, une liste vide veut bien
      // dire « plus aucune pince » et doit vider la vue.
      //
      // MÊME SYMPTÔME, AUTRE CHEMIN (22/09) : le message peut aussi arriver
      // PLEIN, mais de voies EN DÉFAUT. `pousserVoiesLogiques()` est appelé hors
      // du garde `loadingProject`, donc à chaque étape du montage d'un projet :
      // `clear()` notifie sur un schéma vide, puis les composants sont posés
      // AVANT les fils. Une sonde reliée par un fil n'a alors aucune broche à
      // suivre et ressort `not-mcu` / `nowhere`. Ce message passait le garde
      // ci-dessus (la liste n'est pas vide), et `declarerVoies` ne retenant que
      // les voies SANS défaut, toutes les pistes étaient jetées — fronts
      // compris, donc sans retour possible quand l'atelier résout enfin.
      // Mesuré sur sonde-logique-pico : 62 051 pixels de courbes tombant à
      // 16 677, et 16 677 encore après résolution. La page grise de Frank.
      //
      // Le critère doit rester ÉTROIT : « aucune piste pour les broches
      // capturées » ne suffit pas comme règle, car c'est aussi ce que produit un
      // vrai changement de schéma — ouvrir un second projet, déplacer la pince
      // ailleurs. Dans ce cas la capture DOIT céder la place. Ce qui distingue
      // un montage en cours, c'est que ses voies sont EN DÉFAUT : l'atelier
      // décrit un schéma qu'il n'a pas fini de lire, pas un schéma sans sonde.
      // On n'écarte donc que le message dont AUCUNE voie n'est saine.
      if (!enCours && capture.aDesDonnees) {
        // Liste vide : le garde d'origine (.118) — l'atelier n'a encore rien résolu.
        if (msg.voies.length === 0) return;
        // Liste pleine, mais dont AUCUNE voie n'est exploitable : schéma en cours
        // de montage. Une seule voie saine suffit à reprendre la main.
        if (msg.voies.every((v) => v.probleme || !v.pin)) return;
      }
      diagnostics = msg.voies.map((v) => ({
        voie: v.voie,
        nom: v.nom,
        pin: v.pin,
        probleme: v.probleme,
        analogique: v.analogique,
        suivi: v.suivi === true,
        ...(v.inverse ? { inverse: true } : {}),
        ...(typeof v.volts === 'number' && v.volts > 0 ? { volts: v.volts } : {}),
        ...(typeof v.voltsBas === 'number' && v.voltsBas > 0 && v.voltsBas < (v.volts ?? 0) ? { voltsBas: v.voltsBas } : {}),
      }));
      // La capture suit ses BROCHES, pas ses numéros. Si ce message arrive après
      // un `restaure` — l'atelier résout ses sondes en retard —, la capture est
      // encore rangée sous les numéros du .projix. Or `declarerVoies` ne garde
      // les fronts qu'à voie ET broche identiques : sans ce renumérotage, GP15
      // capturé en voie 1 puis redéclaré en voie 2 perdrait tout.
      capture.renumeroter(diagnostics.filter((d) => d.pin).map((d) => ({ voie: d.voie, pin: d.pin })));
      // Seules les voies traçables entrent dans la capture : une sonde en l'air
      // n'a pas de broche, donc rien à quoi rattacher des fronts.
      capture.declarerVoies(
        diagnostics
          .filter((d) => !d.probleme && d.pin)
          .map((d) => ({ voie: d.voie, pin: d.pin, nom: d.nom }))
      );
      // Une pince passée derrière un reflet inversant (ou revenue) change la
      // lecture de sa voie.
      majInversions();
      // Les voies ont changé : un panneau ouvert pointerait une piste qui n'est
      // peut-être plus là, et resterait posé dans le vide.
      fermerPanneau();
      dessiner();
      return;
    }
    case 'fronts': {
      // Des fronts sans capture rendue avant eux : la fenêtre gardée ne
      // correspond plus à rien.
      fenetreAReprendre = null;
      const attendait = capture.tTrigger === null;
      capture.verser(msg.salves);
      // Le déclenchement vient de tomber : la vue saute dessus et y reste.
      if (attendait && capture.tTrigger !== null) allerAuDeclenchement();
      else suivreFin();
      dessiner();
      return;
    }
    case 'depart':
      enCours = true;
      capture.reinitialiser();
      // Choisie à l'arrêt, elle attendait ce run.
      capture.reglerProfondeur(profondeur);
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
    case 'repeindre':
      // FORCÉ, pas `dessiner()` : une demande en attente pourrait tenir le
      // verrou (`raf` armé mais jamais servi tant que l'onglet était derrière,
      // minuterie ralentie par le navigateur dans un onglet d'arrière-plan), et
      // la seule demande qui compte — celle qui arrive quand la page a enfin
      // une largeur — serait alors avalée en silence.
      redessinerMaintenant();
      return;
  }
});

/** Recharge une capture enregistrée (ouverture de l'onglet hors simulation). */
function restaurer(etat: EtatSerialise): void {
  // LA BROCHE FAIT FOI, PAS LE NUMÉRO DE VOIE. Une capture et un schéma
  // désignent la même sonde de deux façons : la capture par la BROCHE qu'elle a
  // mesurée, le schéma par le NUMÉRO DE VOIE de la pince. Or le numéro n'est
  // qu'une teinte : il change dès que Frank renumérote ses pinces, ajoute une
  // voie ou en retire une. Les deux se désaccordent alors, et comme la vue
  // apparie les fronts à leur piste PAR NUMÉRO, les courbes tombent dans des
  // pistes qui n'existent pas.
  //
  // Mesuré sur sonde-logique-pico : schéma sur les voies 0/2/3/4, capture sur
  // les voies 0 et 1. Les 3 988 fronts de GP15 étaient rangés en voie 1, qui
  // n'a aucune piste, pendant que la piste 2 — la pince POSÉE sur GP15 —
  // restait plate. Trois pistes sur quatre muettes (2 508 px de trait de repos
  // contre 31 348 pour celle qui tombait juste), et zéro courbe dès que la voie
  // 0 ne coïncide pas non plus. C'est la page grise de Frank.
  //
  // On renumérote donc la capture sur les voies du schéma, par broche. Une
  // broche que le schéma ne sonde plus garde son numéro d'origine : sa piste
  // n'existe pas, mais ses fronts restent là si le message `voies` la ramène.
  //
  // Plusieurs pinces peuvent écouter la même broche (SIG, + et - d'une carte
  // DMX) : une voie enregistrée déjà à sa place (même numéro, même broche) y
  // reste, les autres prennent un numéro encore libre de leur broche.
  const enPlace = new Set(diagnostics.filter((d) => d.pin).map((d) => `${d.voie}\u0000${d.pin}`));
  const libres = new Map<string, number[]>();
  for (const d of diagnostics) {
    if (!d.pin || etat.voies.some((v) => v.voie === d.voie && v.pin === d.pin)) continue;
    libres.set(d.pin, [...(libres.get(d.pin) ?? []), d.voie]);
  }
  const voieDe = (v: { voie: number; pin: string }): number =>
    enPlace.has(`${v.voie}\u0000${v.pin}`) ? v.voie : (libres.get(v.pin)?.shift() ?? v.voie);
  capture.declarerVoies(
    etat.voies.length > 0
      ? etat.voies.map((v) => ({ voie: voieDe(v), pin: v.pin, nom: v.nom }))
      : // Réglages SEULS : l'hôte n'a aucune mesure à rendre (run qui démarre,
        // projet sans capture). Les voies restent celles du schéma — les jeter
        // laissait la capture sans broche où ranger les fronts, et l'onglet
        // ouvert en plein run restait plat jusqu'au prochain message `voies`.
        diagnostics.filter((d) => !d.probleme && d.pin).map((d) => ({ voie: d.voie, pin: d.pin, nom: d.nom }))
  );
  // Une capture enregistrée est COMPLÈTE : elle remplace ce qui est affiché,
  // elle ne s'y ajoute pas. `declarerVoies` garde les fronts d'une voie à broche
  // inchangée — voulu pendant un run, faux ici : rouvrir le même projet, onglet
  // ouvert, versait une seconde fois les mêmes fronts derrière les premiers, le
  // temps repartait en arrière et chaque piste se barrait d'un trait parasite.
  capture.reinitialiser();
  // Les PISTES viennent normalement du message `voies`, que pousse l'atelier.
  // Mais à la réouverture d'un projet sans avoir relancé la simulation, l'atelier
  // n'a encore rien poussé : la liste de l'hôte est vide, et la capture du
  // .projix — pourtant complète — n'avait alors aucune piste où se dessiner.
  // L'onglet affichait « aucune sonde » par-dessus des milliers de fronts bien
  // présents : la page grise signalée par Frank sur dmx-pico.
  // La capture est autoportante (chaque voie porte son numéro, sa broche et son
  // nom) : on s'en sert pour dresser les pistes tant que rien d'autre ne l'a
  // fait. Le message `voies`, quand il arrive, reprend la main.
  //
  // Le critère n'est PAS « aucune piste » mais « aucune piste POUR LES BROCHES
  // DE CETTE CAPTURE ». Un atelier où l'on ouvre un SECOND projet garde en
  // place les voies du premier : l'hôte n'envoie alors que `restaure`
  // (`chargerAnalyseur` dans panel.ts), jamais de `voies`, et l'ancien schéma
  // reste aux commandes. Mesuré sur le scénario de Frank, projet à 1 pince sur
  // GP21 puis ouverture de sonde-logique-pico2 : l'onglet gardait UNE piste de
  // 90 px et 1 290 pixels de trait plat, par-dessus 16 000 fronts bien
  // présents. C'est sa page grise — la capture était là, sa piste n'existait
  // pas.
  const brochesCapturees = new Set(etat.voies.map((v) => v.pin).filter(Boolean));
  const aUnePisteUtile = diagnostics.some((d) => d.pin && brochesCapturees.has(d.pin));
  if (!aUnePisteUtile && etat.voies.length > 0) {
    diagnostics = etat.voies.map((v) => ({
      voie: v.voie,
      nom: v.nom,
      pin: v.pin,
      probleme: null,
      analogique: false,
      suivi: false,
    }));
  }
  // La LECTURE d'abord (échantillonnage, inversion, vitesse), le déclenchement
  // ensuite : il se cherche dans ce que la courbe montre, pas dans les fronts
  // bruts.
  reglagesVoies = etat.voiesReglages ?? {};
  echantillonnage = etat.echantillonnage ?? 0;
  selHorloge.value = String(echantillonnage);
  majEchantillonnage();
  // La profondeur AVANT les fronts rejoués : la capture rechargée garde ce
  // qu'elle aurait gardé en direct.
  profondeur = profondeurValide(etat.profondeur);
  if (selProfondeur) selProfondeur.value = String(profondeur);
  capture.reglerProfondeur(profondeur);
  majInversions();
  majVitesses();
  // Les décodages AVANT le déclenchement : « début de trame » décode pour
  // trouver sa trame.
  // `decodages` depuis v2026.9.4.94 ; `decodage` (un seul) est ce qu'ont écrit
  // les .projix d'avant, qui doivent rouvrir avec leur réglage.
  decodages = etat.decodages ?? (etat.decodage ? [etat.decodage] : []);
  // Les numéros déjà pris d'abord : un décodage ajouté ensuite ne doit pas
  // reprendre l'id d'un décodage rechargé.
  for (const d of decodages) {
    const n = /^d(\d+)$/.exec(d.id ?? '');
    if (n) idDecodage = Math.max(idDecodage, Number(n[1]));
  }
  for (const d of decodages) {
    if (!d.id) {
      idDecodage += 1;
      d.id = `d${idDecodage}`;
    }
  }
  majDecodagesCapture();
  capture.reglerDeclenchement(etat.declenchement ?? null);
  // Les fronts APRÈS les réglages : la capture les reçoit comme en direct, et
  // garde ce qu'elle aurait gardé — la fenêtre autour du déclenchement, ou la
  // fin du run sans lui. Versés d'abord, ils étaient rabotés à la fin du run
  // avant que le déclenchement n'existe.
  const salves: Record<string, number[]> = {};
  for (const v of etat.voies) salves[v.pin] = v.fronts;
  capture.rejouer(salves);
  // Capture arrêtée : le front qui a déclenché est déjà dans les fronts rechargés.
  capture.chercherDeclenchement();
  // En plein run (l'atelier repousse ses réglages à chaque lancement), cadrer
  // la capture encore vide coupait le suivi : la vue restait figée sur ses
  // premières millisecondes.
  // Page tout juste rechargée (onglet déplacé) : la fenêtre de l'élève d'abord.
  if (reprendreFenetre()) {
    dessiner();
  } else if (enCours) {
    suivi = true;
    suivreFin();
    dessiner();
  } else {
    ajuster();
  }
}

// --- Souris ------------------------------------------------------------------

/**
 * Bulle d'un bouton de la marge (Frank, 26/09 : « Dans la marge il faudrait des
 * bulles explicatives au survol de chaque bouton »). Les boutons sont peints
 * dans le canvas : pas d'élément à qui donner un `title`, c'est le canvas qui
 * prend celui du bouton survolé. Elle dit aussi l'état : quel déclenchement est
 * armé, quel bus est décodé.
 */
function bulleBouton(z: ZoneBouton): string {
  if (z.quoi === 'teinte') return t('Channel settings: name, invert, hide, baud rate, tolerance');
  if (z.quoi === 'declenchement') {
    const decl = capture.reglageDeclenchement;
    if (!decl || decl.voie !== z.voie) {
      return t('Trigger: wait for an edge on this channel, then freeze the capture on it');
    }
    const sens =
      decl.sens === 'rising'
        ? t('Rising edge')
        : decl.sens === 'falling'
          ? t('Falling edge')
          : decl.sens === 'trame'
            ? t('Frame start')
            : 'START code 0x00';
    return t('Trigger on this channel: {0}. Click to change or remove it.', sens);
  }
  const p = decodageDe(z.voie)?.protocole;
  if (!p) return t('Decoding: read a bus on this channel (I²C, SPI, UART, 1-Wire, DHT, DMX512)');
  const nom = PROTOCOLES.find(([cle]) => cle === p)?.[1] ?? NOMS_PROTOCOLE[p];
  return t('Decoding: {0}. Click for its settings or to remove it.', nom);
}

/** Bulle d'un marqueur : garé, il dit à quoi il sert ; posé, comment le ranger. */
function bulleMarqueur(m: number): string {
  const nom = m === 0 ? 'M1' : 'M2';
  return marqueurs[m] === null
    ? t('Marker {0}: drag it onto the curves. With M1 and M2 placed, the time between them is shown and the exports keep only that span.', nom)
    : t('Marker {0}: drag it along the curves; drop it back in the names column to park it.', nom);
}

canvas.addEventListener('pointermove', (ev) => {
  const r = canvas.getBoundingClientRect();
  souris = { x: ev.clientX - r.left, y: ev.clientY - r.top };
  if (marqueurPris !== null) deplacerMarqueur(marqueurPris, souris.x);
  // Un marqueur se prend à la souris : le curseur le dit en le survolant.
  const surRappel = marqueurPris === null && vue.rappelA(souris.x, souris.y);
  const surMarqueur = marqueurPris === null ? vue.marqueurA(souris.x, souris.y) : null;
  const bouton = marqueurPris === null && !surRappel && surMarqueur === null ? vue.boutonA(souris.x, souris.y) : null;
  canvas.style.cursor =
    marqueurPris !== null || surMarqueur !== null ? 'ew-resize' : surRappel || bouton ? 'pointer' : '';
  // Aucune bulle pendant un glissé : elle suivrait le marqueur sans rien dire.
  canvas.title = surRappel
    ? t('Bring M1 and M2 back to their starting place')
    : surMarqueur !== null
      ? bulleMarqueur(surMarqueur)
      : bouton
        ? bulleBouton(bouton)
        : '';
  dessiner();
});
canvas.addEventListener('pointerleave', () => {
  souris = null;
  dessiner();
});

/**
 * Rayon d'aimantation d'un marqueur, en pixels : un front plus proche que cela
 * l'attire (Frank : « ils doivent avoir tendance à coller sur les fronts »).
 * Assez petit pour poser un marqueur entre deux fronts en zoomant un peu.
 */
const AIMANT_PX = 8;

/**
 * L'instant `t`, ou le front le plus proche s'il en tombe un à moins de
 * AIMANT_PX pixels, toutes voies affichées confondues. Les fronts sont ceux que
 * la vue dessine (échantillonnage et inversion compris) : le marqueur colle au
 * trait qu'on voit.
 */
function aimanter(t: number): number {
  const w = canvas.clientWidth;
  const rayon = Math.abs(vue.tDe(AIMANT_PX, fenetre, w) - vue.tDe(0, fenetre, w));
  let meilleur = t;
  let ecart = rayon;
  for (const vv of voiesVisibles()) {
    if (vv.probleme) continue;
    for (const f of capture.fenetre(vv.voie, t - rayon, t + rayon).fronts) {
      const d = Math.abs(f.t - t);
      if (d <= ecart) {
        ecart = d;
        meilleur = f.t;
      }
    }
  }
  return meilleur;
}

/**
 * Amène un marqueur sous la souris. Ramené dans la colonne des noms, il
 * retourne au garage : c'est ainsi qu'on l'ôte.
 */
function deplacerMarqueur(m: number, x: number): void {
  const w = canvas.clientWidth;
  if (x < DISPOSITION.MARGE_G) {
    marqueurs[m] = null;
    return;
  }
  marqueurs[m] = aimanter(vue.tDe(Math.min(x, w - DISPOSITION.MARGE_D), fenetre, w));
}

/** Fin de la prise d'un marqueur : il reste là où on l'a lâché. */
function lacherMarqueur(ev: PointerEvent): void {
  if (marqueurPris === null) return;
  marqueurPris = null;
  if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
  dessiner();
}
canvas.addEventListener('pointerup', lacherMarqueur);
canvas.addEventListener('lostpointercapture', lacherMarqueur);
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
// Un clic n'est pas un glissé : sous SEUIL_GLISSE px de déplacement, la vue ne
// bouge pas et le suivi de la fin tient. Sans ce seuil, un clic sur la trace
// (pour refermer un menu, par exemple) qui tremblait de 2 px figeait la vue.
const SEUIL_GLISSE = 3;
let glisse: { x: number; t0: number; parti: boolean } | null = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  glisse = { x: ev.clientX, t0: fenetre.t0, parti: false };
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  if (!glisse) return;
  if (!glisse.parti) {
    if (Math.abs(ev.clientX - glisse.x) < SEUIL_GLISSE) return;
    glisse.parti = true;
  }
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

// --- Exports : menu ☰ ----------------------------------------------------------
//
// Trois sorties (Frank, 26/09) : CSV enregistré, SVG copié, SVG enregistré.
// Toutes suivent la même mécanique : M1 au début de ce qu'on veut, M2 à la fin.
// Sans les deux marqueurs, le CSV emporte toute la mesure et le SVG la fenêtre
// affichée.

/** Largeur au-delà de laquelle un SVG n'est plus une image qu'on manie. */
const SVG_LARGEUR_MAX = 50000;
/** Tracé en deçà duquel un SVG ne montrerait plus rien de lisible. */
const SVG_TRACE_MIN = 40;
/**
 * Largeur de toile qu'on s'autorise pour le PNG de la copie : Chrome refuse
 * au-delà de 32 767 px de côté. Au-delà, la copie ne porte que le SVG.
 */
const PNG_LARGEUR_MAX = 32000;

function ouvrirMenuExport(): void {
  if (!menuExport || !btnMenuExport) return;
  fermerPanneau();
  menuExport.hidden = false;
  // Sous le bouton, en coordonnées de page, sans dépasser le bord droit.
  const r = btnMenuExport.getBoundingClientRect();
  const largeur = menuExport.offsetWidth;
  const x = r.left + window.scrollX;
  menuExport.style.left = `${Math.max(4, Math.min(x, window.scrollX + document.documentElement.clientWidth - largeur - 6))}px`;
  menuExport.style.top = `${r.bottom + window.scrollY + 4}px`;
  btnMenuExport.setAttribute('aria-expanded', 'true');
}

function fermerMenuExport(): void {
  if (!menuExport || menuExport.hidden) return;
  menuExport.hidden = true;
  btnMenuExport?.setAttribute('aria-expanded', 'false');
}

/** M1 et M2 posés tous deux, à deux instants distincts ; null sinon. */
function plageMarqueurs(): { t1: number; t2: number } | null {
  const [t1, t2] = [marqueurs[0] ?? null, marqueurs[1] ?? null];
  if (t1 === null || t2 === null || t1 === t2) return null;
  return { t1, t2 };
}

/**
 * CSV : la page n'emporte aucun front, c'est l'hôte qui détient la mesure
 * entière dans son journal de session (voir AnalyseurVersHote). Elle donne la
 * plage et les colonnes : chaque voie posée, sous le nom affiché et lue comme
 * à l'écran (inversée ou non) — le journal, lui, ne connaît que les broches.
 */
function exporterCsv(): void {
  const plage = plageMarqueurs();
  const voies = diagnostics
    .filter((d) => d.probleme === null)
    .map((d) => ({
      voie: d.voie,
      pin: d.pin,
      nom: nomVoie({ nom: d.nom, nomChoisi: reglagesVoies[d.voie]?.nom }),
      ...(capture.estInversee(d.voie) ? { inverse: true } : {}),
    }));
  vscode?.postMessage({ type: 'analyseurExport', ...(plage ? { plage } : {}), voies });
}

/**
 * SVG : dessiné ici, au zoom affiché — un pixel de l'image vaut le même temps
 * qu'un pixel de l'écran. La plage entre M1 et M2 peut donc donner une image
 * bien plus large que la fenêtre.
 */
function exporterSvg(action: 'copier' | 'enregistrer'): void {
  const voies = voiesVisibles();
  if (voies.length === 0 || !capture.aDesDonnees) {
    vscode?.postMessage({ type: 'analyseurSvg', action, svg: '', refus: 'vide' });
    return;
  }
  const p = plageMarqueurs();
  const f: Fenetre = p ? { t0: Math.min(p.t1, p.t2), duree: Math.abs(p.t2 - p.t1) } : { ...fenetre };
  const { MARGE_G, MARGE_D } = DISPOSITION;
  const pxParMs = (canvas.clientWidth - MARGE_G - MARGE_D) / fenetre.duree;
  const trace = f.duree * pxParMs;
  const largeur = MARGE_G + MARGE_D + trace;
  if (!(trace >= SVG_TRACE_MIN) || largeur > SVG_LARGEUR_MAX) {
    const refus = trace >= SVG_TRACE_MIN ? 'large' : 'etroit';
    vscode?.postMessage({ type: 'analyseurSvg', action, svg: '', refus, largeur: Math.round(refus === 'large' ? largeur : trace) });
    return;
  }
  const etat = {
    capture,
    voies,
    fenetre: f,
    annotations: annotationsEntre(f),
    souris: null,
    textes: textes(),
    lang: locale(),
    marqueurs,
    marqueurPris: null,
  };
  const svg = vue.svg(etat, largeur);
  if (action === 'copier' && copierEnImage(svg, pngDe(etat, largeur))) return;
  vscode?.postMessage({ type: 'analyseurSvg', action, svg });
}

/**
 * Le PNG de la copie, deux fois plus fin que l'écran quand la toile le permet ;
 * null si elle ne le permet pas (la copie ne portera que le SVG).
 */
function pngDe(etat: Parameters<AnalyseurVue['png']>[0], largeur: number): HTMLCanvasElement | null {
  if (largeur > PNG_LARGEUR_MAX) return null;
  return vue.png(etat, largeur, largeur * 2 <= PNG_LARGEUR_MAX ? 2 : 1);
}

/**
 * Copie en IMAGE, écrite par la page elle-même (Frank, 26/09 : « Copy SVG ->
 * dans Word j'ai le texte, dans Inkscape rien du tout »). `env.clipboard` de
 * VS Code ne sait écrire que du texte : Word collait le code, Inkscape ne
 * trouvait pas d'image. Le presse-papier du navigateur, lui, reçoit
 * `image/svg+xml` (format que lit Inkscape) et `image/png` (que Chrome dépose
 * aussi en bitmap, pour Word). Mesuré sous Windows : formats « image/svg+xml »,
 * « PNG », CF_DIB, CF_DIBV5 et CF_BITMAP.
 *
 * `write()` part DANS le clic, le PNG suivant en promesse : le navigateur
 * n'écrit que pendant un geste de l'utilisateur. Écriture refusée → l'hôte
 * copie le SVG en texte, comme avant. Faux si l'API manque (même repli).
 */
function copierEnImage(svg: string, toile: HTMLCanvasElement | null): boolean {
  const pp = navigator.clipboard as Clipboard | undefined;
  if (typeof ClipboardItem === 'undefined' || typeof pp?.write !== 'function') return false;
  const types: Record<string, Blob | Promise<Blob>> = {
    'image/svg+xml': new Blob([svg], { type: 'image/svg+xml' }),
  };
  if (toile) {
    types['image/png'] = new Promise<Blob>((ok, ko) =>
      toile.toBlob((b) => (b ? ok(b) : ko(new Error('PNG refusé'))), 'image/png')
    );
  }
  pp.write([new ClipboardItem(types)]).then(
    () => vscode?.postMessage({ type: 'analyseurSvg', action: 'copier', svg, copie: 'image' }),
    () => vscode?.postMessage({ type: 'analyseurSvg', action: 'copier', svg })
  );
  return true;
}

// --- Câblage de la barre -----------------------------------------------------

selHorloge.addEventListener('change', () => {
  echantillonnage = Number(selHorloge.value) || 0;
  majEchantillonnage();
  dessiner();
  envoyerReglages();
});
selProfondeur?.addEventListener('change', () => {
  profondeur = profondeurValide(Number(selProfondeur.value));
  if (enCours) {
    // Pleine, la capture repart : la vue suit la nouvelle acquisition.
    if (capture.pleine) suivi = true;
    capture.reglerProfondeur(profondeur);
  }
  dessiner();
  envoyerReglages();
});
btnRelancer?.addEventListener('click', () => {
  if (!enCours) return;
  capture.relancer();
  // La vue suit la fin jusqu'au front de déclenchement, qui la posera sur lui.
  suivi = true;
  suivreFin();
  dessiner();
});
document.getElementById('trame-prec')?.addEventListener('click', () => sauterTrame(-1));
document.getElementById('gauche')?.addEventListener('click', () => defiler(-1));
document.getElementById('droite')?.addEventListener('click', () => defiler(1));
document.getElementById('trame-suiv')?.addEventListener('click', () => sauterTrame(1));
document.getElementById('tout')?.addEventListener('click', ajuster);
document.getElementById('suivre')?.addEventListener('click', suivreFinDemande);
btnReafficher?.addEventListener('click', () => {
  for (const r of Object.values(reglagesVoies)) if (r) r.masquee = false;
  dessiner();
  envoyerReglages();
});
btnMenuExport?.addEventListener('click', () => {
  if (menuExport && !menuExport.hidden) fermerMenuExport();
  else ouvrirMenuExport();
});
menuExport?.addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-export]');
  if (!b) return;
  fermerMenuExport();
  const quoi = b.dataset.export;
  if (quoi === 'csv') exporterCsv();
  else if (quoi === 'copier-svg') exporterSvg('copier');
  else if (quoi === 'svg') exporterSvg('enregistrer');
});
window.addEventListener('resize', () => dessiner());
// Retour au premier plan : la fenêtre a pu changer de largeur pendant que
// l'onglet était caché, et un canvas mesuré à ce moment-là l'aurait été sur une
// disposition périmée. Un rendu de plus ne coûte rien, une vue fausse si.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) dessiner();
});
/**
 * Le canvas a CHANGÉ DE LARGEUR : on repeint.
 *
 * C'est ce qui reste de la page grise après le filet du lot .98. Un onglet de
 * webview VS Code ouvert en second plan n'est pas « caché » au sens du
 * navigateur — `document.hidden` reste faux — mais sa page est large de ZÉRO
 * pixel. Le rendu a donc bien lieu, et `vue.dessiner()` en ressort aussitôt sur
 * son garde `w === 0`. Quand l'élève clique enfin sur l'onglet, la page reprend
 * sa largeur sans qu'aucun `resize` de fenêtre ni aucun `visibilitychange` ne
 * soit émis : plus rien ne redemandait de rendu, et le canvas restait vierge
 * alors que la légende et la hauteur des pistes, elles, étaient bien en place.
 * C'est exactement l'image que Frank signale.
 *
 * On ne réagit qu'à la LARGEUR : la hauteur, c'est `rendu()` lui-même qui la
 * pose (une piste par voie), et s'en servir ferait repeindre la vue en réponse
 * à son propre dessin.
 */
let largeurVue = canvas.clientWidth;
new ResizeObserver(() => {
  if (canvas.clientWidth === largeurVue) return;
  largeurVue = canvas.clientWidth;
  dessiner();
}).observe(canvas);
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
