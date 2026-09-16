// Capture de l'analyseur logique : accumule les fronts datés que le moteur
// produit pour chaque broche sondée, et tient le DÉCLENCHEMENT.
//
// Ce module ne dessine rien et ne connaît pas le DOM — il ne fait que la
// mémoire de la capture. C'est ce qui le rend vérifiable sans navigateur : les
// bancs lui versent des fronts et relisent ce qu'il en a fait.
//
// LE MODÈLE DE TEMPS. Le moteur date chaque bascule en MILLISECONDES SIMULÉES
// (`noteScopeEdge`), pas en temps réel : deux fronts séparés de 4 µs dans le
// programme le restent ici, même si la simulation a mis 10 ms à les produire.
// C'est indispensable au décodage — à 250 kbauds (DMX) un bit dure 4 µs, et
// aucune horloge de navigateur ne tient cette résolution.
//
// LE NIVEAU AVANT LE PREMIER FRONT. Une voie qui n'a pas encore basculé n'a
// aucun front : son niveau est alors INCONNU, et non « bas ». Le dire bas
// dessinerait un trait plein à zéro là où la broche est peut-être haute depuis
// le début. La capture retient donc `null` jusqu'au premier front, et c'est la
// vue qui décide comment le montrer.

/** Un front : l'instant (ms simulées) et le niveau ATTEINT. */
export interface Front {
  t: number;
  niveau: 0 | 1;
}

/** Sens de déclenchement sur une voie. */
export type SensDeclenchement = 'rising' | 'falling';

/** Réglage du déclenchement : la voie surveillée et le sens du front. */
export interface Declenchement {
  /** Indice de voie surveillée (celui de la couleur). */
  voie: number;
  sens: SensDeclenchement;
}

/** État d'une voie capturée. */
export interface VoieCapture {
  /** Indice de couleur = identité de la voie. */
  voie: number;
  /** Broche MCU écoutée (nom vu du firmware). */
  pin: string;
  /** Nom affiché (étiquette de la sonde, ou nom dérivé de la broche). */
  nom: string;
  /** Fronts capturés, dans l'ordre du temps. */
  fronts: Front[];
  /** Niveau AVANT le premier front, ou null s'il n'a jamais été observé. */
  niveauInitial: 0 | 1 | null;
}

/**
 * Plafond de fronts gardés PAR VOIE côté page. Le moteur borne déjà son propre
 * journal (LOGIC_LOG_MAX) ; ce second plafond protège la page, qui accumule sur
 * toute la durée du run alors que le moteur ne garde que ce qui n'a pas encore
 * été lu.
 */
export const FRONTS_MAX_PAR_VOIE = 60_000;

/**
 * Nombre maximum de voies. Huit, décidé avec Frank — c'est aussi la taille de
 * la palette de couleurs (au-delà, deux voies partageraient une teinte et le
 * lien visuel avec la pince serait faux).
 */
export const VOIES_MAX = 8;

export class AnalyseurCapture {
  private voies = new Map<number, VoieCapture>();
  /** Voie par broche : le moteur nous parle en broches, pas en voies. */
  private parPin = new Map<string, VoieCapture>();

  private declenchement: Declenchement | null = null;
  /** Instant du front de déclenchement, ou null tant qu'il n'est pas survenu. */
  private tDeclenche: number | null = null;
  /** Vrai quand la capture est armée mais attend encore son front. */
  private armee = false;

  /** Instant du dernier front reçu, toutes voies confondues (borne droite). */
  private tDernier = 0;

  /**
   * Déclare les voies de la capture. Appelé au départ de la simulation, et à
   * chaque fois que les sondes changent (pose, déplacement, suppression).
   * Les fronts déjà capturés d'une voie CONSERVÉE sont gardés — sinon replacer
   * une sonde effacerait la capture des sept autres.
   */
  declarerVoies(voies: Array<{ voie: number; pin: string; nom: string }>): void {
    const gardees = new Map<number, VoieCapture>();
    for (const v of voies.slice(0, VOIES_MAX)) {
      const ancienne = this.voies.get(v.voie);
      // Même voie ET même broche : la capture continue. Broche changée = la
      // sonde a été déplacée, ses anciens fronts ne décrivent plus rien.
      gardees.set(
        v.voie,
        ancienne && ancienne.pin === v.pin
          ? { ...ancienne, nom: v.nom }
          : { voie: v.voie, pin: v.pin, nom: v.nom, fronts: [], niveauInitial: null }
      );
    }
    this.voies = gardees;
    this.parPin = new Map();
    for (const v of this.voies.values()) this.parPin.set(v.pin, v);
  }

  /** Voies déclarées, dans l'ordre des couleurs. */
  get listeVoies(): VoieCapture[] {
    return [...this.voies.values()].sort((a, b) => a.voie - b.voie);
  }

  /** Broches à demander au moteur (`setLogicProbes`). */
  get pins(): string[] {
    return [...this.parPin.keys()];
  }

  /** Vrai si au moins un front a été capturé sur une voie quelconque. */
  get aDesDonnees(): boolean {
    for (const v of this.voies.values()) if (v.fronts.length > 0) return true;
    return false;
  }

  /** Borne droite de la capture (dernier front vu), en ms simulées. */
  get tFin(): number {
    return this.tDernier;
  }

  /** Instant du déclenchement, ou null s'il n'a pas (encore) eu lieu. */
  get tTrigger(): number | null {
    return this.tDeclenche;
  }

  /** Vrai si un déclenchement est réglé mais pas encore survenu. */
  get enAttente(): boolean {
    return this.armee && this.tDeclenche === null;
  }

  /**
   * Règle (ou retire) le déclenchement. Le régler REARME la capture : le
   * précédent instant de déclenchement n'a plus de sens si l'on change de voie
   * ou de sens.
   */
  reglerDeclenchement(d: Declenchement | null): void {
    this.declenchement = d;
    this.tDeclenche = null;
    this.armee = d !== null;
  }

  get reglageDeclenchement(): Declenchement | null {
    return this.declenchement;
  }

  /** Nouveau run : tout est oublié, les voies restent déclarées. */
  reinitialiser(): void {
    for (const v of this.voies.values()) {
      v.fronts = [];
      v.niveauInitial = null;
    }
    this.tDernier = 0;
    this.tDeclenche = null;
    this.armee = this.declenchement !== null;
  }

  /**
   * Verse une salve du moteur : par broche, la liste plate
   * [temps en ms, niveau, temps, niveau, …] rendue par `drainScopeEdges`.
   *
   * Les broches inconnues sont ignorées en silence — le journal du moteur est
   * commun à l'oscilloscope et à l'analyseur, on y reçoit donc aussi les
   * broches que seul un oscilloscope regarde.
   */
  verser(salves: Record<string, number[]>): void {
    for (const [pin, plat] of Object.entries(salves)) {
      const v = this.parPin.get(pin);
      if (!v) continue;
      for (let i = 0; i + 1 < plat.length; i += 2) {
        const t = plat[i]!;
        const niveau: 0 | 1 = plat[i + 1] ? 1 : 0;
        // Le niveau AVANT le premier front se déduit de ce premier front : une
        // broche qui monte était basse, et inversement. C'est la seule
        // information fiable sur le passé qu'on n'a pas observé.
        if (v.fronts.length === 0 && v.niveauInitial === null) {
          v.niveauInitial = niveau === 1 ? 0 : 1;
        }
        v.fronts.push({ t, niveau });
        if (t > this.tDernier) this.tDernier = t;
        this.noterDeclenchement(v, niveau, t);
      }
      if (v.fronts.length > FRONTS_MAX_PAR_VOIE) {
        // On jette les plus VIEUX : l'écran montre la fin de la capture. Le
        // niveau initial devient celui qui précède le plus ancien front gardé.
        const trop = v.fronts.length - FRONTS_MAX_PAR_VOIE;
        const premierGarde = v.fronts[trop];
        if (premierGarde) v.niveauInitial = premierGarde.niveau === 1 ? 0 : 1;
        v.fronts.splice(0, trop);
      }
    }
  }

  /**
   * Premier front qui satisfait le déclenchement : il fixe l'origine des temps
   * de la vue. Seul le PREMIER compte — un déclenchement qui se redéplacerait à
   * chaque front ferait glisser l'écran sans arrêt, ce qui est exactement le
   * défaut qu'un déclenchement corrige.
   */
  private noterDeclenchement(v: VoieCapture, niveau: 0 | 1, t: number): void {
    if (!this.declenchement || this.tDeclenche !== null) return;
    if (v.voie !== this.declenchement.voie) return;
    const attendu = this.declenchement.sens === 'rising' ? 1 : 0;
    if (niveau === attendu) this.tDeclenche = t;
  }

  /**
   * Niveau d'une voie à un instant donné (pour le réticule de la vue).
   * Rend null si l'instant précède tout front connu et que le niveau initial
   * n'a jamais pu être déduit.
   */
  niveauA(voie: number, t: number): 0 | 1 | null {
    const v = this.voies.get(voie);
    if (!v) return null;
    // Recherche dichotomique : le dernier front dont l'instant est ≤ t.
    let lo = 0;
    let hi = v.fronts.length - 1;
    let trouve = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (v.fronts[mid]!.t <= t) {
        trouve = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return trouve < 0 ? v.niveauInitial : v.fronts[trouve]!.niveau;
  }

  /**
   * Fronts d'une voie dans une fenêtre de temps, avec le niveau qui ENTRE par
   * le bord gauche. La vue en a besoin pour dessiner un créneau qui commence
   * avant la fenêtre : sans ce niveau d'entrée, le trait partirait du vide.
   */
  fenetre(voie: number, t0: number, t1: number): { entrant: 0 | 1 | null; fronts: Front[] } {
    const v = this.voies.get(voie);
    if (!v) return { entrant: null, fronts: [] };
    return {
      entrant: this.niveauA(voie, t0),
      fronts: v.fronts.filter((f) => f.t >= t0 && f.t <= t1),
    };
  }
}
