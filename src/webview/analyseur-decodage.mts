// Décodage de protocoles À PARTIR DES CRÉNEAUX capturés par l'analyseur.
//
// LE PRINCIPE. Rien ici ne demande quoi que ce soit au moteur : on ne lit que
// les fronts déjà capturés (`VoieCapture`). C'est ce que fait un vrai analyseur
// logique, et c'est la seule voie honnête — ce que le décodeur annonce est
// forcément ce que la vue dessine. Un décodage qui viendrait du moteur pourrait
// afficher « 0x42 » là où les créneaux montrent autre chose (fil mal branché,
// broche sondée qui n'est pas celle qui parle) : l'élève ne verrait jamais son
// erreur.
//
// LE TEMPS. Les instants sont en MILLISECONDES SIMULÉES (doubles). Les durées
// de bit sont donc minuscules : 4 µs = 0.004 ms à 250 kbauds. On garde les ms
// partout pour ne pas multiplier les conversions, et on compare les durées avec
// une tolérance relative.
//
// CE QUI SORT. Chaque décodeur rend une liste d'ANNOTATIONS : un intervalle de
// temps, un texte court, et une nature qui dit comment le colorer. La vue les
// pose sous les créneaux, sans rien savoir des protocoles.

import type { Front, VoieCapture } from './analyseur-capture.mjs';

/** Nature d'une annotation : la vue s'en sert pour le style. */
export type NatureAnnotation =
  /** Délimiteur de trame (START, STOP, BREAK, sélection CS…). */
  | 'cadre'
  /** Une donnée lue (octet, adresse). */
  | 'donnee'
  /** Un acquittement ou un bit de contrôle. */
  | 'controle'
  /** Une anomalie : cadrage impossible, trame tronquée. */
  | 'erreur';

/** Un élément décodé, posé sur la piste de temps. */
export interface Annotation {
  /** Début, en ms simulées. */
  t0: number;
  /** Fin, en ms simulées (t0 === t1 pour un événement ponctuel). */
  t1: number;
  /** Texte affiché (court : il doit tenir dans l'intervalle). */
  texte: string;
  nature: NatureAnnotation;
  /**
   * Voie sous laquelle poser l'annotation : la ligne de DONNÉES du décodage qui
   * l'a produite. Indispensable depuis qu'on décode plusieurs protocoles à la
   * fois (v2026.9.4.94) — tout empiler sous la dernière piste mélangeait les
   * trames de deux bus. Absente (anciens appels), la vue retombe sur la
   * dernière piste, comme avant.
   */
  voie?: number;
}

/** Protocoles décodables. */
export type Protocole = 'i2c' | 'spi' | 'dmx';

/** Affectation des voies à un décodeur (indices de voie, -1 = non affectée). */
export interface ReglageDecodage {
  protocole: Protocole;
  /** I²C : horloge. SPI : horloge. DMX : inutilisé. */
  horloge?: number;
  /** I²C : SDA. SPI : MOSI. DMX : la ligne de données. */
  donnees?: number;
  /** SPI : MISO (facultatif). */
  donnees2?: number;
  /** SPI : sélection d'esclave (facultatif ; sans elle, une seule trame). */
  selection?: number;
  /** SPI : mode 0..3 (CPOL/CPHA). */
  mode?: 0 | 1 | 2 | 3;
  /** DMX : vitesse en bauds (250 000 par la norme). */
  bauds?: number;
  /**
   * Tolérance relative sur la durée d'un bit (0,25 = ±25 %). Un palier qui
   * tombe au-delà est signalé comme mal cadré au lieu d'être arrondi en
   * silence : un signal qui dérive donnait jusqu'ici des octets faux sans que
   * rien ne dise pourquoi.
   */
  tolerance?: number;
  /**
   * Identifiant stable du réglage, pour que l'interface puisse en éditer un
   * parmi plusieurs sans se tromper de ligne. Le décodage ne s'en sert pas.
   */
  id?: string;
}

/**
 * Réglages propres à UNE voie, indépendants de tout protocole : ils changent
 * ce que la voie MONTRE, pas ce qu'elle a capturé.
 *
 * Ils sont volontairement séparés du réglage de décodage : une voie garde son
 * nom et son sens de lecture même quand aucun protocole n'est choisi, et deux
 * décodages qui partagent une voie doivent la voir pareil.
 */
export interface ReglageVoie {
  /**
   * Nom affiché à la place de celui déduit de la broche. Vide = on garde le
   * nom automatique, qui suit la pince quand on la déplace.
   */
  nom?: string;
  /**
   * Indice de teinte dans la palette des voies. Absent = la teinte de l'indice
   * de la voie, celle de la pince sur la planche.
   */
  couleur?: number;
  /**
   * Niveau au repos. `1` inverse la lecture : la voie est dessinée et décodée
   * à l'envers, ce qu'il faut pour toute ligne ACTIVE-BAS (RESET, CS, un bus
   * à collecteur ouvert sans tirage) — sans quoi l'élève lit le complément de
   * ses octets sans savoir pourquoi.
   */
  repos?: 0 | 1;
  /** Voie masquée : elle garde sa capture, elle n'est plus dessinée. */
  masquee?: boolean;
  /**
   * Vitesse propre à cette voie, en bauds, pour une ligne série. Elle prime sur
   * le `bauds` du réglage de décodage : deux lignes série d'un même montage ne
   * tournent pas forcément à la même vitesse.
   */
  bauds?: number;
  /**
   * Tolérance relative sur la durée d'un bit (0,25 = ±25 %). Sert aux
   * décodeurs qui cadrent sur une durée. Absente = la valeur par défaut du
   * décodeur, qui convient à un signal propre.
   */
  tolerance?: number;
}

/** Réglages de voie, par indice de voie. */
export type ReglagesVoies = Record<number, ReglageVoie>;

// L'INVERSION N'EST PAS ICI. Une voie réglée active-bas est inversée par la
// capture elle-même (`AnalyseurCapture.reglerInversion`), en sortie de
// `niveauA` et `fenetre`. C'est le seul endroit qui garantit que ce que l'élève
// VOIT est ce que le décodeur a LU : inverser d'un côté seulement donnerait un
// créneau qui contredit les octets affichés dessous.

/** Deux chiffres hexadécimaux, majuscules. */
function hex2(n: number): string {
  return `0x${n.toString(16).toUpperCase().padStart(2, '0')}`;
}

/**
 * Niveau d'une voie juste AVANT l'instant `t`, en balayant ses fronts dans
 * l'ordre. Les décodeurs avancent dans le temps, donc on leur donne un curseur
 * qui ne revient jamais en arrière : une recherche dichotomique par bit
 * coûterait un log N pour rien.
 */
class Lecteur {
  private i = 0;
  private niveau: 0 | 1 | null;

  constructor(private readonly fronts: Front[], niveauInitial: 0 | 1 | null) {
    this.niveau = niveauInitial;
  }

  /**
   * Niveau à l'instant `t`, fronts strictement antérieurs ou égaux compris.
   * Un front EXACTEMENT à `t` compte : c'est le cas normal quand on échantillonne
   * une donnée sur le front d'horloge alors que les deux ont basculé ensemble —
   * la donnée a été posée avant, l'horloge la valide.
   */
  a(t: number): 0 | 1 | null {
    while (this.i < this.fronts.length && this.fronts[this.i]!.t <= t) {
      this.niveau = this.fronts[this.i]!.niveau;
      this.i += 1;
    }
    return this.niveau;
  }
}

/** Voie par indice, ou null. */
function voie(voies: VoieCapture[], idx: number | undefined): VoieCapture | null {
  if (idx === undefined || idx < 0) return null;
  return voies.find((v) => v.voie === idx) ?? null;
}

/** Fronts d'un sens donné, dans l'ordre du temps. */
function frontsDe(v: VoieCapture, niveau: 0 | 1): Front[] {
  return v.fronts.filter((f) => f.niveau === niveau);
}

// --- I²C ---------------------------------------------------------------------

/**
 * I²C. Deux règles suffisent et ce sont celles de la norme :
 *  - la DONNÉE est valide pendant que SCL est haut, donc on l'échantillonne sur
 *    le front MONTANT de SCL ;
 *  - un changement de SDA PENDANT que SCL est haut n'est pas une donnée, c'est
 *    un START (SDA descend) ou un STOP (SDA monte).
 *
 * Le décodeur suit donc les fronts de SDA entre deux fronts d'horloge pour
 * repérer les délimiteurs, et compte les bits de 9 en 9 : huit de donnée, un
 * d'acquittement. Le premier octet après un START est l'adresse — son bit 0
 * porte le sens (lecture/écriture), ce qu'on affiche en clair parce que c'est
 * l'erreur de câblage la plus fréquente (adresse décalée d'un bit).
 */
function decoderI2c(voies: VoieCapture[], r: ReglageDecodage): Annotation[] {
  const scl = voie(voies, r.horloge);
  const sda = voie(voies, r.donnees);
  if (!scl || !sda) return [];

  const out: Annotation[] = [];
  const lecteurSda = new Lecteur(sda.fronts, sda.niveauInitial);
  // Les fronts de SDA servent à repérer START/STOP : on les parcourt en
  // parallèle de l'horloge, avec un curseur propre.
  let iSda = 0;
  const sclLect = new Lecteur(scl.fronts, scl.niveauInitial);

  /** État de l'octet en cours. */
  let bits = 0;
  let acc = 0;
  let debutOctet = 0;
  /** Vrai quand le prochain octet complet est l'adresse. */
  let attendAdresse = false;
  /** Vrai entre un START et son STOP. */
  let dansTrame = false;

  /**
   * Consomme les fronts de SDA antérieurs à `limite` : ceux qui tombent horloge
   * HAUTE sont des délimiteurs (START / STOP), les autres sont de la donnée que
   * l'échantillonnage sur front montant lira en son temps.
   */
  const delimiteurs = (limite: number): void => {
    while (iSda < sda.fronts.length && sda.fronts[iSda]!.t < limite) {
      const fs = sda.fronts[iSda]!;
      iSda += 1;
      if (sclLect.a(fs.t) !== 1) continue; // SDA a bougé horloge basse : donnée
      if (fs.niveau === 0) {
        out.push({
          t0: fs.t,
          t1: fs.t,
          texte: dansTrame ? 'START rép.' : 'START',
          nature: 'cadre',
        });
        dansTrame = true;
        attendAdresse = true;
        bits = 0;
        acc = 0;
      } else {
        if (!dansTrame) continue; // SDA remonte hors trame : pas un STOP
        out.push({ t0: fs.t, t1: fs.t, texte: 'STOP', nature: 'cadre' });
        if (bits > 0) {
          out.push({ t0: debutOctet, t1: fs.t, texte: 'tronqué', nature: 'erreur' });
        }
        dansTrame = false;
        attendAdresse = false;
        bits = 0;
        acc = 0;
      }
    }
  };

  for (const f of scl.fronts) {
    // Avant de traiter ce front d'horloge, tout front de SDA survenu pendant que
    // SCL était haut est un délimiteur.
    delimiteurs(f.t);
    sclLect.a(f.t);
    if (f.niveau !== 1) continue; // on n'échantillonne que sur le front montant
    if (!dansTrame) continue; // bits hors trame : rien à en dire

    const bit = lecteurSda.a(f.t);
    if (bit === null) continue; // SDA jamais observée : on ne devine pas

    if (bits === 0) debutOctet = f.t;
    if (bits < 8) {
      acc = (acc << 1) | bit; // I²C : MSB en premier
      bits += 1;
      if (bits === 8) {
        if (attendAdresse) {
          const adr = acc >> 1;
          const sens = (acc & 1) === 1 ? 'R' : 'W';
          out.push({
            t0: debutOctet,
            t1: f.t,
            texte: `adr ${hex2(adr)} ${sens}`,
            nature: 'donnee',
          });
          attendAdresse = false;
        } else {
          out.push({ t0: debutOctet, t1: f.t, texte: hex2(acc), nature: 'donnee' });
        }
      }
      continue;
    }
    // Neuvième impulsion : l'acquittement. SDA bas = ACK (l'esclave tire la
    // ligne), SDA haut = NACK (personne n'a répondu, ou fin de lecture).
    out.push({
      t0: f.t,
      t1: f.t,
      texte: bit === 0 ? 'ACK' : 'NACK',
      nature: 'controle',
    });
    bits = 0;
    acc = 0;
  }
  // Le STOP est le DERNIER front de la trame : il tombe après la dernière
  // impulsion d'horloge. Sans cette purge, la fin de toute trame I²C serait
  // muette — le défaut passe inaperçu tant qu'on ne regarde que le milieu.
  delimiteurs(Number.POSITIVE_INFINITY);
  return out;
}

// --- SPI ---------------------------------------------------------------------

/**
 * SPI. Le mode donne tout : CPOL dit au repos si l'horloge est haute, CPHA si
 * la donnée s'échantillonne sur le premier ou le second front de chaque période.
 * En pratique cela se ramène à « échantillonner sur les fronts montants » ou
 * « sur les fronts descendants » :
 *   mode 0 (CPOL 0, CPHA 0) → montant
 *   mode 1 (CPOL 0, CPHA 1) → descendant
 *   mode 2 (CPOL 1, CPHA 0) → descendant
 *   mode 3 (CPOL 1, CPHA 1) → montant
 *
 * CS (actif bas) cadre les trames. Sans voie CS, tout l'enregistrement est une
 * seule trame — utile quand l'élève n'a que deux pinces libres, et c'est le seul
 * cas où le décodage peut se décaler si l'horloge a bougé avant la première
 * sélection.
 */
function decoderSpi(voies: VoieCapture[], r: ReglageDecodage): Annotation[] {
  const sck = voie(voies, r.horloge);
  const mosi = voie(voies, r.donnees);
  const miso = voie(voies, r.donnees2);
  const cs = voie(voies, r.selection);
  if (!sck || (!mosi && !miso)) return [];

  const mode = r.mode ?? 0;
  const surMontant = mode === 0 || mode === 3;
  const out: Annotation[] = [];

  const lMosi = mosi ? new Lecteur(mosi.fronts, mosi.niveauInitial) : null;
  const lMiso = miso ? new Lecteur(miso.fronts, miso.niveauInitial) : null;
  const lCs = cs ? new Lecteur(cs.fronts, cs.niveauInitial) : null;

  let bits = 0;
  let accMosi = 0;
  let accMiso = 0;
  let debutOctet = 0;
  /** État de sélection au front précédent, pour repérer les bascules de CS. */
  let selPrec: 0 | 1 | null = null;

  // Les changements de CS s'annoncent pour eux-mêmes, indépendamment de
  // l'horloge : une sélection sans un seul coup d'horloge est une information.
  if (cs) {
    for (const f of cs.fronts) {
      out.push({
        t0: f.t,
        t1: f.t,
        texte: f.niveau === 0 ? 'CS ↓' : 'CS ↑',
        nature: 'cadre',
      });
    }
  }

  for (const f of sck.fronts) {
    const attendu = surMontant ? 1 : 0;
    const sel = lCs ? lCs.a(f.t) : 0;
    // CS relâché : la trame se ferme, un octet incomplet est une anomalie.
    if (selPrec === 0 && sel !== 0 && bits > 0) {
      out.push({ t0: debutOctet, t1: f.t, texte: `${bits} bits`, nature: 'erreur' });
      bits = 0;
      accMosi = 0;
      accMiso = 0;
    }
    if (selPrec !== 0 && sel === 0) {
      bits = 0;
      accMosi = 0;
      accMiso = 0;
    }
    selPrec = sel === null ? null : sel === 0 ? 0 : 1;
    if (sel !== 0 && cs) continue; // esclave non sélectionné : l'horloge ne compte pas
    if (f.niveau !== attendu) continue;

    const bM = lMosi ? lMosi.a(f.t) : null;
    const bS = lMiso ? lMiso.a(f.t) : null;
    if (bits === 0) debutOctet = f.t;
    accMosi = (accMosi << 1) | (bM ?? 0); // SPI : MSB en premier
    accMiso = (accMiso << 1) | (bS ?? 0);
    bits += 1;
    if (bits === 8) {
      const parts: string[] = [];
      if (mosi) parts.push(`MOSI ${hex2(accMosi)}`);
      if (miso) parts.push(`MISO ${hex2(accMiso)}`);
      out.push({ t0: debutOctet, t1: f.t, texte: parts.join(' · '), nature: 'donnee' });
      bits = 0;
      accMosi = 0;
      accMiso = 0;
    }
  }
  // Octet resté en l'air à la fin de la capture : on le signale plutôt que de le
  // taire — c'est souvent une horloge sondée sur la mauvaise broche.
  if (bits > 0) {
    out.push({
      t0: debutOctet,
      t1: sck.fronts[sck.fronts.length - 1]?.t ?? debutOctet,
      texte: `${bits} bits`,
      nature: 'erreur',
    });
  }
  return out;
}

// --- DMX512 ------------------------------------------------------------------

/** Silence bas minimal ouvrant une trame DMX, en µs (norme). */
const DMX_BREAK_US = 88;

/**
 * DMX512 depuis les fronts d'UNE seule ligne. Une trame s'ouvre sur un BREAK
 * (ligne basse ≥ 88 µs), suivi du MAB (haut ≥ 8 µs), puis d'octets 8N2 à
 * 250 kbauds : start bit à 0, huit bits LSB d'abord, deux stop bits à 1. Le
 * premier octet est le START CODE (0 = éclairage), les 512 suivants les canaux.
 *
 * On ne suréchantillonne pas : entre deux fronts, la durée écoulée donne le
 * NOMBRE de bits du palier (même principe que `DmxWire` dans engines/dmx.mts,
 * qui décode la ligne bit-bangée côté moteur). Le coût est proportionnel aux
 * transitions, pas au temps — indispensable ici, où un enregistrement de
 * quelques secondes contient des dizaines de trames.
 */
function decoderDmx(voies: VoieCapture[], r: ReglageDecodage): Annotation[] {
  const v = voie(voies, r.donnees);
  if (!v || v.fronts.length === 0) return [];

  const bauds = r.bauds && r.bauds > 0 ? r.bauds : 250_000;
  /** Durée d'un bit en ms simulées. */
  const bitMs = 1000 / bauds;
  /**
   * Écart admis entre la durée mesurée d'un palier et un nombre entier de bits.
   * 0,25 bit par défaut : au-delà, un signal propre ne dérive pas — c'est le
   * réglage de vitesse qui est faux.
   */
  const tol = r.tolerance && r.tolerance > 0 ? r.tolerance : 0.25;
  const breakMs = DMX_BREAK_US / 1000;
  const out: Annotation[] = [];

  /** Bits poussés au plus pour un même palier (au repos la ligne reste haute). */
  const MAX_BITS = 16;

  let niveau: 0 | 1 = v.niveauInitial ?? 1;
  let tPalier = v.fronts[0]!.t;
  /** 0 = attente du start bit, 1..8 = données, 9 = stop. */
  let count = 0;
  let acc = 0;
  let tOctet = 0;
  /** −1 = trame ignorée (start code non nul) ; sinon position dans la trame. */
  let slot = -1;
  let attendStart = false;

  const pousserBit = (bit: 0 | 1, t: number): void => {
    if (count === 0) {
      if (bit === 0) {
        count = 1;
        acc = 0;
        tOctet = t;
      }
      return; // ligne au repos
    }
    if (count <= 8) {
      if (bit) acc |= 1 << (count - 1); // LSB en premier
      count += 1;
      return;
    }
    // Stop bit : un 0 ici est un octet mal cadré. Le second stop passera pour du
    // repos, ce qu'il est.
    count = 0;
    if (bit !== 1) {
      out.push({ t0: tOctet, t1: t, texte: 'cadrage', nature: 'erreur' });
      return;
    }
    if (attendStart) {
      attendStart = false;
      slot = acc === 0 ? 0 : -1;
      out.push({
        t0: tOctet,
        t1: t,
        texte: acc === 0 ? 'start 0' : `start ${hex2(acc)} ignoré`,
        nature: acc === 0 ? 'cadre' : 'erreur',
      });
      return;
    }
    if (slot < 0) return; // trame ignorée
    slot += 1;
    if (slot > 512) return;
    out.push({ t0: tOctet, t1: t, texte: `c${slot}=${acc}`, nature: 'donnee' });
  };

  for (const f of v.fronts) {
    const duree = f.t - tPalier;
    const fini = niveau; // le palier qui vient de se TERMINER
    niveau = f.niveau;
    tPalier = f.t;
    if (duree <= 0) continue;
    if (fini === 0 && duree >= breakMs) {
      out.push({ t0: f.t - duree, t1: f.t, texte: 'BREAK', nature: 'cadre' });
      count = 0;
      slot = -1;
      attendStart = true;
      continue;
    }
    const brut = duree / bitMs;
    const bits = Math.min(Math.round(brut), MAX_BITS);
    // Un palier qui n'est pas un multiple à peu près entier de la durée d'un
    // bit signale une vitesse mal réglée (ou un signal qui dérive). Arrondir en
    // silence donnait des octets faux sans rien dire ; on le DIT, une fois par
    // palier, et on continue de décoder — l'élève voit où ça déraille.
    if (bits > 0 && bits < MAX_BITS && Math.abs(brut - bits) > tol) {
      out.push({ t0: f.t - duree, t1: f.t, texte: 'cadrage', nature: 'erreur' });
    }
    for (let i = 0; i < bits; i++) {
      pousserBit(fini, (f.t - duree) + (i + 1) * bitMs);
    }
  }
  // Le DERNIER palier n'est terminé par aucun front : c'est le repos qui suit le
  // dernier octet, et il porte ses bits de stop. Sans cette clôture, le dernier
  // canal de toute capture serait muet — le décodeur n'aurait jamais vu son stop.
  if (count > 0 && niveau === 1) {
    for (let i = count; i <= 9; i++) {
      pousserBit(1, tPalier + (i - count + 1) * bitMs);
    }
  }
  return out;
}

// --- Entrée publique ---------------------------------------------------------

/**
 * Décode les voies capturées selon le réglage. Rend une liste vide si les voies
 * nécessaires manquent — la vue affiche alors le motif brut, ce qui reste la
 * chose utile à montrer.
 */
export function decoder(voies: VoieCapture[], r: ReglageDecodage): Annotation[] {
  const sorties = (() => {
    switch (r.protocole) {
      case 'i2c':
        return decoderI2c(voies, r);
      case 'spi':
        return decoderSpi(voies, r);
      case 'dmx':
        return decoderDmx(voies, r);
    }
  })();
  // Chaque annotation part avec SA voie de données : c'est ce qui permet à la
  // vue de poser deux décodages simultanés sous deux pistes différentes.
  const ancre = ancreDe(r);
  return ancre === undefined ? sorties : sorties.map((a) => ({ ...a, voie: ancre }));
}

/**
 * Voie de DONNÉES d'un réglage — celle sous laquelle poser ses annotations.
 * Pour SPI, MOSI d'abord : c'est la ligne que l'élève regarde, MISO ne sert
 * que si le montage lit quelque chose.
 */
function ancreDe(r: ReglageDecodage): number | undefined {
  for (const cle of ['donnees', 'donnees2', 'horloge'] as const) {
    const v = r[cle];
    if (typeof v === 'number' && v >= 0) return v;
  }
  return undefined;
}

/**
 * Décode PLUSIEURS protocoles sur la même capture et rend leurs annotations
 * fondues dans l'ordre du temps.
 *
 * Un montage porte couramment deux bus (un écran en I²C et une carte SD en SPI,
 * un DMX et son horloge) : l'analyseur n'avait qu'un protocole pour tout le
 * monde, il fallait choisir lequel des deux on renonçait à lire. Chaque réglage
 * garde ses propres voies, son mode et sa vitesse — d'où une LISTE de réglages
 * et non un réglage à plusieurs lignes.
 *
 * Les réglages incomplets sont sautés en silence : c'est l'état normal pendant
 * qu'on affecte les voies dans l'interface.
 */
export function decoderTous(voies: VoieCapture[], reglages: ReglageDecodage[]): Annotation[] {
  const out: Annotation[] = [];
  for (const r of reglages) {
    if (!reglageComplet(r)) continue;
    out.push(...decoder(voies, r));
  }
  return out.sort((a, b) => a.t0 - b.t0);
}

/**
 * Rôles de voie attendus par un protocole, pour construire l'interface de
 * réglage sans que la vue connaisse les protocoles. `obligatoire` distingue ce
 * qui bloque le décodage de ce qui l'enrichit.
 */
export function rolesDe(p: Protocole): Array<{ cle: keyof ReglageDecodage; nom: string; obligatoire: boolean }> {
  switch (p) {
    case 'i2c':
      return [
        { cle: 'horloge', nom: 'SCL', obligatoire: true },
        { cle: 'donnees', nom: 'SDA', obligatoire: true },
      ];
    case 'spi':
      return [
        { cle: 'horloge', nom: 'SCK', obligatoire: true },
        { cle: 'donnees', nom: 'MOSI', obligatoire: false },
        { cle: 'donnees2', nom: 'MISO', obligatoire: false },
        { cle: 'selection', nom: 'CS', obligatoire: false },
      ];
    case 'dmx':
      return [{ cle: 'donnees', nom: 'DMX', obligatoire: true }];
  }
}

/** Utilisé par la vue pour griser un protocole dont les voies manquent. */
export function reglageComplet(r: ReglageDecodage): boolean {
  for (const role of rolesDe(r.protocole)) {
    if (!role.obligatoire) continue;
    const idx = r[role.cle];
    if (typeof idx !== 'number' || idx < 0) return false;
  }
  if (r.protocole === 'spi') {
    const a = typeof r.donnees === 'number' && r.donnees >= 0;
    const b = typeof r.donnees2 === 'number' && r.donnees2 >= 0;
    if (!a && !b) return false; // SPI sans aucune ligne de donnée ne dit rien
  }
  return true;
}

// `frontsDe` sert aux bancs : compter les fronts d'un sens est le contrôle le
// plus simple qu'un test puisse faire sur une voie.
export { frontsDe };
