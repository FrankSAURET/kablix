// Protocole 1-Wire Dallas du capteur de température DS18B20 (côté ESCLAVE).
//
// CE QUI LE DISTINGUE DU DHT. Le DHT22 tient sur un fil lui aussi, mais c'est un
// MONOLOGUE : le maître tire la ligne bas une fois, le capteur déverse 40 bits
// et se tait. Le 1-Wire Dallas est un DIALOGUE — le maître envoie des octets de
// commande, l'esclave répond, et CHAQUE bit des deux sens est ouvert par un
// front descendant du maître. Il faut donc un automate qui suit la ligne créneau
// par créneau, pas une forme d'onde calculée d'avance.
//
// LES TROIS TEMPS QUE LE MAÎTRE IMPOSE (fiche technique DS18B20, § « 1-Wire
// Bus System ») :
//   - RESET      : le maître tient BAS au moins 480 µs. L'esclave attend 15 à
//                  60 µs après la relâche, puis tire BAS 60 à 240 µs : c'est
//                  l'impulsion de PRÉSENCE, la seule chose qui dise au maître
//                  qu'il y a quelqu'un sur le fil.
//   - ÉCRITURE   : front descendant, puis le maître tient BAS. Court (1 à 15 µs)
//                  = « 1 », long (60 à 120 µs) = « 0 ». L'esclave échantillonne
//                  la ligne ~30 µs APRÈS le front : c'est ce seuil qui sépare
//                  les deux, et c'est lui qu'on implémente.
//   - LECTURE    : le maître ouvre le créneau par un BAS très court (≥ 1 µs)
//                  puis relâche. Pour un « 0 » l'esclave tient BAS ~30 µs ; pour
//                  un « 1 » il ne fait RIEN et la résistance de tirage laisse la
//                  ligne haute. Rien ne distingue au départ un créneau de
//                  lecture d'un créneau d'écriture de « 1 » : c'est l'ÉTAT de
//                  l'automate (a-t-on reçu une commande qui appelle une réponse)
//                  qui tranche, exactement comme sur le vrai composant.
//
// CE QUE CE MODULE FAIT ET NE FAIT PAS. Il tient l'automate et fabrique les
// octets ; il ne lit ni ne pilote aucune broche. Le moteur (AVR / RP2040) lui
// signale les fronts avec leur date en cycles, et reçoit en retour les moments
// où l'esclave doit tirer la ligne. C'est le partage déjà retenu pour le DHT22
// (`dht22.mts`) : le temps simulé n'appartient qu'au moteur.

/** Le 1-Wire porte l'ordre des bits à l'ENVERS du DHT : LSB d'abord. */
const BITS_PAR_OCTET = 8;

/** Commandes de ROM (première phase de tout échange, après un reset). */
export const CMD_SEARCH_ROM = 0xf0;
export const CMD_READ_ROM = 0x33;
export const CMD_MATCH_ROM = 0x55;
export const CMD_SKIP_ROM = 0xcc;

/** Commandes de fonction (seconde phase, une fois l'esclave adressé). */
export const CMD_CONVERT_T = 0x44;
export const CMD_READ_SCRATCHPAD = 0xbe;
export const CMD_WRITE_SCRATCHPAD = 0x4e;
export const CMD_COPY_SCRATCHPAD = 0x48;

/** Code famille du DS18B20 dans l'octet de tête de sa ROM (fiche technique). */
export const FAMILLE_DS18B20 = 0x28;

/** Durée minimale (µs) de l'état BAS que le maître doit tenir pour un RESET. */
export const RESET_MIN_US = 480;
/** Attente (µs) avant l'impulsion de présence, une fois la ligne relâchée. */
export const PRESENCE_DELAI_US = 30;
/** Durée (µs) de l'impulsion de présence. */
export const PRESENCE_DUREE_US = 110;
/** Instant (µs après le front) où l'esclave échantillonne un bit ÉCRIT. */
export const ECHANTILLON_US = 30;
/** Durée (µs) pendant laquelle l'esclave tient BAS pour émettre un « 0 ». */
export const LECTURE_ZERO_US = 30;
/**
 * Au-delà de cette durée (µs) de BAS, le créneau n'est plus un bit : c'est le
 * début d'un reset. Le seuil est très au-dessus du « 0 » écrit le plus long
 * (120 µs) et très en dessous du reset le plus court (480 µs) : aucun des deux
 * ne peut être pris pour l'autre.
 */
export const BIT_MAX_US = 200;

/**
 * Résolution du convertisseur, en bits. Le DS18B20 sort d'usine en 12 bits
 * (1/16 °C) ; les résolutions plus basses effacent les bits de poids faible du
 * scratchpad et c'est exactement ainsi qu'on les simule.
 */
export type ResolutionDs18b20 = 9 | 10 | 11 | 12;

/**
 * Convertit une température en les DEUX octets du scratchpad.
 *
 * Le DS18B20 code en complément à deux sur 16 bits, au SEIZIÈME de degré — et
 * non en valeur absolue avec bit de signe comme le DHT22. Confondre les deux
 * rend −12,5 °C comme +4083,5 °C, et cela ne se voit QUE sur les négatives :
 * c'est le piège déjà payé sur le DHT (lot .100).
 */
export function ds18b20Temperature(tempC: number, resolution: ResolutionDs18b20 = 12): number[] {
  // Plage du composant : au-delà, il sature, il ne replie pas.
  const borne = Math.max(-55, Math.min(125, tempC));
  let brut = Math.round(borne * 16);
  // Résolution réduite = bits de poids faible mis à zéro (fiche technique,
  // tableau « Resolution / Configuration Register »).
  const perdus = 12 - resolution;
  if (perdus > 0) brut = (brut >> perdus) << perdus;
  const mot = brut & 0xffff;
  return [mot & 0xff, (mot >> 8) & 0xff];
}

/**
 * Relit une paire d'octets du scratchpad en degrés.
 *
 * Utile au banc autant qu'à l'affichage : c'est l'aller-retour qui prouve
 * l'encodage, pas la relecture d'une constante écrite à la main.
 */
export function ds18b20Lire(lsb: number, msb: number): number {
  const mot = ((msb & 0xff) << 8) | (lsb & 0xff);
  // Complément à deux : au-delà de 0x7FFF, la valeur est négative.
  const signe = mot >= 0x8000 ? mot - 0x10000 : mot;
  return signe / 16;
}

/**
 * CRC8 Dallas/Maxim (polynôme x⁸+x⁵+x⁴+1, réfléchi : 0x8C).
 *
 * C'est le même calcul pour le dernier octet de la ROM et pour le neuvième du
 * scratchpad. Une bibliothèque Arduino (OneWire, DallasTemperature) le vérifie
 * et REJETTE la mesure s'il est faux : un CRC approximatif donnerait un capteur
 * qui a l'air branché et ne rend jamais rien.
 */
export function crc8Dallas(octets: number[]): number {
  let crc = 0;
  for (const octet of octets) {
    let o = octet & 0xff;
    for (let i = 0; i < BITS_PAR_OCTET; i++) {
      const melange = (crc ^ o) & 1;
      crc >>= 1;
      if (melange) crc ^= 0x8c;
      o >>= 1;
    }
  }
  return crc & 0xff;
}

/**
 * Fabrique les 8 octets de ROM d'un capteur : famille, 6 octets de série, CRC.
 *
 * Le numéro de série doit être STABLE pour un composant donné — un programme qui
 * cherche les capteurs du bus (`search`) puis les adresse par `MATCH ROM` ne
 * retrouverait rien si l'adresse changeait d'une conversion à l'autre. On le
 * dérive donc de l'identifiant du composant dans le schéma.
 */
export function ds18b20Rom(idComposant: string): number[] {
  // Hachage court et déterministe (FNV-1a 32 bits) : deux composants distincts
  // du même schéma doivent avoir deux adresses distinctes.
  let h = 0x811c9dc5;
  for (let i = 0; i < idComposant.length; i++) {
    h ^= idComposant.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const serie = [
    h & 0xff,
    (h >>> 8) & 0xff,
    (h >>> 16) & 0xff,
    (h >>> 24) & 0xff,
    (h ^ 0x5a) & 0xff,
    ((h >>> 5) ^ 0xa5) & 0xff,
  ];
  const sansCrc = [FAMILLE_DS18B20, ...serie];
  return [...sansCrc, crc8Dallas(sansCrc)];
}

/**
 * Fabrique les 9 octets du scratchpad.
 *
 * Les octets 2 et 3 (alarmes TH/TL) et 5 à 7 (réservés) portent les valeurs de
 * sortie d'usine : une bibliothèque qui les relit doit y trouver ce que le vrai
 * composant y met.
 */
export function ds18b20Scratchpad(
  tempC: number,
  resolution: ResolutionDs18b20 = 12
): number[] {
  const [lsb, msb] = ds18b20Temperature(tempC, resolution);
  // Registre de configuration : les deux bits R1/R0 codent la résolution.
  const config = 0x1f | ((resolution - 9) << 5);
  const sansCrc = [lsb, msb, 0x4b, 0x46, config, 0xff, 0x0c, 0x10];
  return [...sansCrc, crc8Dallas(sansCrc)];
}

/** Ce que l'automate demande au moteur : tenir la ligne BASSE un moment. */
export interface ImpulsionDs18b20 {
  /** Cycle simulé où l'esclave tire la ligne bas. */
  debut: number;
  /** Cycle simulé où il la relâche. */
  fin: number;
}

/** Phase de l'échange, du point de vue de l'esclave. */
type Phase =
  /** Rien reçu depuis la mise sous tension ou depuis un reset avorté. */
  | 'repos'
  /** Reset vu : on attend la commande de ROM. */
  | 'attend-rom'
  /** ROM traitée (SKIP/MATCH) : on attend la commande de fonction. */
  | 'attend-fonction'
  /** Le maître lit des octets qu'on lui envoie (ROM ou scratchpad). */
  | 'emission'
  /** Le maître écrit des octets qu'on absorbe (MATCH ROM, WRITE SCRATCHPAD). */
  | 'absorbe';

/**
 * Automate 1-Wire d'un DS18B20.
 *
 * Il ne connaît que des FRONTS datés : le moteur appelle `frontDescendant` et
 * `frontMontant` avec le cycle simulé, et l'automate rend, le cas échéant,
 * l'impulsion que l'esclave doit produire. Aucun accès au temps réel, aucun
 * accès à la broche : c'est ce qui le rend mesurable hors simulation.
 */
export class Ds18b20 {
  /** Température lue par le capteur, en °C (curseur de l'inspecteur). */
  temperatureC = 25;
  /** Résolution du convertisseur (propriété du composant). */
  resolution: ResolutionDs18b20 = 12;

  private readonly rom: number[];
  private readonly cyclesParUs: number;

  private phase: Phase = 'repos';
  /** Cycle du dernier front descendant, pour mesurer la durée du BAS. */
  private descenteA = -1;
  /** Octet en cours de réception, et le rang du bit attendu (LSB d'abord). */
  private recuOctet = 0;
  private recuBit = 0;
  /** Octets restant à émettre, et le rang du bit courant. */
  private aEmettre: number[] = [];
  private emisBit = 0;
  /** Combien d'octets le maître doit encore nous écrire avant qu'on agisse. */
  private absorbeRestant = 0;
  /** Ce qu'on fera une fois ces octets absorbés. */
  private absorbePour: 'match-rom' | 'write-scratchpad' = 'match-rom';
  /** Les octets de ROM reçus dans un MATCH ROM, pour savoir s'il nous vise. */
  private absorbeVus: number[] = [];
  /** Une conversion a-t-elle été demandée (CONVERT T) ? */
  private converti = false;

  constructor(idComposant: string, cyclesParUs: number) {
    this.rom = ds18b20Rom(idComposant);
    this.cyclesParUs = cyclesParUs;
  }

  /** Les 8 octets d'adresse du capteur (utile à l'affichage et aux bancs). */
  adresse(): number[] {
    return [...this.rom];
  }

  /** Remet l'automate au repos (changement de schéma, arrêt de simulation). */
  raz(): void {
    this.phase = 'repos';
    this.descenteA = -1;
    this.recuOctet = 0;
    this.recuBit = 0;
    this.aEmettre = [];
    this.emisBit = 0;
    this.absorbeRestant = 0;
    this.absorbeVus = [];
    this.converti = false;
  }

  /**
   * Le maître vient de tirer la ligne BAS.
   *
   * Si l'esclave doit émettre un bit, c'est ICI que ça se joue : un créneau de
   * lecture s'ouvre par un front descendant, et l'esclave tient la ligne basse
   * pour un « 0 » — il doit avoir décidé avant que le maître ne relâche.
   */
  frontDescendant(cycle: number): ImpulsionDs18b20 | null {
    this.descenteA = cycle;
    if (this.phase !== 'emission') return null;
    const octet = this.aEmettre[0];
    if (octet === undefined) {
      this.phase = 'attend-fonction';
      return null;
    }
    const bit = (octet >> this.emisBit) & 1;
    this.avancerEmission();
    // Un « 1 » se dit en ne faisant RIEN : la résistance de tirage s'en charge.
    if (bit) return null;
    return {
      debut: cycle,
      fin: cycle + LECTURE_ZERO_US * this.cyclesParUs,
    };
  }

  /**
   * Le maître vient de relâcher la ligne.
   *
   * C'est la DURÉE du bas qui dit ce que c'était : un reset, un « 0 » écrit, un
   * « 1 » écrit, ou l'ouverture d'un créneau de lecture (qu'on a déjà traitée au
   * front descendant).
   */
  frontMontant(cycle: number): ImpulsionDs18b20 | null {
    if (this.descenteA < 0) return null;
    const dureeUs = (cycle - this.descenteA) / this.cyclesParUs;
    this.descenteA = -1;

    if (dureeUs >= RESET_MIN_US) {
      this.surReset();
      return {
        debut: cycle + PRESENCE_DELAI_US * this.cyclesParUs,
        fin: cycle + (PRESENCE_DELAI_US + PRESENCE_DUREE_US) * this.cyclesParUs,
      };
    }
    // Trop long pour un bit, trop court pour un reset : le maître fait autre
    // chose (ou le schéma est faux). On ne devine pas, on se tait.
    if (dureeUs > BIT_MAX_US) {
      this.phase = 'repos';
      return null;
    }
    if (this.phase === 'attend-rom' || this.phase === 'attend-fonction' || this.phase === 'absorbe') {
      // Écriture : court = 1, long = 0. Le seuil est celui où le vrai composant
      // échantillonne.
      this.recevoirBit(dureeUs < ECHANTILLON_US ? 1 : 0);
    }
    return null;
  }

  /** Le maître a envoyé un reset : tout repart, la conversion reste acquise. */
  private surReset(): void {
    this.phase = 'attend-rom';
    this.recuOctet = 0;
    this.recuBit = 0;
    this.aEmettre = [];
    this.emisBit = 0;
    this.absorbeRestant = 0;
    this.absorbeVus = [];
  }

  /** Empile un bit reçu et traite l'octet dès qu'il est complet. */
  private recevoirBit(bit: number): void {
    // LSB d'abord, à l'inverse du DHT.
    this.recuOctet |= bit << this.recuBit;
    this.recuBit++;
    if (this.recuBit < BITS_PAR_OCTET) return;
    const octet = this.recuOctet & 0xff;
    this.recuOctet = 0;
    this.recuBit = 0;
    this.traiterOctet(octet);
  }

  /** Aiguille un octet complet selon la phase de l'échange. */
  private traiterOctet(octet: number): void {
    if (this.phase === 'absorbe') {
      this.absorbeVus.push(octet);
      this.absorbeRestant--;
      if (this.absorbeRestant > 0) return;
      if (this.absorbePour === 'match-rom') {
        // Le MATCH ROM ne nous concerne que si l'adresse est la nôtre. Sinon on
        // se tait jusqu'au prochain reset — c'est ce qui permet à plusieurs
        // capteurs de cohabiter sur un même fil.
        const pourNous = this.rom.every((o, i) => o === this.absorbeVus[i]);
        this.phase = pourNous ? 'attend-fonction' : 'repos';
      } else {
        // WRITE SCRATCHPAD : le troisième octet porte la résolution.
        const config = this.absorbeVus[2];
        if (config !== undefined) {
          const r = 9 + ((config >> 5) & 0x03);
          this.resolution = r as ResolutionDs18b20;
        }
        this.phase = 'attend-fonction';
      }
      this.absorbeVus = [];
      return;
    }

    if (this.phase === 'attend-rom') {
      switch (octet) {
        case CMD_SKIP_ROM:
          // Un seul capteur sur le fil : le maître s'adresse à tout le monde.
          this.phase = 'attend-fonction';
          return;
        case CMD_READ_ROM:
          this.emettre(this.rom);
          return;
        case CMD_MATCH_ROM:
          this.phase = 'absorbe';
          this.absorbePour = 'match-rom';
          this.absorbeRestant = 8;
          this.absorbeVus = [];
          return;
        case CMD_SEARCH_ROM:
          // La recherche d'adresses n'est pas simulée : elle demande que
          // plusieurs esclaves répondent EN MÊME TEMPS sur le même fil, bit à
          // bit. Un seul capteur sur le bus se trouve très bien par SKIP ROM,
          // ce que fait toute bibliothèque quand la recherche ne rend rien.
          this.phase = 'repos';
          return;
        default:
          this.phase = 'repos';
          return;
      }
    }

    if (this.phase === 'attend-fonction') {
      switch (octet) {
        case CMD_CONVERT_T:
          // La conversion est instantanée ici. Le maître qui l'attend en lisant
          // la ligne (mode « busy ») verra un « 1 », c'est-à-dire « fini » —
          // ce que rend aussi le vrai composant une fois la mesure faite.
          this.converti = true;
          this.emettre([0xff]);
          return;
        case CMD_READ_SCRATCHPAD:
          this.emettre(ds18b20Scratchpad(this.temperatureC, this.resolution));
          return;
        case CMD_WRITE_SCRATCHPAD:
          this.phase = 'absorbe';
          this.absorbePour = 'write-scratchpad';
          this.absorbeRestant = 3;
          this.absorbeVus = [];
          return;
        case CMD_COPY_SCRATCHPAD:
          // Écriture en EEPROM : rien à simuler, la valeur ne survit pas à la
          // simulation de toute façon.
          this.phase = 'attend-fonction';
          return;
        default:
          this.phase = 'repos';
          return;
      }
    }
  }

  /** Arme l'émission d'une suite d'octets, LSB d'abord. */
  private emettre(octets: number[]): void {
    this.aEmettre = [...octets];
    this.emisBit = 0;
    this.phase = 'emission';
  }

  /** Avance d'un bit dans l'émission, et passe à l'octet suivant au besoin. */
  private avancerEmission(): void {
    this.emisBit++;
    if (this.emisBit < BITS_PAR_OCTET) return;
    this.emisBit = 0;
    this.aEmettre.shift();
    if (this.aEmettre.length === 0) this.phase = 'attend-fonction';
  }

  /** Vrai si une conversion a été demandée depuis le dernier reset complet. */
  aConverti(): boolean {
    return this.converti;
  }
}
