// Protocole 1-wire du capteur DHT22 (température/humidité). Le maître (MCU) tire
// la ligne BAS au moins ~1 ms (signal de départ) puis la relâche ; le capteur
// répond par un accusé (80 µs BAS + 80 µs HAUT) suivi de 40 bits. Chaque bit
// commence par 50 µs BAS ; un état HAUT court (~28 µs) code « 0 », long (~70 µs)
// code « 1 ». Ce module fournit l'encodage des données et la forme d'onde ; la
// détection du signal de départ et l'injection des transitions restent côté
// moteur (AVR / RP2040), qui seul lit/pilote la broche en temps simulé.

/** Modèle de capteur : le DHT11 partage la trame et le protocole du DHT22, mais
 *  code des ENTIERS (résolution 1 %HR / 1 °C, plages 20-90 %HR et 0-50 °C). */
export type DhtModel = 'dht11' | 'dht22';

/**
 * Encode les 5 octets du capteur, checksum comprise :
 *  - dht22 : humidité×10 et température×10 sur 16 bits (bit 15 = signe) ;
 *  - dht11 : partie entière de l'humidité et de la température, décimales à 0
 *    (le DHT11 ne mesure ni les négatives ni les dixièmes).
 */
export function dht22Bytes(tempC: number, humidity: number, model: DhtModel = 'dht22'): number[] {
  let b0: number;
  let b1: number;
  let b2: number;
  let b3: number;
  if (model === 'dht11') {
    b0 = Math.round(Math.max(20, Math.min(90, humidity))) & 0xff;
    b1 = 0;
    b2 = Math.round(Math.max(0, Math.min(50, tempC))) & 0xff;
    b3 = 0;
  } else {
    const rh = Math.round(Math.max(0, Math.min(100, humidity)) * 10) & 0xffff;
    let t = Math.round(tempC * 10);
    const neg = t < 0;
    t = Math.abs(t) & 0x7fff;
    if (neg) t |= 0x8000; // bit de signe du DHT22
    b0 = (rh >> 8) & 0xff;
    b1 = rh & 0xff;
    b2 = (t >> 8) & 0xff;
    b3 = t & 0xff;
  }
  return [b0, b1, b2, b3, (b0 + b1 + b2 + b3) & 0xff];
}

/** Une transition de la ligne de données à un instant donné (cycles simulés). */
export interface DhtTransition {
  cycle: number;
  value: boolean;
}

/**
 * Forme d'onde complète de la réponse DHT22 (accusé + 40 bits + relâche), en
 * transitions horodatées à partir de `startCycle`. `cyclesPerUs` convertit les
 * microsecondes du protocole en cycles du cœur simulé.
 */
export function buildDht22Schedule(
  tempC: number,
  humidity: number,
  startCycle: number,
  cyclesPerUs: number,
  model: DhtModel = 'dht22'
): DhtTransition[] {
  const ev: DhtTransition[] = [];
  let t = startCycle;
  const us = (n: number): number => n * cyclesPerUs;
  // Accusé de réception : 80 µs BAS puis 80 µs HAUT.
  ev.push({ cycle: t, value: false });
  t += us(80);
  ev.push({ cycle: t, value: true });
  t += us(80);
  for (const byte of dht22Bytes(tempC, humidity, model)) {
    for (let bit = 7; bit >= 0; bit--) {
      ev.push({ cycle: t, value: false }); // 50 µs BAS de début de bit
      t += us(50);
      ev.push({ cycle: t, value: true });
      t += us((byte >> bit) & 1 ? 70 : 28); // HAUT long = 1, court = 0
    }
  }
  ev.push({ cycle: t, value: false }); // dernier BAS
  t += us(50);
  ev.push({ cycle: t, value: true }); // relâche (ligne au repos = haut)
  return ev;
}

/** Durée totale (en cycles) d'une réponse DHT22 à partir d'une forme d'onde. */
export function dht22ResponseCycles(schedule: DhtTransition[], startCycle: number): number {
  const last = schedule[schedule.length - 1];
  return last ? last.cycle - startCycle : 0;
}

/** État de surveillance d'un capteur DHT22 côté moteur (détection du départ). */
export interface Dht22Monitor {
  pin: string;
  tempC: number;
  humidity: number;
  /** Modèle du capteur (encodage de la trame) — DHT22 par défaut. */
  model: DhtModel;
  /** La ligne était-elle BASSE à la dernière observation. */
  wasLow: boolean;
  /** Cycle du dernier front descendant (début du signal de départ supposé). */
  lowStart: number;
  /** Cycle jusqu'auquel une réponse est en cours (on ignore les détections). */
  busyUntil: number;
}

/** Durée minimale (µs) de l'état BAS de départ pour déclencher une réponse. */
export const DHT22_START_LOW_US = 500;
