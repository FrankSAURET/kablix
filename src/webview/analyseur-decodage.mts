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
//
// LA LANGUE. Les textes passent par `t()`, clé anglaise comme partout dans le
// code (Frank, 23/09) ; les termes des normes (START, STOP, ACK, BREAK, RESET,
// commandes 1-Wire, et pour le DMX Start, MAB, PAUSE, MBB, START code — Frank,
// 24/09) restent tels quels dans les deux langues. Sans
// `initLocale()` — bancs en Node —, t() rend l'anglais.

import type { Front, VoieCapture } from './analyseur-capture.mjs';
import { locale, t } from './i18n.mjs';

/** Nature d'une annotation : la vue s'en sert pour le style. */
export type NatureAnnotation =
  /**
   * Ouverture d'un caractère ou d'une trame : start bit UART/DMX, START I²C,
   * CS ↓, RESET, départ DHT. Vert pour TOUS les protocoles (Frank, 24/09) —
   * l'œil retrouve le début d'un octet sans lire un seul texte.
   */
  | 'start'
  /** Fermeture : bits de stop UART/DMX, STOP I²C, CS ↑. Rouge, même raison. */
  | 'stop'
  /** Délimiteur de trame (BREAK, MAB, PAUSE, présence…). */
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
  /**
   * Repli plus court, écrit quand `texte` ne tient pas dans l'intervalle : la
   * valeur seule, sans les octets bruts. Sans lui, dézoomer d'un cran effaçait
   * d'un coup tout ce qui avait un sens.
   */
  court?: string;
  /**
   * Résumé d'une trame entière, qui DOUBLE les annotations détaillées posées
   * dans le même intervalle. La vue ne l'écrit que là où aucune de celles-ci
   * n'a pu écrire son texte (vue trop large), et le laisse déborder à droite
   * de la trame jusqu'à l'annotation suivante : de loin, une trame DHT de
   * 4 ms n'est qu'un trait, mais le silence d'une seconde qui la suit a toute
   * la place pour dire ce qu'elle contient.
   */
  resume?: boolean;
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

/**
 * Protocoles décodables.
 *
 * `i2c` couvre aussi ce que l'Arduino appelle TWI : c'est le même bus, seul le
 * nom de la bibliothèque change (brevet Philips oblige). Un seul décodeur donc,
 * présenté sous les deux noms dans l'interface.
 *
 * `dht` est un décodeur À PART de `onewire`, malgré le fil unique des deux : le
 * DHT n'est pas du 1-Wire Dallas. Le bit y est porté par la durée du palier
 * HAUT (28 µs = 0, 70 µs = 1) et non par celle du creux, il n'y a ni ROM ni
 * commande, et l'ordre des bits est MSB d'abord. Décoder l'un avec l'autre ne
 * rend pas des octets faux : ça n'en rend aucun.
 */
export type Protocole = 'i2c' | 'spi' | 'dmx' | 'uart' | 'onewire' | 'dht';

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
  /** DMX, UART : vitesse en bauds (250 000 par la norme DMX, 9600 par défaut). */
  bauds?: number;
  /** UART : nombre de bits de données (5 à 9, 8 par défaut). */
  bitsDonnees?: 5 | 6 | 7 | 8 | 9;
  /** UART : parité. `none` par défaut — c'est le 8N1 de tout le monde. */
  parite?: 'none' | 'even' | 'odd';
  /** UART : nombre de bits d'arrêt (1 ou 2). */
  bitsArret?: 1 | 2;
  /**
   * DHT : modèle du capteur. Les deux envoient la MÊME trame de 40 bits, avec
   * les mêmes durées — rien sur le fil ne permet de les distinguer, il faut
   * donc le dire. Ce qui change est l'INTERPRÉTATION des quatre octets : le
   * DHT22 code des dixièmes (température signée par un bit de signe), le DHT11
   * des entiers avec les décimales à zéro. `dht22` par défaut.
   */
  modele?: 'dht11' | 'dht22';
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
  // `couleur` (teinte choisie) n'existe plus depuis v2026.9.4.130 : une voie a
  // la teinte de sa pince. Un ancien .projix qui la porte est relu sans elle.
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

/** Indice du premier front d'instant ≥ `t` (dichotomie : les fronts sont triés). */
function indiceApres(fronts: Front[], t: number): number {
  let g = 0;
  let d = fronts.length;
  while (g < d) {
    const m = (g + d) >> 1;
    if (fronts[m]!.t < t) g = m + 1;
    else d = m;
  }
  return g;
}

/**
 * Premier front STRICTEMENT après `t` et avant `borne`, du sens demandé (null =
 * les deux). Sert à donner une durée aux délimiteurs d'un bus à horloge : le
 * START I²C dure jusqu'au premier front descendant de SCL qui le suit.
 */
function frontApres(fronts: Front[], t: number, borne: number, niveau: 0 | 1 | null): Front | null {
  for (let i = indiceApres(fronts, t); i < fronts.length; i++) {
    const f = fronts[i]!;
    if (f.t <= t) continue;
    if (f.t >= borne) return null;
    if (niveau === null || f.niveau === niveau) return f;
  }
  return null;
}

/** Dernier front STRICTEMENT avant `t` et après `borne`, du sens demandé (null = les deux). */
function frontAvant(fronts: Front[], t: number, borne: number, niveau: 0 | 1 | null): Front | null {
  for (let i = indiceApres(fronts, t) - 1; i >= 0; i--) {
    const f = fronts[i]!;
    if (f.t <= borne) return null;
    if (niveau === null || f.niveau === niveau) return f;
  }
  return null;
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
        // Le START dure jusqu'à ce que le maître baisse SCL pour le premier
        // bit : c'est le temps de maintien de la norme, et ça lui donne une
        // largeur à colorer au lieu d'un trait.
        const fin = frontApres(scl.fronts, fs.t, Number.POSITIVE_INFINITY, 0);
        out.push({
          t0: fs.t,
          t1: fin ? fin.t : fs.t,
          texte: dansTrame ? t('START rep.') : 'START',
          nature: 'start',
        });
        dansTrame = true;
        attendAdresse = true;
        bits = 0;
        acc = 0;
      } else {
        if (!dansTrame) continue; // SDA remonte hors trame : pas un STOP
        // Symétrique du START : du dernier front montant de SCL à la remontée
        // de SDA.
        const debut = frontAvant(scl.fronts, fs.t, Number.NEGATIVE_INFINITY, 1);
        out.push({ t0: debut ? debut.t : fs.t, t1: fs.t, texte: 'STOP', nature: 'stop' });
        if (bits > 0) {
          out.push({ t0: debutOctet, t1: fs.t, texte: t('truncated'), nature: 'erreur' });
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
            texte: t('addr {0} {1}', hex2(adr), sens),
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
  // Chacune dure jusqu'au premier coup d'horloge (sélection) ou depuis le
  // dernier (relâchement) : sans horloge dans la trame, un simple trait.
  if (cs) {
    for (let i = 0; i < cs.fronts.length; i++) {
      const f = cs.fronts[i]!;
      if (f.niveau === 0) {
        const borne = cs.fronts[i + 1]?.t ?? Number.POSITIVE_INFINITY;
        const h = frontApres(sck.fronts, f.t, borne, null);
        out.push({ t0: f.t, t1: h ? h.t : f.t, texte: 'CS ↓', nature: 'start' });
      } else {
        const borne = i > 0 ? cs.fronts[i - 1]!.t : Number.NEGATIVE_INFINITY;
        const h = frontAvant(sck.fronts, f.t, borne, null);
        out.push({ t0: h ? h.t : f.t, t1: f.t, texte: 'CS ↑', nature: 'stop' });
      }
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
 * (ligne basse ≥ 88 µs), suivi du MAB (haut ≥ 8 µs), puis de créneaux 8N2 à
 * 250 kbauds : start bit à 0, huit bits LSB d'abord, deux stop bits à 1. Le
 * premier créneau est le START CODE (0 = éclairage), les 512 suivants les
 * canaux.
 *
 * CE QUI SORT (Frank, 24/09), avec les termes de la norme, jamais traduits :
 * `BREAK`, `MAB`, puis pour chaque créneau `Start` (le start bit, vert), sa
 * valeur en hexadécimal, `STOP` (les deux bits d'arrêt, rouge) et `PAUSE` si la
 * ligne reste haute avant le créneau suivant ; `MBB` pour le repos entre le
 * dernier créneau et le BREAK qui suit. Le premier créneau se lit
 * `START code 0x00`, les canaux `c1=0xC8`.
 *
 * Même méthode que l'UART : on se recale sur le front descendant de chaque
 * start bit et on lit chaque bit en son milieu. Compter les paliers entre deux
 * fronts, comme avant, rendait bien les octets, mais ni la place du start bit
 * ni celle des pauses — tout ce que Frank voulait voir.
 */
function decoderDmx(voies: VoieCapture[], r: ReglageDecodage): Annotation[] {
  const v = voie(voies, r.donnees);
  if (!v || v.fronts.length === 0) return [];

  const bauds = r.bauds && r.bauds > 0 ? r.bauds : 250_000;
  /** Durée d'un bit en ms simulées. */
  const b = 1000 / bauds;
  /**
   * Écart admis entre un front et la frontière de bit la plus proche, en bits.
   * 0,25 par défaut : au-delà, un signal propre ne dérive pas — c'est le
   * réglage de vitesse qui est faux.
   */
  const tol = r.tolerance && r.tolerance > 0 ? r.tolerance : 0.25;
  const breakMs = DMX_BREAK_US / 1000;
  const fr = v.fronts;
  const lect = new Lecteur(fr, v.niveauInitial);
  const out: Annotation[] = [];

  /** Numéro du prochain canal (1..512) ; −1 = trame sans canaux lisibles. */
  let canal = -1;
  /** Vrai entre un BREAK et son premier créneau : ce créneau est le START code. */
  let attendStart = false;
  /** Fin du dernier BREAK : début du MAB. */
  let finBreak = 0;
  /** Fin des bits d'arrêt du dernier créneau : début d'une PAUSE ou du MBB. */
  let finStop: number | null = null;
  /** Un front descendant plus tôt appartient encore au créneau en cours. */
  let finCourante = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < fr.length; i++) {
    const f = fr[i]!;
    if (f.niveau !== 0) continue;
    let j = i + 1;
    while (j < fr.length && fr[j]!.niveau !== 1) j += 1;
    const montant = fr[j];
    if (!montant) break; // la capture s'arrête ligne basse : rien de lisible

    // Le BREAK passe avant tout : un créneau mal cadré ne doit pas le masquer.
    if (montant.t - f.t >= breakMs) {
      if (finStop !== null && f.t > finStop) {
        out.push({ t0: finStop, t1: f.t, texte: 'MBB', nature: 'cadre' });
      }
      out.push({ t0: f.t, t1: montant.t, texte: 'BREAK', nature: 'cadre' });
      attendStart = true;
      canal = -1;
      finStop = null;
      finBreak = montant.t;
      finCourante = montant.t;
      continue;
    }
    if (f.t < finCourante) continue; // front interne au créneau en cours
    const t0 = f.t;
    // Le start bit doit encore valoir 0 en son milieu : sinon c'est un parasite.
    if (lect.a(t0 + b / 2) !== 0) continue;

    let acc = 0;
    for (let k = 0; k < 8; k++) {
      if (lect.a(t0 + b * (1.5 + k)) === 1) acc |= 1 << k; // LSB en premier
    }
    const stop = lect.a(t0 + b * 9.5);
    // Un front du créneau loin de toute frontière de bit : vitesse mal réglée
    // (ou signal qui dérive). La valeur lue est alors douteuse — on le DIT au
    // lieu de l'afficher comme juste.
    let malCadre = false;
    for (let k = i + 1; k < fr.length && fr[k]!.t < t0 + b * 9.5; k++) {
      const n = (fr[k]!.t - t0) / b;
      if (Math.abs(n - Math.round(n)) > tol) {
        malCadre = true;
        break;
      }
    }
    // Le créneau suivant peut commencer dès le 2e bit d'arrêt : un émetteur à
    // un seul bit d'arrêt se lit encore, son STOP est simplement plus court.
    const finCreneau = t0 + b * (10 - Math.min(tol, 0.5));
    let finArret = t0 + b * 11;
    for (let k = i + 1; k < fr.length && fr[k]!.t < finArret; k++) {
      if (fr[k]!.niveau === 0 && fr[k]!.t >= finCreneau) finArret = fr[k]!.t;
    }

    // Ce qui précède : le MAB après un BREAK, une PAUSE entre deux créneaux.
    if (attendStart) {
      out.push({ t0: finBreak, t1: t0, texte: 'MAB', nature: 'cadre' });
    } else if (finStop !== null && t0 - finStop > b / 2) {
      out.push({ t0: finStop, t1: t0, texte: 'PAUSE', nature: 'cadre' });
    }
    out.push({ t0, t1: t0 + b, texte: 'Start', nature: 'start' });
    const valeur = { t0: t0 + b, t1: t0 + b * 9 };
    if (malCadre) {
      out.push({ ...valeur, texte: t('framing'), nature: 'erreur' });
    } else if (attendStart) {
      // Start code non nul (RDM, texte…) : la trame ne porte pas de niveaux de
      // projecteur, ses créneaux ne sont pas des canaux.
      out.push({
        ...valeur,
        texte: `START code ${hex2(acc)}`,
        court: hex2(acc),
        nature: acc === 0 ? 'cadre' : 'controle',
      });
    } else if (canal >= 1 && canal <= 512) {
      out.push({ ...valeur, texte: `c${canal}=${hex2(acc)}`, court: hex2(acc), nature: 'donnee' });
    } else {
      out.push({ ...valeur, texte: hex2(acc), nature: 'donnee' });
    }
    // Le bit d'arrêt doit valoir 1 : à 0, c'est une erreur de cadrage, posée
    // là où elle se voit — à la place du STOP.
    out.push({
      t0: t0 + b * 9,
      t1: finArret,
      texte: stop === 1 ? 'STOP' : t('framing'),
      nature: stop === 1 ? 'stop' : 'erreur',
    });

    if (attendStart) canal = acc === 0 && !malCadre ? 1 : -1;
    else if (canal >= 1) canal += 1;
    attendStart = false;
    finStop = finArret;
    finCourante = finCreneau;
  }
  return out;
}

// --- UART (série asynchrone) --------------------------------------------------

/**
 * Caractère imprimable d'un octet, pour l'afficher à côté de sa valeur. Hors de
 * l'ASCII imprimable on ne montre rien : un « ÿ » ou un carré de remplacement
 * ferait croire à une donnée texte là où il n'y en a pas.
 */
function litteral(n: number): string {
  if (n === 10) return '\\n';
  if (n === 13) return '\\r';
  if (n === 9) return '\\t';
  if (n >= 32 && n <= 126) return String.fromCharCode(n);
  return '';
}

/**
 * UART : une ligne série asynchrone, sans horloge. C'est le protocole du
 * `Serial.print()` de l'Arduino et de tout module qui parle en TX/RX.
 *
 * Il n'y a AUCUN moyen de deviner la vitesse depuis les créneaux — deux vitesses
 * voisines produisent les mêmes fronts avec des octets différents. Elle est donc
 * réglée, comme sur un analyseur du commerce, et c'est le premier réglage à
 * vérifier quand les octets sortent en charabia.
 *
 * Le cadrage : la ligne au repos est HAUTE. Un front descendant ouvre le start
 * bit, puis viennent les bits de données LSB D'ABORD (l'inverse de l'I²C et du
 * SPI, source classique d'erreur), la parité si elle est réglée, et un ou deux
 * bits d'arrêt à 1.
 *
 * On échantillonne au MILIEU de chaque bit plutôt que de compter les paliers
 * comme le fait le DMX : le DMX découpe une trame ouverte par un BREAK, dont les
 * octets s'enchaînent sans repos, alors qu'une ligne série ordinaire laisse des
 * silences arbitraires entre caractères. Se recaler sur chaque front descendant
 * évite que le décodage dérive après un long silence.
 */
function decoderUart(voies: VoieCapture[], r: ReglageDecodage): Annotation[] {
  const v = voie(voies, r.donnees);
  if (!v) return [];

  const bauds = r.bauds && r.bauds > 0 ? r.bauds : 9600;
  /** Durée d'un bit, en ms simulées. */
  const bitMs = 1000 / bauds;
  const nbData = r.bitsDonnees ?? 8;
  const parite = r.parite ?? 'none';
  const nbStop = r.bitsArret ?? 1;
  const tol = r.tolerance && r.tolerance > 0 ? r.tolerance : 0.25;

  const out: Annotation[] = [];
  const lect = new Lecteur(v.fronts, v.niveauInitial);
  /** Instant au-delà duquel le caractère en cours est terminé. */
  let finCourante = -Infinity;

  for (const f of v.fronts) {
    if (f.niveau !== 0) continue; // seul un front descendant ouvre un caractère
    if (f.t < finCourante) continue; // déjà à l'intérieur d'un caractère en cours

    const t0 = f.t;
    // Le start bit doit encore valoir 0 en son milieu : un front descendant
    // suivi d'une remontée immédiate est une glitch, pas un caractère.
    if (lect.a(t0 + bitMs * 0.5) !== 0) continue;

    let acc = 0;
    let uns = 0;
    let coupe = false;
    for (let i = 0; i < nbData; i++) {
      const b = lect.a(t0 + bitMs * (1.5 + i));
      if (b === null) {
        coupe = true;
        break;
      }
      if (b === 1) {
        acc |= 1 << i; // UART : LSB en premier
        uns += 1;
      }
    }
    if (coupe) break; // capture terminée au milieu d'un caractère

    let rang = 1 + nbData;
    let pariteFausse = false;
    if (parite !== 'none') {
      const p = lect.a(t0 + bitMs * (0.5 + rang));
      const attendu = parite === 'even' ? uns % 2 : 1 - (uns % 2);
      pariteFausse = p !== null && p !== attendu;
      rang += 1;
    }
    // Le bit d'arrêt doit valoir 1. À 0, c'est un « framing error » : vitesse
    // mal réglée neuf fois sur dix, d'où l'annotation explicite plutôt qu'un
    // octet faux affiché sans avertissement.
    const stop = lect.a(t0 + bitMs * (0.5 + rang));
    const t1 = t0 + bitMs * (rang + nbStop);
    finCourante = t0 + bitMs * (rang + nbStop - 1 + (1 - tol));

    // Chaque partie du caractère sous SES bits : le start bit en vert, les
    // données, la parité si elle est fausse, les bits d'arrêt en rouge. Une
    // erreur prend la place de la partie qu'elle concerne — l'octet reste lu,
    // à l'élève de juger s'il y croit.
    out.push({ t0, t1: t0 + bitMs, texte: 'Start', nature: 'start' });
    const car = litteral(acc);
    out.push({
      t0: t0 + bitMs,
      t1: t0 + bitMs * (1 + nbData),
      texte: car === '' ? hex2(acc) : `${hex2(acc)} '${car}'`,
      court: car === '' ? undefined : hex2(acc),
      nature: 'donnee',
    });
    if (pariteFausse) {
      out.push({
        t0: t0 + bitMs * (1 + nbData),
        t1: t0 + bitMs * rang,
        texte: t('parity'),
        nature: 'erreur',
      });
    }
    out.push({
      t0: t0 + bitMs * rang,
      t1,
      texte: stop === 0 ? t('framing') : 'STOP',
      nature: stop === 0 ? 'erreur' : 'stop',
    });
  }
  return out;
}

// --- 1-Wire -------------------------------------------------------------------

/** Durées de la norme 1-Wire, en µs. */
const OW = {
  /** Impulsion de RESET : le maître tire la ligne bas au moins 480 µs. */
  reset: 400,
  /** Au-delà de ce creux, le bit vaut 0 ; en deçà, il vaut 1. */
  seuilBit: 30,
  /** Un creux plus court que cela n'est pas un slot : c'est du parasite. */
  miniSlot: 1,
  /** Silence qui referme un octet resté incomplet (fin de transaction). */
  repos: 200,
} as const;

/**
 * 1-Wire (Dallas/Maxim, le bus du DS18B20). Une seule ligne, tirée au +5 V par
 * une résistance : tout le monde ne fait que la mettre à la masse, maître comme
 * esclave. Il n'y a donc pas d'horloge du tout, c'est la DURÉE du creux qui
 * porte l'information — d'où un décodeur qui ne regarde que ça :
 *
 *  - creux ≥ 480 µs  → RESET, la transaction recommence ;
 *  - creux court dans le slot qui suit → le maître écrit (ou l'esclave répond) ;
 *    un creux de moins de ~30 µs est un 1, un creux long est un 0.
 *
 * On ne distingue PAS qui parle, et c'est normal : sur le fil, une réponse
 * d'esclave et une écriture du maître sont le même creux. Un vrai analyseur ne
 * fait pas mieux avec une seule pince. Ce qui se lit, en revanche, ce sont les
 * octets — LSB d'abord — et les commandes courantes sont nommées, parce que
 * « 0x44 » ne dit rien à un élève alors que « CONVERT T » dit tout.
 */
const OW_COMMANDES: Record<number, string> = {
  0x33: 'READ ROM',
  0x55: 'MATCH ROM',
  0xcc: 'SKIP ROM',
  0xf0: 'SEARCH ROM',
  0xec: 'ALARM SEARCH',
  0x44: 'CONVERT T',
  0x4e: 'WRITE SCRATCHPAD',
  0xbe: 'READ SCRATCHPAD',
  0x48: 'COPY SCRATCHPAD',
  0xb8: 'RECALL E²',
  0xb4: 'READ POWER',
};

function decoderOneWire(voies: VoieCapture[], r: ReglageDecodage): Annotation[] {
  const v = voie(voies, r.donnees);
  if (!v || v.fronts.length === 0) return [];

  const usMs = 1 / 1000; // un µs en ms simulées
  const out: Annotation[] = [];

  let acc = 0;
  let bits = 0;
  let tOctet = 0;
  /** Vrai quand le prochain octet complet suit un RESET : c'est une commande. */
  let attendCommande = false;
  /** Instant du dernier front montant : sert à mesurer le silence qui suit. */
  let tHaut = -Infinity;

  /** Referme un octet incomplet quand la transaction s'arrête en route. */
  const clore = (t: number): void => {
    if (bits === 0) return;
    out.push({ t0: tOctet, t1: t, texte: `${bits} bits`, nature: 'erreur' });
    bits = 0;
    acc = 0;
  };

  for (let i = 0; i < v.fronts.length; i++) {
    const f = v.fronts[i]!;
    if (f.niveau !== 0) {
      tHaut = f.t;
      continue;
    }
    // Un creux : sa longueur est tout ce qui compte.
    const suivant = v.fronts.slice(i + 1).find((x) => x.niveau === 1);
    if (!suivant) break; // creux jamais refermé : la capture s'arrête dedans
    const creuxUs = (suivant.t - f.t) / usMs;
    // Un long silence HAUT avant ce creux referme la transaction précédente : un
    // octet à moitié lu n'appartient pas à celui qui commence.
    if (tHaut > -Infinity && (f.t - tHaut) / usMs >= OW.repos) clore(tHaut);

    if (creuxUs >= OW.reset) {
      clore(f.t);
      // Le RESET ouvre la transaction : c'est le « start » du 1-Wire.
      out.push({ t0: f.t, t1: suivant.t, texte: 'RESET', nature: 'start' });
      attendCommande = true;
      continue;
    }
    if (creuxUs < OW.miniSlot) continue; // trop bref pour être un slot

    const bit = creuxUs < OW.seuilBit ? 1 : 0;
    if (bits === 0) tOctet = f.t;
    if (bit === 1) acc |= 1 << bits; // 1-Wire : LSB en premier
    bits += 1;
    if (bits === 8) {
      const nom = attendCommande ? OW_COMMANDES[acc] : undefined;
      out.push({
        t0: tOctet,
        t1: suivant.t,
        texte: nom ? `${hex2(acc)} ${nom}` : hex2(acc),
        nature: 'donnee',
      });
      attendCommande = false;
      bits = 0;
      acc = 0;
    }
  }
  clore(v.fronts[v.fronts.length - 1]!.t);
  return out;
}

// --- DHT11 / DHT22 -------------------------------------------------------------

/** Durées de la trame DHT, en µs. */
const DHT = {
  /** Le maître tire bas au moins ~1 ms pour réveiller le capteur (500 suffit à le reconnaître). */
  depart: 500,
  /**
   * Au-delà de ce palier HAUT, le bit vaut 1 ; en deçà, il vaut 0. Les valeurs
   * du capteur sont 28 µs et 70 µs : le seuil est posé à mi-chemin, ce qui
   * laisse ±40 % de marge de chaque côté — largement de quoi absorber une
   * capture à pas grossier.
   */
  seuilBit: 50,
  /** Silence HAUT qui referme une trame restée incomplète. */
  repos: 200,
} as const;

/**
 * DHT11 / DHT22 (capteurs température-humidité à un seul fil).
 *
 * MALGRÉ LE FIL UNIQUE, CE N'EST PAS DU 1-WIRE. Rien du protocole Dallas n'y
 * est : ni ROM, ni commande, ni slot de lecture. Le capteur ne répond qu'à une
 * chose — un creux de départ du maître — et débite ensuite 40 bits d'affilée
 * sans que le maître ne dise plus rien.
 *
 * Chaque bit commence par 50 µs BAS, puis c'est la durée du palier HAUT qui
 * porte l'information : ~28 µs = 0, ~70 µs = 1. C'est l'inverse exact du
 * 1-Wire, où le bit est dans le creux — d'où deux décodeurs et non un seul
 * avec une option.
 *
 * Ce qui sort : chaque grandeur SOUS LES BITS QUI LA PORTENT — l'humidité sous
 * les octets 0-1, la température sous les octets 2-3, la somme de contrôle sous
 * l'octet 4 —, avec ses octets bruts quand la place le permet. Un élève qui
 * voit `SOMME ✗` sait que sa liaison est trop longue ou mal tirée, ce que
 * « 0x3F » ne lui dirait pas.
 *
 * Trois champs CÔTE À CÔTE, et non les octets et la mesure sur le même
 * intervalle : la vue n'écrit qu'un texte par intervalle, et la mesure — posée
 * après les octets — n'apparaissait donc JAMAIS, à aucun zoom (Frank, 23/09 :
 * « je ne vois pas les valeurs s'afficher »). Un résumé de la trame entière
 * double les trois champs pour la vue de loin (cf. `Annotation.resume`).
 */
function decoderDht(voies: VoieCapture[], r: ReglageDecodage): Annotation[] {
  const v = voie(voies, r.donnees);
  if (!v || v.fronts.length === 0) return [];

  const usMs = 1 / 1000;
  const modele = r.modele ?? 'dht22';
  const out: Annotation[] = [];

  /** Bits de la trame en cours, MSB d'abord (le DHT n'inverse pas, lui). */
  let bits: number[] = [];
  /** Début de chaque bit (son creux de 50 µs) : les bornes des trois champs. */
  let debuts: number[] = [];
  let tTrame = 0;
  /** Vrai entre l'accusé de réception et la fin des 40 bits. */
  let enTrame = false;
  /**
   * Le prochain creux est celui de l'accusé de réception (80 bas / 80 haut) :
   * son palier HAUT ne vaut PAS un bit. Il dure 80 µs, plus que le seuil : le
   * compter donnerait un « 1 » de trop, la trame entière décalée d'un bit et
   * les cinq octets faux.
   */
  let attendAccuse = false;

  /** Pose les trois champs et le résumé d'une trame complète, ou signale une trame tronquée. */
  const clore = (tFin: number): void => {
    if (bits.length === 0) {
      enTrame = false;
      return;
    }
    if (bits.length < 40) {
      out.push({ t0: tTrame, t1: tFin, texte: `${bits.length}/40 bits`, nature: 'erreur' });
      bits = [];
      debuts = [];
      enTrame = false;
      return;
    }
    const o: number[] = [];
    for (let k = 0; k < 5; k++) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[k * 8 + j]!; // MSB d'abord
      o.push(b);
    }
    const hr = humiditeDht(o, modele);
    const temp = temperatureDht(o, modele);
    const somme = (o[0]! + o[1]! + o[2]! + o[3]!) & 0xff;
    const ok = somme === o[4]!;
    const verdict = ok ? t('checksum ✓') : t('CHECKSUM ✗');
    out.push(
      {
        t0: debuts[0]!,
        t1: debuts[16]!,
        texte: `${hex2(o[0]!)} ${hex2(o[1]!)} · ${hr}`,
        court: hr,
        nature: 'donnee',
      },
      {
        t0: debuts[16]!,
        t1: debuts[32]!,
        texte: `${hex2(o[2]!)} ${hex2(o[3]!)} · ${temp}`,
        court: temp,
        nature: 'donnee',
      },
      {
        t0: debuts[32]!,
        t1: tFin,
        texte: `${hex2(o[4]!)} · ${verdict}`,
        court: ok ? '✓' : '✗',
        nature: ok ? 'controle' : 'erreur',
      },
      {
        t0: debuts[0]!,
        t1: tFin,
        texte: `${hr} · ${temp} · ${verdict}`,
        court: `${hr} · ${temp}`,
        resume: true,
        nature: ok ? 'controle' : 'erreur',
      }
    );
    bits = [];
    debuts = [];
    enTrame = false;
  };

  for (let i = 0; i < v.fronts.length; i++) {
    const f = v.fronts[i]!;
    if (f.niveau !== 0) continue; // on part toujours d'un front DESCENDANT
    const montant = v.fronts.slice(i + 1).find((x) => x.niveau === 1);
    if (!montant) break; // creux jamais refermé : la capture s'arrête dedans
    const creuxUs = (montant.t - f.t) / usMs;

    if (creuxUs >= DHT.depart) {
      // Signal de départ du maître : ce qui traînait avant n'appartient pas à
      // la trame qui commence.
      clore(f.t);
      out.push({ t0: f.t, t1: montant.t, texte: t('REQUEST'), nature: 'start' });
      attendAccuse = true;
      continue;
    }

    // Longueur du palier HAUT qui suit ce creux : c'est LUI qui porte le bit.
    const j = v.fronts.findIndex((x) => x === montant);
    const descendant = v.fronts.slice(j + 1).find((x) => x.niveau === 0);
    const hautUs = descendant ? (descendant.t - montant.t) / usMs : Infinity;

    if (attendAccuse) {
      out.push({ t0: f.t, t1: montant.t, texte: t('PRESENCE'), nature: 'cadre' });
      attendAccuse = false;
      enTrame = true;
      tTrame = montant.t;
      continue;
    }
    if (!enTrame) continue; // du bruit hors trame : rien à en tirer

    if (hautUs >= DHT.repos) {
      // La ligne est retombée au repos : la trame s'arrête ici, complète ou non.
      bits.push(hautUs >= DHT.seuilBit ? 1 : 0);
      debuts.push(f.t);
      clore(descendant ? descendant.t : montant.t);
      continue;
    }
    bits.push(hautUs >= DHT.seuilBit ? 1 : 0);
    debuts.push(f.t);
    if (bits.length === 40) clore(descendant ? descendant.t : montant.t);
  }
  clore(v.fronts[v.fronts.length - 1]!.t);
  return out;
}

/** Une décimale, séparateur de la langue (« 56,7 » en français). */
function dixiemes(x: number): string {
  // `+ 0` : un −0 (0x8000, signe seul) s'écrirait « -0,0 » ; toFixed disait « 0.0 ».
  return (x + 0).toLocaleString(locale(), {
    minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false,
  });
}

/** Humidité lue dans les octets 0-1 d'une trame DHT. */
function humiditeDht(o: number[], modele: 'dht11' | 'dht22'): string {
  // Le DHT11 ne code que des entiers : l'octet des décimales vaut 0.
  if (modele === 'dht11') return t('{0} %RH', o[0]!);
  return t('{0} %RH', dixiemes(((o[0]! << 8) | o[1]!) / 10));
}

/** Température lue dans les octets 2-3 d'une trame DHT. */
function temperatureDht(o: number[], modele: 'dht11' | 'dht22'): string {
  if (modele === 'dht11') return `${o[2]} °C`;
  const brut = (o[2]! << 8) | o[3]!;
  // Bit 15 = signe, et le reste est une valeur ABSOLUE — pas un complément à
  // deux : lire -0x8001 comme un entier signé donnerait +3276,7 °C.
  const celsius = ((brut & 0x8000 ? -1 : 1) * (brut & 0x7fff)) / 10;
  return `${dixiemes(celsius)} °C`;
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
      case 'uart':
        return decoderUart(voies, r);
      case 'onewire':
        return decoderOneWire(voies, r);
      case 'dht':
        return decoderDht(voies, r);
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
    case 'uart':
      return [{ cle: 'donnees', nom: 'TX/RX', obligatoire: true }];
    case 'onewire':
      return [{ cle: 'donnees', nom: 'DQ', obligatoire: true }];
    case 'dht':
      return [{ cle: 'donnees', nom: 'DATA', obligatoire: true }];
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

/**
 * Recul minimal, en ms, que le décodeur doit lire AVANT la fenêtre visible pour
 * reconnaître une trame qui commence hors de l'écran.
 *
 * Le DHT n'identifie sa trame QUE par le creux de départ du maître : sans lui,
 * les 40 bits qui suivent passent pour du bruit. Or ce creux dure 18 ms sur un
 * DHT11 et la trame 4 ms : zoomé au point de lire les bits, le départ tombe loin
 * à gauche de la fenêtre, hors de la marge ordinaire (10 % de la largeur). Le
 * décodeur ne voyait alors rien, à aucun zoom utile — ce que Frank lisait
 * « juste départ » (23/09). 30 ms couvrent départ + accusé + 40 bits.
 *
 * Le DMX a le même besoin pour une autre raison : c'est le BREAK qui dit quel
 * créneau est le START code et numérote les canaux. Zoomé sur le canal 300, le
 * BREAK est 13 ms plus tôt ; sans lui, les octets sortaient sans numéro. Un
 * univers complet (513 créneaux 8N2) dure 22,7 ms : 30 ms laissent la place
 * aux pauses entre créneaux.
 */
export function reculNecessaireMs(p: Protocole): number {
  return p === 'dht' || p === 'dmx' ? 30 : 0;
}

// `frontsDe` sert aux bancs : compter les fronts d'un sens est le contrôle le
// plus simple qu'un test puisse faire sur une voie.
export { frontsDe };
