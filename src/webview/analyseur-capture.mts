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

import { breakDmxMinMs, debutsDeTrame, reglageComplet, rolesDe, type ReglageDecodage } from './analyseur-decodage.mjs';

/**
 * Sens de déclenchement sur une voie : un front, `dmxStart` — le start bit du
 * START code 0x00 d'une trame DMX512 (Frank, 24/09 : « déclenchement sur start
 * code (premier 0x00) ») —, ou `trame` : le début de trame du protocole décodé
 * sur la voie, quel qu'il soit (Frank, 25/09 : « pour tous les protocoles, tu
 * prévois un déclenchement sur début de trame comme pour le DMX »).
 */
export type SensDeclenchement = 'rising' | 'falling' | 'dmxStart' | 'trame';

/**
 * Recul, en ms, du décodage qui cherche un début de trame en plein run : de
 * quoi relire une ouverture de trame qui a commencé avant la salve (départ DHT
 * de 18 ms, BREAK DMX) et le silence qui précède un caractère série.
 */
const RECUL_TRAME_MS = 100;

/**
 * Début de la fenêtre de recul où un début de trame N'EST PAS cru : le décodeur
 * y lit le premier caractère série ou la première salve SPI sans ce qui les
 * précède, et les prendrait pour des ouvertures de trame. 50 ms : le temps de
 * se recaler sur trois caractères à 1200 bauds. Une ouverture plus courte que
 * la garde est toujours trouvée : elle finit avant que la garde ne la dépasse.
 */
const GARDE_TRAME_MS = RECUL_TRAME_MS / 2;

/** Vitesse DMX512 de la norme, quand la voie n'en règle pas d'autre. */
const BAUDS_DMX = 250_000;

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
  /**
   * Instant du dernier front JETÉ par le plafond, absent tant que rien ne l'a
   * été. Avant lui le niveau n'est plus connu : les fronts qui le disaient sont
   * partis. `niveauInitial` ne vaut donc qu'à partir de cet instant.
   */
  perte?: number;
}

/**
 * Profondeur PAR DÉFAUT : plafond de fronts gardés PAR VOIE côté page. Le
 * moteur borne déjà son propre journal (LOGIC_LOG_MAX) ; ce second plafond
 * protège la page, qui accumule sur toute la durée du run alors que le moteur
 * ne garde que ce qui n'a pas encore été lu. Réglable depuis v2026.9.5.161
 * (`reglerProfondeur`, liste `PROFONDEURS`).
 */
export const FRONTS_MAX_PAR_VOIE = 60_000;

/**
 * Profondeurs proposées dans la barre de l'analyseur, en fronts par voie
 * (Frank, 26/09 : une capture déclenchée pleine à 8,3 s en DMX). Comme la
 * mémoire d'un analyseur du commerce : plus profond = plus long, mais plus
 * lourd — 1 M de fronts pèse de l'ordre de 40 Mo par voie dans la page.
 */
export const PROFONDEURS = [FRONTS_MAX_PAR_VOIE, 250_000, 1_000_000] as const;

/**
 * Fronts gardés AVANT le déclenchement, par voie, une fois qu'il est survenu,
 * à la profondeur par défaut. Un dixième de la profondeur : de quoi voir ce qui
 * a précédé l'événement, le reste va à ce qui le suit — c'est le partage d'un
 * analyseur du commerce.
 */
export const RESERVE_AVANT = FRONTS_MAX_PAR_VOIE / 10;

/**
 * Fronts par broche et par tranche, au plus, quand on rejoue une capture
 * entière (`rejouer`). Plus fin qu'une salve du moteur en plein DMX : la
 * capture s'arrête au même front qu'en direct.
 */
const TRANCHE_REJEU = 1024;

/** Premier indice dont l'instant est ≥ t ; `fronts.length` si aucun. */
function premierDes(fronts: Front[], t: number): number {
  let lo = 0;
  let hi = fronts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fronts[mid]!.t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Premier indice dont l'instant est > t ; `fronts.length` si aucun. */
function premierApres(fronts: Front[], t: number): number {
  let lo = 0;
  let hi = fronts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fronts[mid]!.t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Nombre maximum de voies. Huit, décidé avec Frank — c'est aussi la taille de
 * la palette de couleurs (au-delà, deux voies partageraient une teinte et le
 * lien visuel avec la pince serait faux).
 */
export const VOIES_MAX = 8;

export class AnalyseurCapture {
  private voies = new Map<number, VoieCapture>();
  /**
   * Voies par broche : le moteur nous parle en broches, pas en voies. PLUSIEURS
   * voies peuvent écouter la même broche — trois pinces sur SIG, + et - d'une
   * carte DMX remontent toutes à la broche qui l'attaque (Frank, 25/09,
   * dmx-uno-lib : « dmx- et sig n'affichent rien »). Une table à une seule voie
   * par broche ne servait que la dernière déclarée.
   */
  private parPin = new Map<string, VoieCapture[]>();

  private declenchement: Declenchement | null = null;
  /** Instant du front de déclenchement, ou null tant qu'il n'est pas survenu. */
  private tDeclenche: number | null = null;
  /** Vrai quand la capture est armée mais attend encore son front. */
  private armee = false;
  /**
   * Instant où le déclenchement a été armé : seuls les fronts qui le SUIVENT
   * peuvent y répondre. −∞ pour un run entier ou une capture relue. Gardé pour
   * REFAIRE la recherche quand la lecture change (échantillonnage, inversion) :
   * le front qui répond n'est alors plus forcément le même.
   */
  private armeDepuis = -Infinity;
  /** Jusqu'où la recherche a déjà lu sans rien trouver (évite de tout relire à chaque salve). */
  private luJusqua = -Infinity;

  /** Instant du dernier front reçu, toutes voies confondues (borne droite). */
  private tDernier = 0;

  /**
   * Vrai quand la capture DÉCLENCHÉE a rempli sa profondeur : elle ne prend
   * plus rien, comme un analyseur du commerce qui a fini son acquisition.
   * Sans cet arrêt, le plafond finissait par jeter les fronts du déclenchement
   * lui-même, et la vue posée dessus ne montrait plus qu'un trait.
   */
  private plein = false;
  /** Vrai quand le prochain versement doit ouvrir une nouvelle acquisition. */
  private aVider = false;
  /**
   * Dernier niveau vu par broche PENDANT que la capture est pleine : les
   * fronts ne sont plus gardés, mais la nouvelle acquisition doit savoir d'où
   * repart chaque voie.
   */
  private niveauxHors = new Map<string, 0 | 1>();
  /** Instant du dernier front vu, gardé ou non. */
  private tVu = 0;

  /** Profondeur de l'acquisition : fronts gardés au plus par voie. */
  private profondeurMax: number = FRONTS_MAX_PAR_VOIE;

  /** Fronts gardés avant le déclenchement : un dixième de la profondeur. */
  private get reserveAvant(): number {
    return Math.floor(this.profondeurMax / 10);
  }

  /** Profondeur réglée, en fronts par voie. */
  get profondeur(): number {
    return this.profondeurMax;
  }

  /**
   * Règle la profondeur, en fronts par voie. Elle vaut pour l'acquisition EN
   * COURS : plus grande, la capture continue de se remplir ; plus petite, elle
   * est rabotée tout de suite, comme elle l'aurait été en direct.
   *
   * Sur une capture PLEINE, ce qui a suivi n'a pas été gardé : il n'y a rien à
   * rallonger ni à retailler honnêtement. Le réglage réarme alors, comme un
   * nouveau déclenchement — la prochaine salve ouvre une nouvelle acquisition.
   * Une capture arrêtée n'en reçoit plus : elle reste telle qu'elle a été
   * mesurée, et la profondeur servira au prochain run.
   */
  reglerProfondeur(n: number): void {
    const p = Number.isFinite(n) && n >= 1000 ? Math.round(n) : FRONTS_MAX_PAR_VOIE;
    if (p === this.profondeurMax) return;
    this.profondeurMax = p;
    if (this.plein) {
      this.reglerDeclenchement(this.declenchement);
      return;
    }
    // Toutes les voies, même une fois la capture pleine en cours de route :
    // une voie pas encore rabotée peut garder, avant le déclenchement, plus que
    // la nouvelle réserve. `remplir` ne peut alors que reculer la fin.
    for (const v of this.voies.values()) this.raboter(v);
  }

  /**
   * Nouvelle acquisition, TOUT DE SUITE (bouton « Relancer la capture », Frank
   * 26/09) : ce qui a été capturé est oublié et le déclenchement réarmé attend
   * un front À VENIR. Chaque voie garde le niveau où elle se trouve : il vaut à
   * partir de maintenant, la vue n'a pas à le redessiner inconnu.
   */
  relancer(): void {
    this.tDeclenche = null;
    this.armee = this.declenchement !== null;
    this.armeDepuis = this.luJusqua = this.tVu > 0 ? this.tVu : -Infinity;
    this.repartir();
  }

  /**
   * Débit de la voie la plus active, en fronts par milliseconde simulée ; 0 tant
   * qu'aucune n'a assez bougé. Sert à estimer la durée que tient une profondeur.
   *
   * Chaque voie est mesurée depuis le début de ce que la capture sait d'elle —
   * sa perte si elle a été rabotée, sinon le début de la capture —, pas depuis
   * son premier front : une impulsion isolée (deux fronts à 10 µs d'écart)
   * aurait sinon passé pour un signal à 100 kHz.
   */
  get debit(): number {
    const debut = this.tDebut;
    let max = 0;
    for (const v of this.voies.values()) {
      const n = v.fronts.length;
      if (n < 2) continue;
      const duree = this.tDernier - (v.perte ?? debut);
      if (duree > 0) max = Math.max(max, n / duree);
    }
    return max;
  }

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
    this.indexerBroches();
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
  renumeroter(schema: Array<{ voie: number; pin: string }>): void {
    if (schema.length === 0) return;
    // Une voie déjà à sa place (même numéro, même broche) n'a rien à recaler :
    // c'est le cas de chaque pince quand plusieurs écoutent la même broche, et
    // les renuméroter « par broche » les aurait toutes envoyées sur un seul
    // numéro.
    const enPlace = new Set(schema.map((d) => `${d.voie}\u0000${d.pin}`));
    const libres = new Map<string, number[]>();
    for (const d of schema) {
      if ([...this.voies.values()].some((v) => v.voie === d.voie && v.pin === d.pin)) continue;
      const l = libres.get(d.pin);
      if (l) l.push(d.voie);
      else libres.set(d.pin, [d.voie]);
    }
    const vise = new Map<number, VoieCapture>();
    const reste: VoieCapture[] = [];
    for (const v of this.voies.values()) {
      if (enPlace.has(`${v.voie}\u0000${v.pin}`)) {
        vise.set(v.voie, v);
        continue;
      }
      const n = libres.get(v.pin)?.find((k) => !vise.has(k));
      if (n === undefined) reste.push(v);
      else vise.set(n, { ...v, voie: n });
    }
    // Les voies non recalées reprennent leur place, sauf si elle vient d'être
    // occupée par une voie recalée — celle-ci a le schéma pour elle.
    for (const v of reste) if (!vise.has(v.voie)) vise.set(v.voie, v);
    this.voies = vise;
    this.indexerBroches();
  }

  /** Refait la table des voies par broche. */
  private indexerBroches(): void {
    this.parPin = new Map();
    for (const v of this.voies.values()) {
      const liste = this.parPin.get(v.pin);
      if (liste) liste.push(v);
      else this.parPin.set(v.pin, [v]);
    }
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

  /** Vrai quand la capture déclenchée a rempli sa profondeur et ne prend plus rien. */
  get pleine(): boolean {
    return this.plein;
  }

  /**
   * Règle (ou retire) le déclenchement. Le régler REARME la capture : le
   * précédent instant de déclenchement n'a plus de sens si l'on change de voie
   * ou de sens.
   *
   * Sur une capture PLEINE, réarmer lance une nouvelle acquisition : la
   * prochaine salve repart d'une capture vide. Sans cela la capture resterait
   * figée pour toujours — plus aucun front ne peut y entrer.
   */
  reglerDeclenchement(d: Declenchement | null): void {
    this.declenchement = d;
    this.tDeclenche = null;
    this.armee = d !== null;
    // Armé en plein run : seuls les fronts À VENIR comptent.
    this.armeDepuis = this.luJusqua = this.tVu > 0 ? this.tVu : -Infinity;
    if (this.plein) this.aVider = true;
  }

  /**
   * Cherche le déclenchement dans ce qui est DÉJÀ capturé : le premier front
   * qui lui répond. Sert à une capture ARRÊTÉE, où aucun front nouveau ne
   * viendra — sans cela, poser un déclenchement après coup ne marquait rien.
   * Rend l'instant trouvé, ou null.
   */
  chercherDeclenchement(): number | null {
    const d = this.declenchement;
    if (!d || this.tDeclenche !== null) return this.tDeclenche;
    this.armeDepuis = this.luJusqua = -Infinity;
    this.tDeclenche = this.chercher(-Infinity, Infinity);
    return this.tDeclenche;
  }

  /**
   * Premier front qui répond au déclenchement dans ]depuis, jusqua], TEL QUE
   * L'INSTRUMENT LE MONTRE.
   *
   * Échantillonnée, la courbe ne dessine pas les fronts bruts mais ce que lit
   * chaque tic. Chercher le déclenchement sur les fronts bruts posait l'origine
   * des temps là où la courbe ne montre rien : sonde-logique-uno, horloge à
   * 2,4 kHz lue à 1 kHz, affichait son premier front descendant à 2 ms du
   * déclenchement (Frank, 24/09). On cherche donc dans la même lecture que la
   * vue — `fenetre` échantillonne et inverse déjà —, et l'instant rendu est le
   * tic, là où le front est dessiné.
   */
  private chercher(depuis: number, jusqua: number): number | null {
    const d = this.declenchement;
    const v = d ? this.voies.get(d.voie) : undefined;
    if (!d || !v || v.fronts.length === 0) return null;
    if (d.sens === 'dmxStart') return this.chercherStartDmx(v, depuis, jusqua);
    if (d.sens === 'trame') return this.chercherTrame(depuis, jusqua);
    if (this.periode <= 0) {
      for (let i = premierApres(v.fronts, depuis); i < v.fronts.length; i++) {
        const f = v.fronts[i]!;
        if (f.t > jusqua) break;
        if (this.repond(v, f.niveau)) return f.t;
      }
      return null;
    }
    const voulu = d.sens === 'rising' ? 1 : 0;
    const { entrant, fronts } = this.fenetre(d.voie, Math.max(depuis, v.fronts[0]!.t), jusqua);
    // Un front dont on ignore le niveau de départ n'est pas une bascule vue.
    let avant = entrant;
    for (const f of fronts) {
      if (avant !== null && f.niveau === voulu) return f.t;
      avant = f.niveau;
    }
    return null;
  }

  /**
   * Start bit du premier START code 0x00 qui SE TERMINE dans ]depuis, jusqua].
   *
   * Le START code est le créneau qui suit le BREAK et le MAB. Le BREAK se lit
   * comme au décodeur (`breakDmxMinMs` : 88 µs, ou un créneau entier s'il est
   * plus court — DmxSimple n'en tient que 76,6). Il
   * vaut 0x00 quand son start bit et ses huit bits de données forment un seul
   * palier bas de NEUF bits, fermé par le premier bit d'arrêt : cette montée
   * suffit à le prouver. Un canal à 0x00 (pas juste après un BREAK) ou un start
   * code non nul (RDM, texte) ne déclenchent donc pas.
   *
   * On lit la même courbe que la vue (inversée, échantillonnée) et on relit les
   * trois fronts d'avant `depuis` : en plein run, la salve peut couper la trame
   * entre le BREAK et la montée qui confirme le START code.
   */
  private chercherStartDmx(v: VoieCapture, depuis: number, jusqua: number): number | null {
    const bit = 1000 / (this.bauds.get(v.voie) ?? BAUDS_DMX);
    const breakMs = breakDmxMinMs(bit);
    const i = premierApres(v.fronts, depuis);
    const t0 = v.fronts[Math.max(0, i - 3)]!.t;
    const { entrant, fronts } = this.fenetre(v.voie, t0, jusqua);
    let niveau = entrant;
    /** Début du palier bas en cours, null si on ne l'a pas vu commencer. */
    let tBas: number | null = null;
    /** Vrai entre la fin d'un BREAK et le front descendant qui suit. */
    let apresBreak = false;
    /** Start bit du créneau en cours quand c'est un START code. */
    let tStart: number | null = null;
    for (const f of fronts) {
      if (f.niveau === 0) {
        tBas = niveau === 1 ? f.t : null;
        tStart = apresBreak && tBas !== null ? tBas : null;
        apresBreak = false;
      } else if (niveau === 0 && tBas !== null) {
        const bas = f.t - tBas;
        if (tStart !== null && Math.abs(bas / bit - 9) <= 0.5) {
          // Armé en plein run : seuls les START codes à venir comptent.
          if (f.t > depuis && tStart > this.armeDepuis) return tStart;
        }
        apresBreak = bas >= breakMs;
        tStart = null;
      } else {
        apresBreak = false;
        tStart = null;
      }
      niveau = f.niveau;
    }
    return null;
  }

  /**
   * Premier début de trame du décodage de la voie surveillée, dans ]depuis,
   * jusqua] et postérieur à l'armement.
   *
   * Le décodeur lui-même dit où s'ouvre une trame (`Annotation.trame`) : un
   * seul endroit connaît les règles de chaque bus, la vue et le déclenchement
   * ne peuvent pas diverger. On décode la même lecture que la vue (inversée,
   * échantillonnée), toutes les voies du décodage — le START d'un I²C se lit
   * sur SDA ET SCL.
   *
   * En plein run, on relit `RECUL_TRAME_MS` avant `depuis` : une ouverture de
   * trame ne se reconnaît qu'une fois finie (le BREAK à sa remontée), et elle a
   * pu commencer dans la salve d'avant. Sans rien trouver jusqu'ici, aucune
   * trame postérieure à l'armement n'était encore complète : la première qu'on
   * trouve est donc la bonne.
   */
  private chercherTrame(depuis: number, jusqua: number): number | null {
    const r = this.reglageTrame();
    if (!r) return null;
    const numeros = new Set<number>();
    for (const role of rolesDe(r.protocole)) {
      const n = r[role.cle];
      if (typeof n === 'number' && n >= 0 && this.voies.has(n)) numeros.add(n);
    }
    const complet = !Number.isFinite(depuis);
    let t0 = depuis - RECUL_TRAME_MS;
    if (complet) {
      t0 = Infinity;
      for (const n of numeros) t0 = Math.min(t0, this.voies.get(n)!.fronts[0]?.t ?? Infinity);
      if (!Number.isFinite(t0)) return null;
    }
    const voies: VoieCapture[] = [...numeros].map((n) => {
      const v = this.voies.get(n)!;
      const f = this.fenetre(n, t0, jusqua);
      return { ...v, niveauInitial: f.entrant, fronts: f.fronts };
    });
    // Toute la capture : son premier caractère suit bien le repos de la ligne.
    // Une fenêtre de recul : son début n'a pas ce qui le précède.
    const apres = Math.max(this.armeDepuis, complet ? -Infinity : t0 + GARDE_TRAME_MS);
    for (const t of debutsDeTrame(voies, [r])) {
      if (t > jusqua) break;
      if (t > apres) return t;
    }
    return null;
  }

  /**
   * Décodages posés dans la vue, avec les seuils de leur voie : le
   * déclenchement `trame` décode comme la vue.
   */
  private decodages: ReglageDecodage[] = [];

  /** Décodage de la voie surveillée, s'il est complet. */
  private reglageTrame(): ReglageDecodage | undefined {
    const d = this.declenchement;
    return d ? this.decodages.find((r) => r.donnees === d.voie && reglageComplet(r)) : undefined;
  }

  /** Déclare les décodages de la vue ; un changement de celui qui déclenche refait la recherche. */
  reglerDecodages(reglages: ReglageDecodage[]): void {
    const trame = this.declenchement?.sens === 'trame';
    const avant = trame ? JSON.stringify(this.reglageTrame() ?? null) : '';
    this.decodages = reglages.map((r) => ({ ...r }));
    if (trame && JSON.stringify(this.reglageTrame() ?? null) !== avant) this.recaler();
  }

  /**
   * Vitesse de chaque voie, en bauds (réglages de voie). Seul le déclenchement
   * sur START code DMX s'en sert : c'est elle qui dit combien dure un bit.
   */
  private bauds = new Map<number, number>();

  /** Déclare la vitesse des voies qui en règlent une ; les autres restent à 250 kbauds. */
  reglerVitesses(parVoie: Map<number, number>): void {
    const d = this.declenchement;
    const avant = d ? this.bauds.get(d.voie) : undefined;
    this.bauds = new Map(parVoie);
    if (d?.sens === 'dmxStart' && this.bauds.get(d.voie) !== avant) this.recaler();
  }

  /**
   * Poursuit la recherche du déclenchement sur ce que la voie vient de recevoir.
   * Seul le PREMIER front qui répond compte : un déclenchement qui se
   * redéplacerait à chaque front ferait glisser l'écran sans arrêt.
   *
   * Échantillonnée, on ne lit que les intervalles CLOS : un front encore à venir
   * peut changer la lecture de celui qui est en cours, et un déclenchement posé
   * trop tôt ne se reprend pas.
   */
  private suivreDeclenchement(v: VoieCapture): void {
    const d = this.declenchement;
    if (!d || this.tDeclenche !== null || v.voie !== d.voie) return;
    const borne = this.plein ? this.tDernier : this.tVu;
    const jusqua = this.periode > 0 ? Math.floor(borne / this.periode) * this.periode : borne;
    if (jusqua <= this.luJusqua) return;
    this.tDeclenche = this.chercher(this.luJusqua, jusqua);
    // Voie encore vide : rien n'a été lu, un premier front à t = 0 doit rester visible.
    if (this.tDeclenche === null && v.fronts.length > 0) this.luJusqua = jusqua;
  }

  /**
   * La LECTURE a changé (échantillonnage, inversion) : on refait la recherche
   * depuis l'armement, sur ce qui est déjà capturé. Sans cela l'origine restait
   * posée sur un front que la courbe ne montre plus.
   */
  private recaler(): void {
    const d = this.declenchement;
    if (!d) return;
    const v = this.voies.get(d.voie);
    this.tDeclenche = null;
    this.luJusqua = this.armeDepuis;
    if (v) this.suivreDeclenchement(v);
  }

  /**
   * Vrai si un front atteignant `niveau` sur la voie répond au déclenchement.
   * Le sens se lit sur la courbe AFFICHÉE : une voie lue à l'envers qu'on voit
   * monter déclenche sur « montant », comme l'élève le voit.
   */
  private repond(v: VoieCapture, niveau: 0 | 1): boolean {
    const d = this.declenchement;
    if (!d || v.voie !== d.voie) return false;
    const vu = this.inversees.has(v.voie) ? 1 - niveau : niveau;
    return vu === (d.sens === 'rising' ? 1 : 0);
  }

  get reglageDeclenchement(): Declenchement | null {
    return this.declenchement;
  }

  /** Nouveau run : tout est oublié, les voies restent déclarées. */
  reinitialiser(): void {
    for (const v of this.voies.values()) {
      v.fronts = [];
      v.niveauInitial = null;
      delete v.perte;
    }
    this.tDernier = 0;
    this.tVu = 0;
    this.tDeclenche = null;
    this.armeDepuis = this.luJusqua = -Infinity;
    this.armee = this.declenchement !== null;
    this.plein = false;
    this.aVider = false;
    this.niveauxHors.clear();
  }

  /**
   * Nouvelle acquisition EN PLEIN RUN (capture pleine, déclenchement réarmé).
   * L'histoire est oubliée, mais pas le niveau où chaque voie se trouve : il
   * vaut à partir de maintenant, et la vue n'a pas à le redessiner inconnu.
   */
  private repartir(): void {
    const t = Math.max(this.tVu, this.tDernier);
    for (const v of this.voies.values()) {
      const n = this.niveauxHors.get(v.pin) ?? v.fronts.at(-1)?.niveau ?? v.niveauInitial;
      v.fronts = [];
      v.niveauInitial = n;
      if (n === null) delete v.perte;
      else v.perte = t;
    }
    this.tDernier = t;
    this.plein = false;
    this.aVider = false;
    this.niveauxHors.clear();
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
    if (this.aVider) this.repartir();
    for (const [pin, plat] of Object.entries(salves)) {
      for (const v of this.parPin.get(pin) ?? []) this.verserVoie(v, pin, plat);
    }
    // Échantillonnée, la lecture d'un front ne tombe qu'au tic suivant : une
    // voie qui ne bouge plus (TRIG monté une seule fois) doit être relue quand
    // le temps avance sur les AUTRES voies, sinon son front n'était jamais lu.
    const d = this.declenchement;
    const vd = d ? this.voies.get(d.voie) : undefined;
    if (vd) this.suivreDeclenchement(vd);
  }

  /** Verse les fronts d'une broche dans UNE des voies qui l'écoutent. */
  private verserVoie(v: VoieCapture, pin: string, plat: number[]): void {
    for (let i = 0; i + 1 < plat.length; i += 2) {
      const t = plat[i]!;
      const niveau: 0 | 1 = plat[i + 1] ? 1 : 0;
      if (t > this.tVu) this.tVu = t;
      // Capture pleine : un front d'APRÈS l'instant où elle s'est remplie
      // n'entre plus, on retient seulement où en est la broche pour la
      // prochaine acquisition. Un front d'AVANT, si : il arrive dans la
      // salve même où une broche versée plus tôt a rempli la capture, et le
      // jeter laissait cette voie plate juste avant la fin (sur toute une
      // tranche quand une page rechargée rejoue sa mesure).
      if (this.plein && (t > this.tDernier || v.fronts.length >= this.profondeurMax)) {
        this.niveauxHors.set(pin, niveau);
        continue;
      }
      // Le niveau AVANT le premier front se déduit de ce premier front : une
      // broche qui monte était basse, et inversement. C'est la seule
      // information fiable sur le passé qu'on n'a pas observé.
      if (v.fronts.length === 0 && v.niveauInitial === null) {
        v.niveauInitial = niveau === 1 ? 0 : 1;
      }
      v.fronts.push({ t, niveau });
      if (t > this.tDernier) this.tDernier = t;
    }
    // Avant le rabot : ce qui va être jeté doit avoir été lu. Sauf pour un début
    // de trame : il se décode sur PLUSIEURS voies, qui n'ont pas encore reçu
    // cette salve — SDA lue avant SCL voyait des START partout. `verser` le
    // cherche une fois toutes les broches versées.
    if (this.declenchement?.sens !== 'trame') this.suivreDeclenchement(v);
    if (!this.plein) this.raboter(v);
  }


  /**
   * Verse une capture ENTIÈRE comme le moteur l'aurait versée en direct : par
   * tranches de temps, toutes broches ensemble. D'un seul bloc, broche après
   * broche, une capture qui se remplit (déclenchement survenu, profondeur
   * atteinte) le faisait sur la première broche versée, et les suivantes,
   * rendues trop tard, restaient vides. Sert au journal de session rendu à une
   * page rechargée : il dépasse souvent de loin la profondeur de la page.
   */
  rejouer(salves: Record<string, number[]>): void {
    const pins = Object.keys(salves).filter((p) => Array.isArray(salves[p]) && salves[p]!.length >= 2);
    const pos = new Map<string, number>(pins.map((p) => [p, 0]));
    for (;;) {
      // Borne de la tranche : l'instant le plus proche atteint en avançant
      // chaque broche de TRANCHE_REJEU fronts. La broche qui la fixe avance
      // donc toujours, la boucle finit.
      let borne = Infinity;
      for (const p of pins) {
        const plat = salves[p]!;
        const i = pos.get(p)!;
        if (i + 1 >= plat.length) continue;
        const j = Math.min(i + 2 * TRANCHE_REJEU, plat.length - (plat.length % 2)) - 2;
        borne = Math.min(borne, plat[j]!);
      }
      if (borne === Infinity) return;
      const tranche: Record<string, number[]> = {};
      for (const p of pins) {
        const plat = salves[p]!;
        const debut = pos.get(p)!;
        let i = debut;
        while (i + 1 < plat.length && plat[i]! <= borne) i += 2;
        if (i > debut) tranche[p] = plat.slice(debut, i);
        pos.set(p, i);
      }
      this.verser(tranche);
    }
  }

  /**
   * Tient une voie sous le plafond.
   *
   * Sans déclenchement survenu, on jette les plus VIEUX fronts : l'écran suit
   * la fin de la capture. Une fois le déclenchement survenu, on ne jette plus
   * que ce qui le PRÉCÈDE au-delà de la réserve ; quand ce qui le SUIT remplit
   * à son tour la profondeur, la capture est pleine et s'arrête — c'est la
   * mesure autour de l'événement qu'on a demandé de saisir, pas la fin du run.
   *
   * Ce qu'on jette laisse une trace : `perte`, l'instant avant lequel le niveau
   * n'est plus connu. Sans elle, une vue posée sur la partie jetée dessinait le
   * niveau initial recalculé à chaque salve — un trait plat qui basculait haut,
   * bas, haut à chaque image (sonde-logique-uno, Frank 23/09).
   */
  private raboter(v: VoieCapture): void {
    const max = this.profondeurMax;
    const trop = v.fronts.length - max;
    if (trop <= 0) return;
    let jetables = trop;
    if (this.tDeclenche !== null) {
      const avant = premierDes(v.fronts, this.tDeclenche);
      jetables = Math.min(trop, Math.max(0, avant - this.reserveAvant));
    }
    if (jetables > 0) {
      const dernierJete = v.fronts[jetables - 1]!;
      v.perte = dernierJete.t;
      v.niveauInitial = dernierJete.niveau;
      v.fronts.splice(0, jetables);
    }
    if (v.fronts.length > max) this.remplir(v.fronts[max - 1]!.t);
  }

  /**
   * La capture est pleine à l'instant `t` : toutes les voies s'arrêtent LÀ,
   * ensemble. Une voie qui garderait des fronts plus tardifs que les autres
   * ferait croire, au-delà de `t`, que les autres n'ont plus bougé.
   */
  private remplir(t: number): void {
    for (const v of this.voies.values()) {
      const garde = premierApres(v.fronts, t);
      if (garde < v.fronts.length) {
        // Déjà retenu : une profondeur réduite recoupe une capture déjà pleine,
        // et son dernier front n'est plus le niveau actuel de la broche.
        if (!this.niveauxHors.has(v.pin)) this.niveauxHors.set(v.pin, v.fronts.at(-1)!.niveau);
        v.fronts.length = garde;
      }
    }
    this.tDernier = t;
    this.plein = true;
  }

  /**
   * Voies lues à l'envers (niveau au repos à 1). L'inversion est appliquée EN
   * SORTIE, sur `niveauA` et `fenetre` : la capture garde ce que le moteur a
   * mesuré, et une voie qu'on remet à l'endroit retrouve ses vrais fronts sans
   * qu'on ait rien à recapturer.
   */
  private inversees = new Set<number>();

  /** Déclare les voies à lire à l'envers (lignes actives-bas). */
  reglerInversion(voies: Iterable<number>): void {
    const avant = this.inversees;
    this.inversees = new Set(voies);
    const d = this.declenchement;
    if (d && avant.has(d.voie) !== this.inversees.has(d.voie)) this.recaler();
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
    const periode = hz > 0 ? 1000 / hz : 0;
    if (periode === this.periode) return;
    this.periode = periode;
    this.recaler();
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

  /**
   * Niveau d'une voie à un instant donné (pour le réticule de la vue), tel que
   * l'instrument le montre : inversé si la voie l'est, lu au dernier tic si la
   * capture est échantillonnée. Rend null quand il n'est pas connu — jamais
   * observé, ou tombé dans la partie jetée par le plafond.
   */
  niveauA(voie: number, t: number): 0 | 1 | null {
    const v = this.voies.get(voie);
    if (!v) return null;
    const perte = v.perte ?? -Infinity;
    let n: 0 | 1 | null;
    if (this.periode > 0) {
      // Lecture du dernier tic : le niveau laissé par les intervalles d'avant.
      const k = Math.floor(t / this.periode);
      const i = this.debutIntervalle(v.fronts, k);
      n = i > 0 ? v.fronts[i - 1]!.niveau : k * this.periode > perte ? v.niveauInitial : null;
    } else {
      const i = premierApres(v.fronts, t);
      n = i > 0 ? v.fronts[i - 1]!.niveau : t >= perte ? v.niveauInitial : null;
    }
    return n === null || !this.inversees.has(voie) ? n : n === 1 ? 0 : 1;
  }

  /**
   * Premier indice dont le front tombe dans l'intervalle d'échantillon `k` ou
   * après. La dichotomie compare des instants, `echantillonner` des numéros
   * d'intervalle : on recale sur ces derniers, seuls juges aux arrondis près.
   */
  private debutIntervalle(fronts: Front[], k: number): number {
    const p = this.periode;
    let i = premierDes(fronts, k * p);
    while (i > 0 && Math.floor(fronts[i - 1]!.t / p) >= k) i--;
    while (i < fronts.length && Math.floor(fronts[i]!.t / p) < k) i++;
    return i;
  }

  /**
   * Fronts d'une voie dans une fenêtre de temps, avec le niveau qui ENTRE par
   * le bord gauche. La vue en a besoin pour dessiner un créneau qui commence
   * avant la fenêtre : sans ce niveau d'entrée, le trait partirait du vide.
   *
   * `connuDepuis` : quand le début de la fenêtre tombe dans la partie jetée par
   * le plafond, l'instant où le niveau redevient connu — `entrant` vaut alors
   * pour cet instant-là, et la vue dessine « inconnu » avant. Null sinon.
   *
   * Échantillonnée, la fenêtre part du dernier tic avant `t0`, et `entrant` est
   * CE qu'il a lu : le niveau d'entrée et les fronts viennent de la même
   * lecture. Prendre le niveau vrai à `t0` dessinait un premier palier que
   * l'instrument n'a jamais vu.
   */
  fenetre(
    voie: number,
    t0: number,
    t1: number
  ): { entrant: 0 | 1 | null; fronts: Front[]; connuDepuis: number | null } {
    const v = this.voies.get(voie);
    if (!v) return { entrant: null, fronts: [], connuDepuis: null };
    const perte = v.perte ?? -Infinity;
    const p = this.periode;
    // Début de la partie connue : t0 lui-même, ou le premier instant d'où
    // l'instrument sait de nouveau ce que vaut la broche.
    let debut: number;
    let i: number;
    if (p > 0) {
      let k = Math.floor(t0 / p);
      // Le tic qui lit un intervalle entamé avant la perte ne sait rien : le
      // premier tic sûr est celui qui suit l'intervalle de la perte.
      if (k * p <= perte) k = Math.floor(perte / p) + 1;
      debut = k * p;
      i = this.debutIntervalle(v.fronts, k);
    } else {
      debut = Math.max(t0, perte);
      i = debut > t0 ? premierApres(v.fronts, debut) : premierDes(v.fronts, t0);
    }
    if (debut > t1) return { entrant: null, fronts: [], connuDepuis: null };
    const entrantBrut = i > 0 ? v.fronts[i - 1]!.niveau : v.niveauInitial;
    const tranche = v.fronts.slice(i, premierApres(v.fronts, t1));
    const fronts = p > 0 ? this.echantillonner(tranche, entrantBrut).filter((f) => f.t <= t1) : tranche;
    const inv = this.inversees.has(voie);
    return {
      entrant: entrantBrut === null || !inv ? entrantBrut : entrantBrut === 1 ? 0 : 1,
      fronts: inv ? fronts.map((f) => ({ t: f.t, niveau: (f.niveau === 1 ? 0 : 1) as 0 | 1 })) : fronts,
      connuDepuis: debut > t0 ? debut : null,
    };
  }
}
