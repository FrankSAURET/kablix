// Rendu de l'analyseur logique : les créneaux des voies sur une échelle de
// temps commune, avec zoom, défilement, réticule et annotations de décodage.
//
// CE QUE CE MODULE N'EST PAS. Ce n'est pas le traceur de courbes (plotter.mts) :
// le traceur trace des VALEURS sur un axe Y continu, l'analyseur trace des
// FRONTS — deux niveaux, un axe Y qui n'a pas d'unité. Les conventions sont en
// revanche reprises du traceur pour que les deux instruments se ressemblent :
// palette de voies partagée (voies-couleurs.mts), pas de graduation « rond »
// (1-2-5 × 10ⁿ), réticule suivant la souris, thème clair/sombre lu sur le body.
//
// L'ÉCHELLE DE TEMPS. Toute la vue travaille en MILLISECONDES SIMULÉES, comme
// la capture. À fort zoom on descend sous la microseconde : l'affichage des
// graduations choisit donc son unité (s, ms, µs, ns) d'après le pas.
//
// LE RENDU EST À PAS CONSTANT EN PIXELS. Une voie peut porter 60 000 fronts ;
// dessiner un segment par front à faible zoom coûterait 60 000 opérations pour
// noircir 800 pixels. On regroupe donc les fronts par colonne de pixel : une
// colonne qui contient plusieurs fronts se dessine en BLOC plein (c'est ce que
// fait un analyseur réel — la zone « ça commute plus vite que l'écran »).

import { couleurVoie, themeSombre } from './voies-couleurs.mjs';
import type { AnalyseurCapture, SensDeclenchement } from './analyseur-capture.mjs';
import type { Annotation } from './analyseur-decodage.mjs';
import { ContexteSvg } from './contexte-svg.mjs';

/** Hauteur d'une piste de voie, en pixels CSS. */
const PISTE_H = 46;
/** Hauteur du créneau dans sa piste (le reste est la marge). */
const CRENEAU_H = 22;
/** Bande réservée aux annotations de décodage sous chaque piste. */
const ANNOT_H = 18;
/**
 * Corps des annotations de décodage, en gras. 9 px maigres se lisaient mal sous
 * les créneaux (Frank, 24/09) ; la bande est haussée d'autant.
 */
const ANNOT_PX = 11;
/** Largeur sous laquelle un bit de l'affichage binaire n'est plus dessiné. */
const BIT_MIN_PX = 3;

/**
 * Couleurs du niveau lu au réticule : 0 en rouge, 1 en vert (Frank, 24/09). Le
 * vert est celui des start de décodage, dans les deux thèmes (Frank, 25/09).
 */
const NIVEAU_COULEUR = {
  clair: { 0: '#d1242f', 1: '#1BAF7A' },
  sombre: { 0: '#f85149', 1: '#1BAF7A' },
} as const;
/** Largeur de la colonne des noms de voie. */
const MARGE_G = 104;
/** Marge droite (respiration + place pour la dernière graduation). */
const MARGE_D = 12;
/** Hauteur des graduations, tout en haut. */
const GRAD_H = 22;
/**
 * Bande des marqueurs M1/M2, sous les graduations. Les drapeaux y vivent, garés
 * à gauche ou posés sur leur instant, et la flèche qui mesure leur écart aussi :
 * écrits sur les graduations, ils les auraient masquées.
 */
const BANDE_M = 20;
/** Hauteur de la barre de temps entière : graduations et marqueurs. */
const REGLE_H = GRAD_H + BANDE_M;

/**
 * Couleurs des marqueurs : M1 bleu, M2 orangé (Frank, 25/09). Une variante par
 * thème, pour que le trait se lise aussi bien sur fond clair que sombre.
 */
const MARQUEUR_COULEUR = {
  clair: ['#0969da', '#d4731a'],
  sombre: ['#4493f8', '#f0883e'],
} as const;
/** Noms des marqueurs, jamais traduits (ce sont des repères, comme sur un oscilloscope). */
const NOMS_MARQUEUR = ['M1', 'M2'] as const;
/** Largeur d'un drapeau de marqueur. */
const DRAPEAU_W = 24;
/** Hauteur d'un drapeau de marqueur. */
const DRAPEAU_H = 14;
/**
 * Largeur du bouton de rappel, tout à gauche de la bande des marqueurs (Frank,
 * 26/09) : en zoomant, un marqueur posé sort de la vue et on ne le retrouve
 * plus ; un clic ramène les deux au garage.
 */
const RAPPEL_W = 18;
/** Abscisse du centre d'un marqueur garé, dans la colonne de gauche, après le bouton de rappel. */
const xGare = (m: number): number => COL_X + RAPPEL_W + 6 + DRAPEAU_W / 2 + m * (DRAPEAU_W + 6);

/**
 * Corps du nom de voie, en pixels. Deux fois et demie la graduation : le nom
 * est ce qu'on cherche des yeux en passant d'une piste à l'autre, et à 10 px il
 * se confondait avec les étiquettes de décodage (demande de Frank).
 */
const NOM_PX = 15;

/** Côté d'un bouton de la colonne de gauche (T, P, pastille de teinte). */
const BOUTON = 18;
/** Écart entre deux boutons de la colonne. */
const BOUTON_GAP = 4;
/** Marge gauche avant le nom et la rangée de boutons. */
const COL_X = 8;

/**
 * Rangée de boutons d'une voie, dans sa piste. Le nom occupe le haut, les
 * boutons le bas : chaque voie porte DONC son propre déclenchement et son
 * propre protocole, au lieu d'une barre unique en haut qui obligeait à choisir
 * de quelle voie on parlait avant de pouvoir régler quoi que ce soit.
 */
export type BoutonVoie = 'teinte' | 'declenchement' | 'protocole';

/** Où tombe chaque bouton d'une voie, dans le repère du canvas. */
export interface ZoneBouton {
  voie: number;
  quoi: BoutonVoie;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ce qu'une voie non traçable doit expliquer, tel que le modèle le classe. */
export type ProblemeVoie = 'nowhere' | 'not-mcu' | 'power';

/** Une voie telle que la vue la reçoit (capture + diagnostic de câblage). */
export interface VoieVue {
  voie: number;
  nom: string;
  pin: string;
  /** null = la voie est traçable. */
  probleme: ProblemeVoie | null;
  /** Vrai si la broche porte aussi un convertisseur analogique (A0…, GP26…). */
  analogique: boolean;
  /**
   * Vrai si la pince n'est pas posée sur la carte et que la broche a été
   * trouvée en suivant le fil. La légende le dit : sans cela, l'élève qui a
   * pincé la borne d'un module lirait un nom de broche sans comprendre d'où
   * il sort.
   */
  suivi?: boolean;
  /**
   * Nom choisi par l'élève, qui remplace `nom` à l'affichage. Le nom
   * automatique reste dans `nom` : on y revient en vidant celui-ci.
   */
  nomChoisi?: string;
  /**
   * Sens de déclenchement RÉGLÉ SUR CETTE VOIE, ou null si elle ne déclenche
   * pas. Le bouton de la colonne montre alors une marche montante ou
   * descendante à la place de son « T », ou « SC » pour un START code DMX.
   */
  declenchement?: SensDeclenchement | null;
  /**
   * Nom court du protocole décodé sur cette voie (« I²C », « DMX »…), ou null.
   * Le bouton « P » l'affiche à sa place quand un décodage est posé.
   */
  protocole?: string | null;
  /**
   * Lignes de la bande de décodage sous la piste (1 par défaut, 2 pour un DHT
   * qui écrit ses valeurs sous ses octets). La piste grandit d'autant.
   */
  lignesDecodage?: number;
  /**
   * Vrai si la pince est derrière un reflet inversant (patte `-` d'une paire
   * DMX) : la voie est tracée à l'envers de la broche qu'elle écoute.
   */
  inverse?: boolean;
  /**
   * Tension du niveau haut, en volts (celle de la carte : 3,3 ou 5). Écrite
   * dans la marge de la piste, face au niveau haut, avec `voltsBas` (0 V par
   * défaut) face au bas. Derrière une carte d'interface : sa tension haute.
   * Absente (capture relue sans schéma) : rien d'écrit.
   */
  volts?: number;
  /**
   * Tension du niveau bas, en volts, quand ce n'est pas 0 V : la pince est
   * derrière l'émetteur d'une carte d'interface (paire DMX, 1,1 V).
   */
  voltsBas?: number;
}

/** Lignes de décodage réservées sous une piste. */
const lignesDe = (vv: VoieVue): number => Math.max(1, vv.lignesDecodage ?? 1);

/** Hauteur d'une piste, bande de décodage comprise. */
const hauteurPiste = (vv: VoieVue): number => PISTE_H + ANNOT_H * lignesDe(vv);

/**
 * Haut de chaque piste, dans l'ordre d'affichage. Les pistes n'ont plus toutes
 * la même hauteur depuis qu'un décodage peut écrire sur deux lignes : tout ce
 * qui place une piste passe par ici.
 */
function hautsPistes(voies: VoieVue[]): number[] {
  let y = REGLE_H;
  return voies.map((vv) => {
    const haut = y;
    y += hauteurPiste(vv);
    return haut;
  });
}

/** État du zoom / défilement, conservé entre deux rendus. */
export interface Fenetre {
  /** Bord gauche, en ms simulées. */
  t0: number;
  /** Largeur de la fenêtre, en ms simulées. */
  duree: number;
}

/** Textes de l'interface, passés par l'appelant (la vue ne traduit rien). */
export interface TextesVue {
  /** Aucune sonde posée sur le schéma. */
  aucuneSonde: string;
  /** Sondes posées mais aucun front capturé. */
  aucuneDonnee: string;
  /** Voie dont la pastille n'est sur aucune broche. */
  nowhere: string;
  /** Voie posée sur une broche qui n'est pas une entrée/sortie logique. */
  notMcu: string;
  /** Voie posée sur une alimentation (VCC / GND) : aucun front à montrer. */
  power: string;
  /** Note sur une broche à convertisseur analogique. */
  analogique: string;
  /** Déclenchement réglé, pas encore survenu. */
  enAttente: string;
}

/**
 * Teinte d'une voie : celle de sa pince sur la planche, toujours. C'est le lien
 * visuel entre la courbe et la sonde ; le choix d'une autre teinte a été retiré
 * (Frank, 23/09 : « ne sert à rien »).
 */
export function teinteVoie(vv: VoieVue, sombre: boolean): string {
  return couleurVoie(vv.voie, sombre);
}

/** Nom effectif d'une voie : celui qu'on lui a donné, sinon l'automatique. */
export function nomVoie(vv: VoieVue): string {
  const n = (vv.nomChoisi ?? '').trim();
  return n === '' ? vv.nom : n;
}

/** Corps des tensions écrites dans la marge des pistes. */
const TENSION_PX = 10;

/**
 * Tension d'un niveau, pour la marge d'une piste : un chiffre après la
 * virgule, omis quand il est nul (« 3,3 V », « 5 V », « 0 V »).
 */
export function formatTension(volts: number, lang = 'en'): string {
  return `${(Math.round(volts * 10) / 10).toLocaleString(lang, { maximumFractionDigits: 1 })} V`;
}

/** Formatage d'une durée en ms simulées, unité choisie d'après l'ordre. */
export function formatTemps(ms: number, lang = 'en'): string {
  const abs = Math.abs(ms);
  const rendu = (v: number, u: string, d: number): string =>
    `${v.toLocaleString(lang, { maximumFractionDigits: d })} ${u}`;
  if (abs === 0) return rendu(0, 'ms', 0);
  if (abs >= 1000) return rendu(ms / 1000, 's', 3);
  if (abs >= 1) return rendu(ms, 'ms', 3);
  if (abs >= 0.001) return rendu(ms * 1000, 'µs', 3);
  return rendu(ms * 1e6, 'ns', 1);
}

/** Pas de graduation « rond » (1-2-5 × 10ⁿ), comme dans le traceur. */
export function pasRond(brut: number): number {
  if (!(brut > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(brut)));
  const norm = brut / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/** Instant du réticule écrit en haut : texte, ancrage et bords de sa plaque. */
interface BoiteInstant {
  texte: string;
  /** Abscisse d'ancrage du texte (aligné à droite si `droite`). */
  x: number;
  droite: boolean;
  /** Bords gauche et droit de la plaque, marge comprise. */
  g: number;
  d: number;
}

/** Zone de prise d'un marqueur : son drapeau, ou son trait une fois posé. */
interface ZoneMarqueur {
  m: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ce que l'appelant fournit à chaque rendu. */
export interface EtatRendu {
  capture: AnalyseurCapture;
  /** Voies à afficher, y compris celles en défaut (dans l'ordre des couleurs). */
  voies: VoieVue[];
  fenetre: Fenetre;
  /** Annotations de décodage, ou liste vide. */
  annotations: Annotation[];
  /** Position du réticule en pixels CSS, ou null (souris hors du canvas). */
  souris: { x: number; y: number } | null;
  textes: TextesVue;
  lang: string;
  /**
   * Instants de M1 et M2, en ms simulées ; null = garé à gauche de la barre de
   * temps. Absent = les deux garés.
   */
  marqueurs?: ReadonlyArray<number | null>;
  /** Marqueur tenu à la souris : dessiné par-dessus l'autre. */
  marqueurPris?: number | null;
  /**
   * Rendu pour l'export SVG : sans ce qui ne sert qu'à la souris (boutons de
   * voie, bouton de rappel, marqueurs garés ou hors de vue, réticule).
   */
  export?: boolean;
}

export class AnalyseurVue {
  /**
   * Zones cliquables de la colonne de gauche, refaites à chaque rendu. La page
   * les relit pour savoir sur quel bouton un clic est tombé : les boutons sont
   * DESSINÉS (ils doivent suivre exactement la piste de leur voie, qui bouge
   * dès qu'on masque une voie), pas posés en HTML par-dessus.
   */
  private zones: ZoneBouton[] = [];
  /** Zones de prise des marqueurs, dans l'ordre du dessin (le dernier est dessus). */
  private zonesMarqueurs: ZoneMarqueur[] = [];
  /** Bouton de rappel des marqueurs ; null quand les deux sont déjà garés. */
  private zoneRappel: Omit<ZoneMarqueur, 'm'> | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  /** Vrai si le point tombe sur le bouton de rappel des marqueurs, et qu'il sert. */
  rappelA(x: number, y: number): boolean {
    const z = this.zoneRappel;
    return !!z && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  }

  /**
   * Marqueur sous un point (0 = M1, 1 = M2), ou null. Le drapeau se prend
   * partout ; un marqueur posé se prend aussi par son trait, à quelques pixels
   * près — viser un trait d'un pixel à la souris serait une punition.
   */
  marqueurA(x: number, y: number): number | null {
    for (let k = this.zonesMarqueurs.length - 1; k >= 0; k--) {
      const z = this.zonesMarqueurs[k]!;
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z.m;
    }
    return null;
  }

  /** Bouton de la colonne de gauche sous un point, ou null. */
  boutonA(x: number, y: number): ZoneBouton | null {
    return (
      this.zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) ?? null
    );
  }

  /**
   * Zone d'un bouton précis, telle que le dernier rendu l'a posée.
   *
   * Sert à rouvrir un panneau au même endroit après un changement de réglage
   * qui en modifie le contenu (changer de bus ajoute ou retire des rôles).
   */
  zoneDe(voie: number, quoi: BoutonVoie): ZoneBouton | null {
    return this.zones.find((z) => z.voie === voie && z.quoi === quoi) ?? null;
  }

  /**
   * Hauteur totale nécessaire (l'appelant dimensionne le canvas) : pour n voies
   * d'une ligne de décodage chacune, ou pour ces voies-là, lignes comprises.
   */
  hauteurPour(voies: number | VoieVue[]): number {
    if (typeof voies === 'number' || voies.length === 0) {
      return REGLE_H + Math.max(1, typeof voies === 'number' ? voies : 0) * (PISTE_H + ANNOT_H) + 8;
    }
    return REGLE_H + voies.reduce((s, vv) => s + hauteurPiste(vv), 0) + 8;
  }

  /** Convertit un temps (ms) en x (pixels CSS). */
  xDe(t: number, f: Fenetre, largeur: number): number {
    const plot = largeur - MARGE_G - MARGE_D;
    return MARGE_G + ((t - f.t0) / f.duree) * plot;
  }

  /** Convertit un x (pixels CSS) en temps (ms). */
  tDe(x: number, f: Fenetre, largeur: number): number {
    const plot = largeur - MARGE_G - MARGE_D;
    return f.t0 + ((x - MARGE_G) / plot) * f.duree;
  }

  /** Indice de piste sous une ordonnée, ou -1 hors des pistes. */
  pisteA(y: number, voies: number | VoieVue[]): number {
    if (typeof voies === 'number') {
      const i = Math.floor((y - REGLE_H) / (PISTE_H + ANNOT_H));
      return i >= 0 && i < voies ? i : -1;
    }
    const hauts = hautsPistes(voies);
    return hauts.findIndex((h, i) => y >= h && y < h + hauteurPiste(voies[i]!));
  }

  dessiner(e: EtatRendu): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.zones = [];
    this.zonesMarqueurs = [];
    this.zoneRappel = null;
    this.peindre(ctx, e, w, h);
  }

  /**
   * Les courbes en SVG, pour les exports du menu ☰ : le MÊME dessin que
   * l'écran, peint dans un contexte qui écrit du SVG (contexte-svg.mts), moins
   * ce qui ne sert qu'à la souris. `largeur` fixe l'échelle des temps :
   * l'appelant la tire du zoom affiché.
   */
  svg(e: EtatRendu, largeur: number): string {
    const h = this.hauteurPour(e.voies);
    const ctx = new ContexteSvg(largeur, h);
    // Fond plein : les textes clairs du thème sombre disparaîtraient sur la
    // page blanche où l'on colle l'image.
    ctx.fillStyle = fondPage(themeSombre());
    ctx.fillRect(0, 0, largeur, h);
    // Le contexte SVG couvre tout ce dont la vue se sert, pas l'interface entière.
    this.peindre(ctx as unknown as CanvasRenderingContext2D, { ...e, souris: null, export: true }, largeur, h);
    return ctx.texte();
  }

  /** Tout le dessin, dans un contexte déjà prêt (canvas de l'écran ou SVG d'export). */
  private peindre(ctx: CanvasRenderingContext2D, e: EtatRendu, w: number, h: number): void {
    const sombre = themeSombre();
    const style = getComputedStyle(document.body);
    const fg = style.getPropertyValue('--vscode-foreground').trim() || (sombre ? '#ccc' : '#333');
    const faible = sombre ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
    const police = style.getPropertyValue('--vscode-editor-font-family').trim() || 'monospace';
    ctx.font = `10px ${police}`;
    ctx.textBaseline = 'middle';

    if (e.voies.length === 0) {
      this.message(ctx, w, h, fg, e.textes.aucuneSonde);
      return;
    }

    const plot = w - MARGE_G - MARGE_D;
    if (plot <= 10) return;

    const instant = e.souris ? this.boiteInstant(ctx, e, w) : null;
    this.regle(ctx, e, w, fg, faible, police, instant);

    const hauts = hautsPistes(e.voies);
    for (let i = 0; i < e.voies.length; i++) {
      this.piste(ctx, e, e.voies[i]!, hauts[i]!, w, fg, faible, sombre);
    }

    if (!e.capture.aDesDonnees) {
      const msg = e.capture.enAttente ? e.textes.enAttente : e.textes.aucuneDonnee;
      ctx.save();
      ctx.globalAlpha = 0.75;
      this.message(ctx, w, h, fg, msg);
      ctx.restore();
    }

    this.annotations(ctx, e, w, fg, sombre);
    this.declenchement(ctx, e, w, h);
    this.marqueurs(ctx, e, w, h, fg, sombre, police);
    if (e.souris) this.reticule(ctx, e, w, h, fg, sombre, instant);
  }

  /**
   * Où s'écrit l'instant du réticule : à droite de la souris dans la moitié
   * gauche, à gauche dans la moitié droite. Calculé AVANT la règle, qui s'en
   * sert pour taire les graduations qu'il recouvre.
   */
  private boiteInstant(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    w: number
  ): BoiteInstant | null {
    const s = e.souris!;
    if (s.x < MARGE_G || s.x > w - MARGE_D) return null;
    const t = this.tDe(s.x, e.fenetre, w);
    const texte = formatTemps(t - (e.capture.tTrigger ?? 0), e.lang);
    const droite = s.x > w / 2;
    const x = s.x + (droite ? -4 : 4);
    const largeur = ctx.measureText(texte).width;
    const g = droite ? x - largeur : x;
    return { texte, x, droite, g: g - 3, d: g + largeur + 3 };
  }

  /**
   * Message centré (aucune sonde, aucune donnée, attente de déclenchement).
   * Coupé en lignes quand la fenêtre est trop étroite (Frank, 24/09) : sur une
   * seule ligne, les deux bouts sortaient du canvas.
   */
  private message(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    fg: string,
    texte: string
  ): void {
    ctx.save();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.7;
    const lignes = couperLignes(ctx, texte, w - 32);
    const pas = 14;
    const y0 = h / 2 - ((lignes.length - 1) * pas) / 2;
    lignes.forEach((l, k) => ctx.fillText(l, w / 2, y0 + k * pas));
    ctx.restore();
  }

  /** Règle de temps en haut, avec des graduations rondes. */
  private regle(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    w: number,
    fg: string,
    faible: string,
    police: string,
    instant: BoiteInstant | null
  ): void {
    const plot = w - MARGE_G - MARGE_D;
    // Une graduation tous les ~90 px : au-delà l'axe devient illisible, en
    // dessous les étiquettes se chevauchent (elles portent une unité).
    const pas = pasRond((e.fenetre.duree * 90) / plot);
    const origine = e.capture.tTrigger ?? 0;
    const premier = Math.ceil((e.fenetre.t0 - origine) / pas) * pas + origine;
    ctx.save();
    ctx.strokeStyle = faible;
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.85;
    ctx.font = `10px ${police}`;
    ctx.textAlign = 'center';
    for (let t = premier; t <= e.fenetre.t0 + e.fenetre.duree; t += pas) {
      const x = this.xDe(t, e.fenetre, w);
      if (x < MARGE_G - 1) continue;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, GRAD_H - 5);
      ctx.lineTo(Math.round(x) + 0.5, GRAD_H);
      ctx.stroke();
      // Graduation sous l'instant du réticule : on la tait. La plaque seule en
      // laissait dépasser un bout (« 16,194 mss »).
      const libelle = formatTemps(t - origine, e.lang);
      const demi = ctx.measureText(libelle).width / 2;
      if (instant && x - demi < instant.d && x + demi > instant.g) continue;
      ctx.fillText(libelle, x, GRAD_H / 2 - 2);
    }
    // Trait de base des graduations, puis bas de la bande des marqueurs.
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(MARGE_G, GRAD_H - 0.5);
    ctx.lineTo(w - MARGE_D, GRAD_H - 0.5);
    ctx.moveTo(MARGE_G, REGLE_H - 0.5);
    ctx.lineTo(w - MARGE_D, REGLE_H - 0.5);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Une piste : le nom à gauche, le créneau à droite. Une voie en défaut ne
   * dessine aucun créneau mais écrit POURQUOI — c'est la consigne : ne rien
   * montrer, en expliquant.
   */
  private piste(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    vv: VoieVue,
    haut: number,
    w: number,
    fg: string,
    faible: string,
    sombre: boolean
  ): void {
    const couleur = teinteVoie(vv, sombre);
    const yBas = haut + (PISTE_H + CRENEAU_H) / 2;
    const yHaut = haut + (PISTE_H - CRENEAU_H) / 2;

    // Nom en haut de la piste, dans la couleur de la pince : c'est le lien
    // visuel avec le schéma. Deux fois et demie la graduation — c'est ce qu'on
    // cherche des yeux en descendant d'une voie à l'autre.
    // Tensions des deux niveaux, dans la marge, face aux traits haut et bas du
    // créneau (Frank, 25/09) : un chiffre après la virgule, sauf s'il est nul
    // (« 3,3 V », « 5 V », « 0 V »). Rien pour une voie en défaut, ni pour une
    // capture relue sans schéma : la carte, donc la tension, n'est pas connue.
    const volts = !vv.probleme && vv.volts ? vv.volts : 0;
    const police = getComputedStyle(document.body).getPropertyValue('--vscode-font-family').trim() || 'sans-serif';
    let placeTension = 0;
    if (volts > 0) {
      ctx.save();
      ctx.font = `${TENSION_PX}px ${police}`;
      const haut1 = formatTension(volts, e.lang);
      const bas0 = formatTension(vv.voltsBas ?? 0, e.lang);
      placeTension = Math.max(ctx.measureText(haut1).width, ctx.measureText(bas0).width) + 4;
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.6;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      // Une voie inversée par son câblage garde ses tensions : c'est le trait
      // qui change de niveau, pas la carte.
      ctx.fillText(haut1, MARGE_G - 4, yHaut);
      ctx.fillText(bas0, MARGE_G - 4, yBas);
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = couleur;
    ctx.textAlign = 'left';
    ctx.font = `600 ${NOM_PX}px ${police}`;
    ctx.fillText(
      this.tronquer(ctx, nomVoie(vv), MARGE_G - COL_X - 6 - placeTension),
      COL_X,
      haut + NOM_PX / 2 + 3
    );
    ctx.restore();

    // Rangée de boutons SOUS le nom : teinte, déclenchement, protocole. Chaque
    // voie porte ainsi ses propres réglages, au lieu d'une barre unique en haut
    // qui forçait à désigner la voie avant de pouvoir régler quoi que ce soit.
    // Une voie en défaut ne garde que sa pastille de réglages : ni déclencher
    // ni décoder n'a de sens sur une pince qui n'écoute rien.
    if (!e.export) this.boutonsVoie(ctx, vv, haut, couleur, fg, sombre, vv.probleme === null);

    // Séparateur de piste.
    ctx.save();
    ctx.strokeStyle = faible;
    ctx.beginPath();
    ctx.moveTo(MARGE_G, haut + hauteurPiste(vv) - 0.5);
    ctx.lineTo(w - MARGE_D, haut + hauteurPiste(vv) - 0.5);
    ctx.stroke();
    ctx.restore();

    if (vv.probleme) {
      ctx.save();
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.65;
      ctx.textAlign = 'left';
      const t =
        vv.probleme === 'nowhere'
          ? e.textes.nowhere
          : vv.probleme === 'power'
            ? e.textes.power
            : e.textes.notMcu;
      // Sur plusieurs lignes si la piste est trop étroite (trois au plus : la
      // piste n'en loge pas davantage), la dernière coupée d'un « … ».
      const largeur = w - MARGE_D - MARGE_G - 16;
      let lignes = couperLignes(ctx, t, largeur);
      if (lignes.length > 3) {
        lignes = [...lignes.slice(0, 2), this.tronquer(ctx, lignes.slice(2).join(' '), largeur)];
      }
      const pas = 13;
      const y0 = haut + PISTE_H / 2 - ((lignes.length - 1) * pas) / 2;
      lignes.forEach((l, k) => ctx.fillText(l, MARGE_G + 8, y0 + k * pas));
      ctx.restore();
      return;
    }

    this.creneau(ctx, e, vv, yHaut, yBas, w, couleur);

    if (vv.analogique) {
      // Une broche A0…/GP26… est lisible en numérique (digitalRead) : on la
      // trace, mais on rappelle qu'un analyseur logique ne voit que 0 et 1.
      ctx.save();
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.55;
      ctx.textAlign = 'right';
      ctx.fillText(e.textes.analogique, w - MARGE_D - 2, haut + 8);
      ctx.restore();
    }
  }

  /**
   * Les trois boutons d'une voie, sous son nom : teinte (réglages), « T »
   * (déclenchement) et « P » (protocole).
   *
   * Un bouton RÉGLÉ ne dit plus sa lettre mais son état : le « T » devient une
   * marche montante ou descendante, le « P » prend le nom court du protocole.
   * L'élève voit donc d'un coup d'œil, sans rien déplier, quelle voie déclenche
   * et laquelle est décodée — c'est ce que la barre du haut ne savait pas
   * montrer, puisqu'elle ne parlait que d'une voie à la fois.
   */
  private boutonsVoie(
    ctx: CanvasRenderingContext2D,
    vv: VoieVue,
    haut: number,
    couleur: string,
    fg: string,
    sombre: boolean,
    tracable: boolean
  ): void {
    const y = haut + NOM_PX + 8;
    const bord = sombre ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)';
    const fond = sombre ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)';
    let x = COL_X;

    const cadre = (actif: boolean): void => {
      ctx.beginPath();
      ctx.roundRect(x + 0.5, y + 0.5, BOUTON - 1, BOUTON - 1, 3);
      ctx.fillStyle = actif ? couleur : fond;
      ctx.fill();
      // Un bouton réglé est ÉPAIS : Frank demande qu'on le voie bien, et
      // l'épaisseur du trait est ce qui se lit à distance sur un fond chargé.
      ctx.lineWidth = actif ? 2 : 1.4;
      ctx.strokeStyle = actif ? couleur : bord;
      ctx.stroke();
    };
    const zone = (quoi: BoutonVoie): void => {
      this.zones.push({ voie: vv.voie, quoi, x, y, w: BOUTON, h: BOUTON });
      x += BOUTON + BOUTON_GAP;
    };

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Pastille de teinte : c'est elle qui ouvre les réglages de la voie (nom,
    // couleur, sens au repos, masquage, vitesse) — le rôle qu'avait la puce de
    // l'ancienne légende, gardé au même endroit visuel.
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, BOUTON - 1, BOUTON - 1, 3);
    ctx.fillStyle = couleur;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = bord;
    ctx.stroke();
    zone('teinte');
    if (!tracable) {
      ctx.restore();
      return;
    }

    // Déclenchement : « T » au repos, la marche réelle une fois réglé, « SC »
    // sur un START code DMX (écrit petit, comme le nom d'un protocole).
    const decl = vv.declenchement ?? null;
    cadre(decl !== null);
    if (decl === null) {
      ctx.fillStyle = fg;
      ctx.font = `bold 12px ${getComputedStyle(document.body).getPropertyValue('--vscode-font-family').trim() || 'sans-serif'}`;
      ctx.fillText('T', x + BOUTON / 2, y + BOUTON / 2 + 0.5);
    } else if (decl === 'dmxStart') {
      ctx.fillStyle = sombre ? '#111' : '#fff';
      ctx.font = `bold 8px ${getComputedStyle(document.body).getPropertyValue('--vscode-font-family').trim() || 'sans-serif'}`;
      ctx.fillText('SC', x + BOUTON / 2, y + BOUTON / 2 + 0.5);
    } else if (decl === 'trame') {
      // Début de trame : un trait, puis le bloc de la trame qu'il ouvre — le
      // même dessin que l'entrée du menu, sans mot à traduire.
      const encre = sombre ? '#111' : '#fff';
      ctx.fillStyle = encre;
      ctx.fillRect(x + 4, y + 4, 1.6, BOUTON - 8);
      ctx.fillRect(x + 7, y + BOUTON / 2 - 3, BOUTON - 11, 6);
    } else {
      this.marche(ctx, x, y, decl, sombre ? '#111' : '#fff');
    }
    zone('declenchement');

    // Protocole : « P » au repos, le nom court du bus une fois décodé.
    const proto = vv.protocole ?? null;
    cadre(proto !== null);
    ctx.fillStyle = proto === null ? fg : sombre ? '#111' : '#fff';
    if (proto === null) {
      ctx.font = `bold 12px ${getComputedStyle(document.body).getPropertyValue('--vscode-font-family').trim() || 'sans-serif'}`;
      ctx.fillText('P', x + BOUTON / 2, y + BOUTON / 2 + 0.5);
    } else {
      // Le nom du bus est plus long que le bouton : on l'écrit petit et
      // resserré plutôt que tronqué — « I²C » et « DMX » restent lisibles.
      ctx.font = `bold 8px ${getComputedStyle(document.body).getPropertyValue('--vscode-font-family').trim() || 'sans-serif'}`;
      ctx.fillText(proto.slice(0, 4), x + BOUTON / 2, y + BOUTON / 2 + 0.5);
    }
    zone('protocole');

    ctx.restore();
  }

  /** Marche montante ou descendante dessinée dans un bouton de déclenchement. */
  private marche(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    sens: 'rising' | 'falling',
    trait: string
  ): void {
    const g = x + 4;
    const d = x + BOUTON - 4;
    const m = x + BOUTON / 2;
    const bas = y + BOUTON - 5;
    const ht = y + 5;
    ctx.save();
    ctx.strokeStyle = trait;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    ctx.beginPath();
    if (sens === 'rising') {
      ctx.moveTo(g, bas);
      ctx.lineTo(m, bas);
      ctx.lineTo(m, ht);
      ctx.lineTo(d, ht);
    } else {
      ctx.moveTo(g, ht);
      ctx.lineTo(m, ht);
      ctx.lineTo(m, bas);
      ctx.lineTo(d, bas);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Le créneau d'une voie. Les fronts sont regroupés PAR COLONNE DE PIXEL : une
   * colonne qui en contient plusieurs se remplit d'un bloc translucide (« ça
   * commute plus vite que l'écran »), les autres se dessinent en marches.
   */
  private creneau(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    vv: VoieVue,
    yHaut: number,
    yBas: number,
    w: number,
    couleur: string
  ): void {
    const f = e.fenetre;
    const { entrant, fronts, connuDepuis } = e.capture.fenetre(vv.voie, f.t0, f.t0 + f.duree);
    ctx.save();
    ctx.strokeStyle = couleur;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'miter';

    // Niveau inconnu : trait pointillé à mi-hauteur. Le dire bas mentirait — la
    // broche est peut-être haute. Deux cas : jamais observé, ou tombé dans la
    // partie de la capture que le plafond a jetée.
    const inconnu = (x0: number, x1: number): void => {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, (yHaut + yBas) / 2);
      ctx.lineTo(x1, (yHaut + yBas) / 2);
      ctx.stroke();
      ctx.restore();
    };

    if (entrant === null && fronts.length === 0) {
      inconnu(MARGE_G, w - MARGE_D);
      ctx.restore();
      return;
    }

    const yDe = (n: 0 | 1): number => (n === 1 ? yHaut : yBas);
    const xMin = MARGE_G;
    const xMax = w - MARGE_D;
    let niveau: 0 | 1 = entrant ?? (fronts[0] ? (fronts[0].niveau === 1 ? 0 : 1) : 0);
    let x = xMin;
    if (connuDepuis !== null) {
      x = Math.max(xMin, Math.min(xMax, this.xDe(connuDepuis, f, w)));
      inconnu(xMin, x);
    }

    ctx.beginPath();
    ctx.moveTo(x, yDe(niveau));
    let i = 0;
    while (i < fronts.length) {
      const xf = this.xDe(fronts[i]!.t, f, w);
      const col = Math.floor(xf);
      // Combien de fronts tombent dans CETTE colonne de pixel ?
      let j = i;
      while (j < fronts.length && Math.floor(this.xDe(fronts[j]!.t, f, w)) === col) j += 1;
      const n = j - i;
      if (n > 2) {
        // Zone dense : on ferme le trait, on remplit un bloc, on repart du
        // dernier niveau réel de la colonne.
        ctx.lineTo(Math.max(xMin, Math.min(xMax, xf)), yDe(niveau));
        ctx.stroke();
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = couleur;
        ctx.fillRect(Math.max(xMin, col), yHaut, 1, yBas - yHaut);
        ctx.restore();
        niveau = fronts[j - 1]!.niveau;
        x = Math.max(xMin, Math.min(xMax, col + 1));
        ctx.beginPath();
        ctx.moveTo(x, yDe(niveau));
        i = j;
        continue;
      }
      for (let k = i; k < j; k++) {
        const xk = Math.max(xMin, Math.min(xMax, this.xDe(fronts[k]!.t, f, w)));
        ctx.lineTo(xk, yDe(niveau)); // palier
        niveau = fronts[k]!.niveau;
        ctx.lineTo(xk, yDe(niveau)); // front
      }
      i = j;
    }
    ctx.lineTo(xMax, yDe(niveau));
    ctx.stroke();
    ctx.restore();
  }

  /** Annotations de décodage, sous les créneaux de la voie de données. */
  private annotations(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    w: number,
    fg: string,
    sombre: boolean
  ): void {
    if (e.annotations.length === 0) return;
    // Chaque annotation se pose sous la piste de SA voie de données. Depuis
    // qu'on décode plusieurs bus à la fois, tout empiler sous la dernière
    // piste mélangeait les trames de deux protocoles sans rien pour les
    // distinguer. Une annotation sans voie (ou dont la voie n'est pas
    // affichée) retombe sous la dernière piste, comme avant.
    const derniere = e.voies.length - 1;
    if (derniere < 0) return;
    const rang = new Map<number, number>();
    for (let i = 0; i < e.voies.length; i++) rang.set(e.voies[i]!.voie, i);
    const hauts = hautsPistes(e.voies);
    /** Haut d'une ligne de la bande de décodage d'une piste. */
    const yDe = (piste: number, ligne: number): number =>
      hauts[piste]! + PISTE_H + 1 + ligne * ANNOT_H;
    const xMin = MARGE_G;
    const xMax = w - MARGE_D;
    // Start VERT et stop ROUGE pour tous les protocoles (Frank, 24/09) : les
    // données passent donc au bleu et les erreurs au magenta, sans quoi un
    // octet se confondait avec son start bit et une erreur de cadrage avec le
    // STOP qu'elle remplace.
    const couleurs: Record<Annotation['nature'], string> = {
      start: sombre ? '#199e70' : '#1baf7a',
      stop: sombre ? '#e66767' : '#e34948',
      cadre: sombre ? '#9085e9' : '#4a3aa7',
      donnee: sombre ? '#5a9ee6' : '#2f7fd8',
      controle: sombre ? '#c98500' : '#eda100',
      erreur: sombre ? '#e05cc9' : '#b0249a',
    };
    ctx.save();
    ctx.font = `bold ${ANNOT_PX}px ${getComputedStyle(document.body).getPropertyValue('--vscode-editor-font-family').trim() || 'monospace'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pisteDe = (a: Annotation): number =>
      (a.voie !== undefined ? rang.get(a.voie) : undefined) ?? derniere;
    /** Ligne d'une annotation, ramenée à celles que sa piste a réservées. */
    const ligneDe = (a: Annotation, piste: number): number =>
      Math.min(Math.max(0, a.ligne ?? 0), lignesDe(e.voies[piste]!) - 1);
    // Une RANGÉE = une ligne d'une piste. Tout ce qui empêche deux textes de se
    // recouvrir se suit par rangée : les octets d'une ligne DHT ne gênent pas
    // les valeurs écrites sur la ligne d'en dessous.
    const rangee = (piste: number, ligne: number): number => piste * 8 + ligne;
    const boite =(a: Annotation): { x0: number; x1: number; g: number; d: number } => {
      const x0 = this.xDe(a.t0, e.fenetre, w);
      const x1 = this.xDe(Math.max(a.t1, a.t0), e.fenetre, w);
      return { x0, x1, g: Math.max(xMin, x0), d: Math.min(xMax, Math.max(x1, x0 + 1)) };
    };
    /** Le texte qui tient dans `place` pixels : le long, sinon le court, sinon aucun. */
    const texteQuiTient = (a: Annotation, place: number): string | null => {
      if (ctx.measureText(a.texte).width + 4 <= place) return a.texte;
      if (a.court !== undefined && ctx.measureText(a.court).width + 4 <= place) return a.court;
      return null;
    };
    const baseTexte = (piste: number, ligne: number): number => yDe(piste, ligne) + (ANNOT_H - 3) / 2;

    // Résumés À ÉCRIRE : ceux dont l'un des champs détaillés de LEUR ligne ne
    // peut pas écrire le sien. De près on lit les champs, de loin le résumé —
    // jamais un mélange des deux : un « ✓ » de somme qui tient seul bloquerait
    // le résumé et cacherait les valeurs qu'on est venu chercher.
    const resumes: Annotation[] = [];
    const couverts: Array<{ rangee: number; t0: number; t1: number }> = [];
    for (const r of e.annotations) {
      if (!r.resume) continue;
      const piste = pisteDe(r);
      const ligne = ligneDe(r, piste);
      const champs = e.annotations.filter(
        (a) => !a.resume && pisteDe(a) === piste && ligneDe(a, piste) === ligne && a.t0 >= r.t0 && a.t1 <= r.t1
      );
      const lisibles = champs.every((a) => {
        const b = boite(a);
        return texteQuiTient(a, b.d - b.g) !== null;
      });
      if (lisibles && champs.length > 0) continue;
      resumes.push(r);
      couverts.push({ rangee: rangee(piste, ligne), t0: r.t0, t1: r.t1 });
    }

    // Affichage binaire : un trait pointillé à chaque bord de bit, du haut du
    // créneau jusqu'au bas de la ligne des bits — l'œil suit le bit du front
    // qui l'a posé au chiffre qui le lit. Un bit de moins de BIT_MIN_PX n'est
    // plus dessiné du tout : de loin, bits et traits ne feraient qu'un aplat.
    const separes = new Map<number, Set<number>>();
    ctx.save();
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    for (const a of e.annotations) {
      if (!a.bit) continue;
      const piste = pisteDe(a);
      const { x0, x1 } = boite(a);
      if (x1 - x0 < BIT_MIN_PX || x1 < xMin || x0 > xMax) continue;
      const haut = hauts[piste]! + (PISTE_H - CRENEAU_H) / 2;
      const bas = yDe(piste, ligneDe(a, piste)) + ANNOT_H - 3;
      let vus = separes.get(piste);
      if (!vus) separes.set(piste, (vus = new Set()));
      for (const x of [x0, x1]) {
        const xr = Math.round(x);
        // Deux bits voisins partagent un bord : un seul trait, sinon les deux
        // pointillés décalés d'un demi-pas en font un plein.
        if (x < xMin || x > xMax || vus.has(xr)) continue;
        vus.add(xr);
        ctx.moveTo(xr + 0.5, haut);
        ctx.lineTo(xr + 0.5, bas);
      }
    }
    ctx.stroke();
    ctx.restore();

    // Dernier x occupé, PAR RANGÉE : une annotation qui chevaucherait la
    // précédente est dessinée en trait seul, sans texte — l'élève zoome pour
    // la lire. Le suivi est par piste depuis qu'on décode plusieurs bus (un
    // compteur global laissait un bus muet parce que l'autre avait écrit au
    // même instant sous une AUTRE piste), et par ligne depuis le DHT.
    const occupe = new Map<number, number>();
    /** Intervalles où un texte est écrit, par rangée : un résumé ne les recouvre pas. */
    const ecrits = new Map<number, Array<[number, number]>>();
    const noterEcrit = (cle: number, g: number, d: number): void => {
      const l = ecrits.get(cle);
      if (l) l.push([g, d]);
      else ecrits.set(cle, [[g, d]]);
    };
    for (const a of e.annotations) {
      if (a.resume) continue;
      const piste = pisteDe(a);
      if (piste < 0) continue;
      const ligne = ligneDe(a, piste);
      const cle = rangee(piste, ligne);
      const y = yDe(piste, ligne);
      const { x0, x1, g, d } = boite(a);
      if (x1 < xMin || x0 > xMax) continue;
      if (a.bit && x1 - x0 < BIT_MIN_PX) continue;
      const c = couleurs[a.nature];
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(g, y, Math.max(1, d - g), ANNOT_H - 3);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(Math.round(g) + 0.5, y);
      ctx.lineTo(Math.round(g) + 0.5, y + ANNOT_H - 3);
      ctx.stroke();
      // Champ doublé par un résumé à écrire : c'est le résumé qui parle.
      if (couverts.some((m) => m.rangee === cle && a.t0 >= m.t0 && a.t1 <= m.t1)) continue;
      const texte = texteQuiTient(a, d - g);
      if (texte !== null && g >= (occupe.get(cle) ?? -Infinity)) {
        ctx.fillStyle = fg;
        ctx.fillText(texte, (g + d) / 2, baseTexte(piste, ligne));
        occupe.set(cle, d);
        noterEcrit(cle, g, d);
      }
    }

    // Les résumés s'écrivent à partir du début de leur trame et débordent à
    // droite jusqu'à la PROCHAINE annotation de la piste, toutes lignes
    // confondues (le départ de la trame suivante l'arrête) : de loin, la trame
    // n'a que quelques pixels, le silence qui la suit a toute la place.
    ctx.textAlign = 'left';
    for (const r of resumes) {
      const piste = pisteDe(r);
      if (piste < 0) continue;
      const ligne = ligneDe(r, piste);
      const cle = rangee(piste, ligne);
      const { x0, x1, g } = boite(r);
      if (x1 < xMin || x0 > xMax) continue;
      let limite = xMax;
      for (const a of e.annotations) {
        if (a === r || a.t0 < r.t1 || pisteDe(a) !== piste) continue;
        limite = Math.min(limite, this.xDe(a.t0, e.fenetre, w));
      }
      const texte = texteQuiTient(r, limite - g);
      if (texte === null) continue;
      const fin = g + ctx.measureText(texte).width + 4;
      if ((ecrits.get(cle) ?? []).some(([a0, a1]) => a0 < fin && a1 > g)) continue;
      ctx.fillStyle = fg;
      ctx.fillText(texte, g + 2, baseTexte(piste, ligne));
      noterEcrit(cle, g, fin);
    }
    ctx.restore();
  }

  /** Repère vertical de l'instant de déclenchement. */
  private declenchement(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    w: number,
    h: number
  ): void {
    const t = e.capture.tTrigger;
    if (t === null) return;
    const x = this.xDe(t, e.fenetre, w);
    if (x < MARGE_G || x > w - MARGE_D) return;
    ctx.save();
    ctx.strokeStyle = '#e34948';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, REGLE_H);
    ctx.lineTo(Math.round(x) + 0.5, h);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Marqueurs M1 et M2 (Frank, 25/09). Garés, ils attendent à gauche de la
   * barre de temps ; posés, leur drapeau suit leur instant et un trait de leur
   * couleur descend sur toutes les pistes. Posés tous les deux, une flèche les
   * relie et dit l'écart qui les sépare.
   *
   * Un marqueur posé hors de la fenêtre n'a ni drapeau ni trait : une pointe de
   * sa couleur, au bord, dit de quel côté le chercher.
   */
  private marqueurs(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    w: number,
    h: number,
    fg: string,
    sombre: boolean,
    police: string
  ): void {
    const teintes = sombre ? MARQUEUR_COULEUR.sombre : MARQUEUR_COULEUR.clair;
    const xMin = MARGE_G;
    const xMax = w - MARGE_D;
    const yD = GRAD_H + (BANDE_M - DRAPEAU_H) / 2;
    const yMilieu = yD + DRAPEAU_H / 2;
    const ts = [0, 1].map((m) => e.marqueurs?.[m] ?? null);
    const xs = ts.map((t) => (t === null ? null : this.xDe(t, e.fenetre, w)));
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = `bold 10px ${police}`;

    if (xs[0] != null && xs[1] != null) {
      this.ecart(ctx, e, Math.abs(ts[1]! - ts[0]!), xs[0], xs[1], xMin, xMax, yMilieu, fg, sombre);
    }

    // Le rappel ne sert que si un marqueur est posé : sinon il reste pâle et
    // ne se prend pas. L'export n'en a que faire, comme des marqueurs garés et
    // des pointes de bord : ils servent à manier la vue, pas à la lire.
    const unPose = ts.some((t) => t !== null);
    if (!e.export) {
      this.rappel(ctx, COL_X, yD, fg, unPose);
      if (unPose) this.zoneRappel = { x: COL_X, y: GRAD_H, w: RAPPEL_W, h: BANDE_M };
    }

    // Le marqueur tenu se dessine en dernier : c'est lui qu'on regarde, et il
    // doit passer devant l'autre quand on l'amène dessus.
    const ordre = e.marqueurPris === 0 ? [1, 0] : [0, 1];
    for (const m of ordre) {
      const couleur = teintes[m]!;
      const x = xs[m] ?? null;
      if (x === null) {
        if (e.export) continue;
        this.drapeau(ctx, m, xGare(m), yD, couleur);
        this.zonesMarqueurs.push({ m, x: xGare(m) - DRAPEAU_W / 2, y: GRAD_H, w: DRAPEAU_W, h: BANDE_M });
        continue;
      }
      // Un marqueur exporté sur le bord droit tombe au pixel près sur la fin du
      // tracé : un demi-pixel d'arrondi ne doit pas l'effacer.
      if (e.export && (x < xMin - 0.5 || x > xMax + 0.5)) continue;
      if (!e.export && (x < xMin || x > xMax)) {
        const bord = x < xMin ? xMin + 1 : xMax - 1;
        const s = x < xMin ? 1 : -1;
        ctx.fillStyle = couleur;
        ctx.beginPath();
        ctx.moveTo(bord, yMilieu);
        ctx.lineTo(bord + s * 7, yMilieu - 5);
        ctx.lineTo(bord + s * 7, yMilieu + 5);
        ctx.closePath();
        ctx.fill();
        continue;
      }
      // Trait en pointillés (Frank, 25/09) : il ne masque pas le front qu'il
      // mesure, et ne se confond pas avec les tirets du déclenchement.
      ctx.strokeStyle = couleur;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, yD + DRAPEAU_H);
      ctx.lineTo(Math.round(x) + 0.5, h);
      ctx.stroke();
      ctx.setLineDash([]);
      this.drapeau(ctx, m, x, yD, couleur);
      if (e.export) continue;
      this.zonesMarqueurs.push(
        { m, x: x - 4, y: REGLE_H, w: 8, h: h - REGLE_H },
        { m, x: x - DRAPEAU_W / 2, y: GRAD_H, w: DRAPEAU_W, h: BANDE_M }
      );
    }
    ctx.restore();
  }

  /** Bouton de rappel : cadre arrondi, flèche vers la gauche, à la couleur du texte. */
  private rappel(ctx: CanvasRenderingContext2D, x: number, y: number, fg: string, actif: boolean): void {
    const ym = y + DRAPEAU_H / 2;
    ctx.save();
    ctx.globalAlpha = actif ? 1 : 0.35;
    ctx.strokeStyle = fg;
    ctx.fillStyle = fg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, RAPPEL_W - 1, DRAPEAU_H - 1, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 4, ym);
    ctx.lineTo(x + 9, ym - 4);
    ctx.lineTo(x + 9, ym + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x + 9, ym - 1, RAPPEL_W - 13, 2);
    ctx.restore();
  }

  /** Drapeau d'un marqueur, centré sur `x` : plaque de sa couleur, nom en blanc. */
  private drapeau(ctx: CanvasRenderingContext2D, m: number, x: number, y: number, couleur: string): void {
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.roundRect(x - DRAPEAU_W / 2, y, DRAPEAU_W, DRAPEAU_H, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(NOMS_MARQUEUR[m]!, x, y + DRAPEAU_H / 2 + 0.5);
  }

  /**
   * Flèche double entre M1 et M2, avec leur écart en clair. L'écart s'écrit
   * entre les drapeaux quand il y tient, sinon à côté : un écart qu'on ne lit
   * pas ne mesure rien.
   */
  private ecart(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    dt: number,
    x0: number,
    x1: number,
    xMin: number,
    xMax: number,
    y: number,
    fg: string,
    sombre: boolean
  ): void {
    const xa = Math.min(x0, x1);
    const xb = Math.max(x0, x1);
    // Les deux du même côté, hors de la fenêtre : rien à relier à l'écran.
    if (xb < xMin || xa > xMax) return;
    const pointeA = xa >= xMin;
    const pointeB = xb <= xMax;
    const ga = pointeA ? xa + DRAPEAU_W / 2 + 1 : xMin;
    const gb = pointeB ? xb - DRAPEAU_W / 2 - 1 : xMax;
    const texte = formatTemps(dt, e.lang);
    const tw = ctx.measureText(texte).width;
    const place = gb - ga;

    ctx.save();
    ctx.strokeStyle = fg;
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1;
    if (place > 12) {
      ctx.beginPath();
      ctx.moveTo(ga, Math.round(y) + 0.5);
      ctx.lineTo(gb, Math.round(y) + 0.5);
      ctx.stroke();
      const pointe = (x: number, s: 1 | -1): void => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + s * 5, y - 3.5);
        ctx.lineTo(x + s * 5, y + 3.5);
        ctx.closePath();
        ctx.fill();
      };
      if (pointeA) pointe(ga, 1);
      if (pointeB) pointe(gb, -1);
    }
    ctx.globalAlpha = 1;
    let xt: number;
    if (place >= tw + 22) {
      xt = (ga + gb) / 2 - tw / 2;
    } else if (xb + DRAPEAU_W / 2 + 4 + tw <= xMax) {
      xt = xb + DRAPEAU_W / 2 + 4;
    } else {
      xt = Math.max(xMin, xa - DRAPEAU_W / 2 - 4 - tw);
    }
    // Plaque opaque : la flèche passe DERRIÈRE le texte.
    ctx.fillStyle = fondPage(sombre);
    ctx.fillRect(xt - 3, y - 7, tw + 6, 14);
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.fillText(texte, xt, y + 0.5);
    ctx.restore();
  }

  /**
   * Réticule : trait vertical suivant la souris, l'instant en haut, et le
   * niveau de chaque voie à cet instant à côté de son nom.
   */
  private reticule(
    ctx: CanvasRenderingContext2D,
    e: EtatRendu,
    w: number,
    h: number,
    fg: string,
    sombre: boolean,
    instant: BoiteInstant | null
  ): void {
    const s = e.souris!;
    if (!instant) return;
    const t = this.tDe(s.x, e.fenetre, w);
    ctx.save();
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(Math.round(s.x) + 0.5, REGLE_H);
    ctx.lineTo(Math.round(s.x) + 0.5, h);
    ctx.stroke();

    // L'instant sur une PLAQUE opaque : écrit à nu, il se mêlait aux
    // graduations qu'il survolait et ne se lisait plus (Frank, 25/09).
    ctx.globalAlpha = 1;
    const largeur = instant.d - instant.g;
    ctx.fillStyle = fondPage(sombre);
    ctx.fillRect(instant.g, 1, largeur, GRAD_H - 5);
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.45;
    ctx.strokeRect(Math.round(instant.g) + 0.5, 1.5, Math.round(largeur) - 1, GRAD_H - 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = fg;
    ctx.textAlign = instant.droite ? 'right' : 'left';
    ctx.fillText(instant.texte, instant.x, GRAD_H / 2 - 2);

    // Niveau de chaque voie sous le curseur, à droite de son nom : en gras,
    // 0 rouge et 1 vert, pour le lire sans chercher (Frank, 24/09).
    ctx.textAlign = 'right';
    ctx.font = `bold 13px ${getComputedStyle(document.body).getPropertyValue('--vscode-editor-font-family').trim() || 'monospace'}`;
    const teintes = sombre ? NIVEAU_COULEUR.sombre : NIVEAU_COULEUR.clair;
    const hauts = hautsPistes(e.voies);
    for (let i = 0; i < e.voies.length; i++) {
      const vv = e.voies[i]!;
      if (vv.probleme) continue;
      const n = e.capture.niveauA(vv.voie, t);
      if (n === null) continue;
      ctx.fillStyle = teintes[n];
      ctx.fillText(String(n), MARGE_G - 4, hauts[i]! + PISTE_H / 2);
    }
    ctx.restore();
  }

  /** Coupe un texte trop long pour la colonne des noms (suffixe « … »). */
  private tronquer(ctx: CanvasRenderingContext2D, texte: string, largeur: number): string {
    if (ctx.measureText(texte).width <= largeur) return texte;
    let t = texte;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > largeur) t = t.slice(0, -1);
    return `${t}…`;
  }
}

/** Fond de la page, pour les plaques opaques posées sous un texte. */
function fondPage(sombre: boolean): string {
  return (
    getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim() ||
    (sombre ? '#1e1e1e' : '#ffffff')
  );
}

/**
 * Coupe un texte en lignes d'au plus `largeur` pixels, aux espaces. Un mot plus
 * long que la largeur reste entier sur sa ligne : le couper au milieu le
 * rendrait illisible, le laisser déborder un peu ne l'est pas.
 */
export function couperLignes(ctx: CanvasRenderingContext2D, texte: string, largeur: number): string[] {
  const mots = texte.split(/\s+/).filter((m) => m !== '');
  const lignes: string[] = [];
  let courante = '';
  for (const m of mots) {
    const essai = courante === '' ? m : `${courante} ${m}`;
    if (courante !== '' && ctx.measureText(essai).width > largeur) {
      lignes.push(courante);
      courante = m;
    } else {
      courante = essai;
    }
  }
  if (courante !== '') lignes.push(courante);
  return lignes.length > 0 ? lignes : [''];
}

/** Constantes de disposition exposées pour les bancs et l'interface. */
export const DISPOSITION = {
  PISTE_H,
  ANNOT_H,
  MARGE_G,
  MARGE_D,
  REGLE_H,
  GRAD_H,
  BANDE_M,
  DRAPEAU_W,
  CRENEAU_H,
  NOM_PX,
  BOUTON,
  BOUTON_GAP,
  COL_X,
};
