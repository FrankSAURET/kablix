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

  /**
   * Redonne à chaque voie CAPTURÉE le numéro que le schéma attribue à sa
   * BROCHE, sans toucher aux fronts.
   *
   * Une capture enregistrée et un schéma désignent la même sonde de deux
   * façons : la capture par la broche mesurée, le schéma par le numéro de voie
   * de la pince. Ce numéro n'est qu'une teinte — il change dès qu'on renumérote
   * une pince, qu'on en ajoute ou qu'on en retire —, alors que la broche est
   * l'identité réelle du signal. Sans ce recalage, les fronts d'une voie se
   * retrouvent sous un numéro qui n'a aucune piste, et la piste qui les attend
   * reste plate : c'est la page grise du 20/09 (trois sondes muettes sur quatre
   * dans sonde-logique-pico).
   *
   * Une broche absente du schéma garde son numéro : ses fronts restent là si un
   * message `voies` la ramène. Un numéro déjà pris par une autre broche n'est
   * pas volé — on ne troque pas une capture contre une autre.
   */
  renumeroter(voieParPin: Map<string, number>): void {
    if (voieParPin.size === 0) return;
    const vise = new Map<number, VoieCapture>();
    const reste: VoieCapture[] = [];
    for (const v of this.voies.values()) {
      const n = voieParPin.get(v.pin);
      if (n === undefined || vise.has(n)) reste.push(v);
      else vise.set(n, { ...v, voie: n });
    }
    // Les voies non recalées reprennent leur place, sauf si elle vient d'être
    // occupée par une voie recalée — celle-ci a le schéma pour elle.
    for (const v of reste) if (!vise.has(v.voie)) vise.set(v.voie, v);
    this.voies = vise;
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

  /**
   * Borne GAUCHE de la capture : le premier front vu, toutes voies confondues,
   * en ms simulées. Vaut 0 quand il n'y a rien.
   *
   * Une capture ne commence pas forcément à zéro, et c'est le cas courant dès
   * qu'une liaison série est sondée : le programme se lance, ouvre son port,
   * attend, et le premier octet ne part qu'après plusieurs dizaines de secondes.
   * Sans cette borne, la vue s'ouvrait de 0 à la fin de la capture et tassait
   * quelques microsecondes de créneaux dans les derniers pixels de l'écran —
   * l'élève ne voyait qu'une page vide (retour de Frank sur dmx-pico, .96).
   */
  get tDebut(): number {
    let min = Infinity;
    for (const v of this.voies.values()) {
      // Les fronts d'une voie sont rangés dans l'ordre : le premier suffit.
      const f = v.fronts[0];
      if (f !== undefined && f.t < min) min = f.t;
    }
    return min === Infinity ? 0 : min;
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
  /**
   * Voies lues à l'envers (niveau au repos à 1). L'inversion est appliquée EN
   * SORTIE, sur `niveauA` et `fenetre` : la capture garde ce que le moteur a
   * mesuré, et une voie qu'on remet à l'endroit retrouve ses vrais fronts sans
   * qu'on ait rien à recapturer.
   */
  private inversees = new Set<number>();

  /** Déclare les voies à lire à l'envers (lignes actives-bas). */
  reglerInversion(voies: Iterable<number>): void {
    this.inversees = new Set(voies);
  }

  /**
   * Période d'un échantillon, en MILLISECONDES simulées. 0 = pas de limite.
   *
   * Kablix date ses fronts au cycle du processeur : il sait exactement quand
   * chaque broche a basculé, là où un vrai analyseur ne regarde ses entrées
   * qu'à intervalle fixe. Ce réglage reproduit cette limite — comme
   * l'inversion, il s'applique EN SORTIE : la capture garde tous ses fronts, et
   * revenir en « illimitée » les retrouve sans rien recapturer.
   */
  private periode = 0;

  /** Fréquence d'échantillonnage simulée, en hertz ; 0 = illimitée. */
  reglerEchantillonnage(hz: number): void {
    this.periode = hz > 0 ? 1000 / hz : 0;
  }

  /**
   * Fronts vus par un instrument échantillonnant à la période réglée.
   *
   * Un échantillonneur ne rend qu'UN niveau par échantillon : celui qu'il lit
   * à l'instant du tic. Deux fronts tombés dans le même intervalle se
   * confondent donc, et une impulsion plus brève qu'un échantillon disparaît
   * purement et simplement — c'est exactement ce qui arrive quand on sonde un
   * bus SPI à 1 MHz avec un analyseur à 1 MHz.
   *
   * On découpe donc le temps en INTERVALLES d'une période, et on ne rend qu'une
   * lecture par intervalle : le niveau laissé par le DERNIER front qui y est
   * tombé, daté au tic de fin. Un front qui ne change rien à cette lecture — une
   * impulsion montée et redescendue dans le même intervalle — ne ressort pas :
   * l'instrument ne l'a jamais vue.
   */
  private echantillonner(fronts: Front[], entrant: 0 | 1 | null): Front[] {
    if (this.periode <= 0 || fronts.length === 0) return fronts;
    const sortie: Front[] = [];
    let niveau = entrant;
    let i = 0;
    while (i < fronts.length) {
      // Intervalle de ce front, puis le tic qui le termine : c'est à ce moment
      // que l'instrument lit sa broche.
      const k = Math.floor(fronts[i]!.t / this.periode);
      const tic = (k + 1) * this.periode;
      let dernier = fronts[i]!;
      while (i < fronts.length && Math.floor(fronts[i]!.t / this.periode) === k) {
        dernier = fronts[i]!;
        i++;
      }
      if (dernier.niveau !== niveau) {
        niveau = dernier.niveau;
        sortie.push({ t: tic, niveau: dernier.niveau });
      }
    }
    return sortie;
  }

  /** Vrai si la voie est lue à l'envers. */
  estInversee(voie: number): boolean {
    return this.inversees.has(voie);
  }

  niveauA(voie: number, t: number): 0 | 1 | null {
    const n = this.niveauBrut(voie, t);
    return n === null || !this.inversees.has(voie) ? n : n === 1 ? 0 : 1;
  }

  /** Niveau réellement capturé, sans tenir compte de l'inversion. */
  private niveauBrut(voie: number, t: number): 0 | 1 | null {
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
    const entrant = this.niveauA(voie, t0);
    // Une marge d'un échantillon à gauche : un front tombé juste avant `t0`
    // peut être LU après lui (l'instrument le rend à son tic), et sans cette
    // marge il manquerait au bord gauche de l'écran.
    const marge = this.periode;
    const fronts = this.echantillonner(
      v.fronts.filter((f) => f.t >= t0 - marge && f.t <= t1),
      this.niveauBrut(voie, t0 - marge)
    ).filter((f) => f.t >= t0 && f.t <= t1);
    return {
      entrant,
      fronts: this.inversees.has(voie)
        ? fronts.map((f) => ({ t: f.t, niveau: (f.niveau === 1 ? 0 : 1) as 0 | 1 }))
        : fronts,
    };
  }
}
