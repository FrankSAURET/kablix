// Lecteur de badges (RFID) : comment son code devient des FRONTS sur un fil.
//
// Un lecteur de badges n'écoute pas la carte, il lui PARLE. Dès qu'un badge
// entre dans sa boucle d'antenne, il envoie son numéro tout seul, encore et
// encore, tant que le badge est là. Deux façons de le dire, choisies par le
// cavalier du dessin :
//
//   - UART : le numéro en clair, caractère par caractère, comme le moniteur
//     série. Un caractère = un bit de départ (bas), huit bits de données (le
//     plus faible d'abord), un bit d'arrêt (haut). Au repos, le fil est haut.
//   - Wiegand : deux fils et des impulsions très courtes, le langage des
//     lecteurs de porte. Les deux fils sont hauts au repos ; un zéro fait un
//     creux sur DATA0, un un fait un creux sur DATA1, et on recommence 26 fois.
//
// Ce module ne connaît NI le schéma NI le moteur : il transforme un texte en
// liste de fronts. C'est ce qui le rend vérifiable sans navigateur (verify-rfid).

import type { CustomRfidMode } from './catalog.mjs';

/** Un front sur un fil : `afterUs` compte depuis le front PRÉCÉDENT du même fil. */
export interface RfidEdge {
  afterUs: number;
  level: boolean;
}

/** Trame émise : les fronts du fil de données, et ceux du second fil (Wiegand). */
export interface RfidFrame {
  data: RfidEdge[];
  data1: RfidEdge[];
}

/** Longueur d'une trame Wiegand standard, en bits (8 de site + 16 de carte + 2 de parité). */
export const WIEGAND_BITS = 26;

/** Silence gardé avant le premier caractère, en temps-bit : la ligne doit être
 *  vue HAUTE un moment avant le bit de départ, sinon le premier caractère se
 *  perd — le microcontrôleur ne saurait pas d'où compter. */
const REPOS_BITS = 2;

/** Instants absolus (µs) → délais depuis le front précédent, ce qu'attend le moteur. */
function enDeltas(fronts: Array<{ at: number; level: boolean }>): RfidEdge[] {
  let precedent = 0;
  return fronts.map((f) => {
    const d = Math.max(0, f.at - precedent);
    precedent = f.at;
    return { afterUs: d, level: f.level };
  });
}

/**
 * Trame série 8N1 : le texte, puis retour chariot et passage à la ligne — c'est
 * cette fin de ligne qui permet à `Serial.readStringUntil('\n')` de savoir que
 * le numéro est complet. Seuls les CHANGEMENTS de niveau deviennent des fronts :
 * huit bits à un d'affilée ne valent qu'un seul front, pas huit.
 */
export function frontsUart(code: string, baud = 9600): RfidEdge[] {
  const tBit = 1e6 / Math.max(1, baud);
  const octets = `${code}\r\n`;
  // La suite des niveaux, un par temps-bit, en commençant par le repos.
  const niveaux: boolean[] = new Array(REPOS_BITS).fill(true);
  for (let i = 0; i < octets.length; i++) {
    const v = octets.charCodeAt(i) & 0xff;
    niveaux.push(false); // bit de départ
    for (let b = 0; b < 8; b++) niveaux.push(((v >> b) & 1) === 1);
    niveaux.push(true); // bit d'arrêt
  }
  const fronts: Array<{ at: number; level: boolean }> = [];
  // Le tout premier front pose le repos : l'entrée du moteur est basse tant que
  // personne ne l'a écrite, et un fil de repos bas ressemble à un bit de départ.
  let courant: boolean | null = null;
  niveaux.forEach((niveau, k) => {
    if (niveau === courant) return;
    fronts.push({ at: k * tBit, level: niveau });
    courant = niveau;
  });
  return enDeltas(fronts);
}

/**
 * Trame Wiegand : le numéro est lu comme un nombre HEXADÉCIMAL, envoyé bit par
 * bit du plus fort au plus faible. Chaque bit est un creux de `pulseUs` sur l'un
 * des deux fils, suivi d'un repos de `gapUs` avant le suivant.
 */
export function frontsWiegand(
  code: string,
  { pulseUs = 50, gapUs = 2000, bits = WIEGAND_BITS } = {}
): RfidFrame {
  const valeur = Number.parseInt(code.replace(/[^0-9a-f]/gi, ''), 16);
  const mot = Number.isFinite(valeur) ? valeur : 0;
  const d0: Array<{ at: number; level: boolean }> = [];
  const d1: Array<{ at: number; level: boolean }> = [];
  // Les deux fils partent du repos (haut) : sans ce front, le premier creux ne
  // serait pas un creux — l'entrée du moteur est basse au départ.
  d0.push({ at: 0, level: true });
  d1.push({ at: 0, level: true });
  // Un écart de repos avant le premier creux, pour la même raison qu'en série :
  // la ligne doit avoir été vue haute avant de descendre.
  let t = Math.max(1, gapUs);
  for (let i = bits - 1; i >= 0; i--) {
    // `mot` peut dépasser 31 bits : on descend par division, pas par décalage —
    // les décalages de JavaScript travaillent sur 32 bits SIGNÉS.
    const bit = Math.floor(mot / 2 ** i) % 2 === 1;
    const fil = bit ? d1 : d0;
    fil.push({ at: t, level: false });
    fil.push({ at: t + pulseUs, level: true });
    t += pulseUs + gapUs;
  }
  return { data: enDeltas(d0), data1: enDeltas(d1) };
}

/** Trame d'un mode du manifeste : la bonne langue, avec ses réglages. */
export function frontsRfid(mode: CustomRfidMode, code: string): RfidFrame {
  if (mode.proto === 'wiegand') {
    return frontsWiegand(code, { pulseUs: mode.pulseUs, gapUs: mode.gapUs });
  }
  return { data: frontsUart(code, mode.baud), data1: [] };
}

/** Durée totale d'une suite de fronts, en microsecondes. */
export function dureeUs(edges: RfidEdge[]): number {
  return edges.reduce((somme, e) => somme + e.afterUs, 0);
}
