/**
 * Protocole de messages entre la page (webview) et le fil de simulation.
 *
 * Le moteur (avr8js / rp2040js) tient à lui seul ~92 % du fil principal : tant
 * qu'il y tourne, le rendu, les clics et le défilement attendent leur tour. Le
 * déplacer dans un Web Worker rend la page fluide, mais l'interface `SimEngine`
 * est SYNCHRONE (`readDigital(pin): boolean`) et un worker ne répond que par
 * messages. La webview n'étant pas *cross-origin isolated*, `SharedArrayBuffer`
 * est indisponible : on ne peut pas non plus partager la mémoire.
 *
 * D'où le principe retenu : le worker publie à cadence fixe un INSTANTANÉ de
 * toutes les broches, la page le garde en cache et les getters synchrones y
 * répondent sans traverser la frontière. Le décalage vaut au pire une période de
 * publication (~4 ms) — invisible à l'écran, qui ne se rafraîchit qu'à 16 ms.
 */

import type { AnalogWave } from './analog-waves.mjs';
import type { BusDeviceSpec } from './i2c-devices.mjs';
import type { SevenSegMuxSpec } from './sevenseg.mjs';

/** Broches publiées dans l'instantané, dans l'ordre fixé à l'initialisation. */
export interface PinTable {
  /** Noms MCU ('13', 'A0', 'GP25'…) ; l'index dans ce tableau indexe l'instantané. */
  names: string[];
}

/** Ce que le MCU impose sur une broche, encodé pour l'instantané. */
export const enum DriveCode {
  Hiz = 0,
  Low = 1,
  High = 2,
  Pullup = 3,
  Pulldown = 4,
}

/** Correspondance code ↔ libellé de `SimEngine.readPinDrive`. */
export const DRIVE_NAMES = ['hiz', 'low', 'high', 'pullup', 'pulldown'] as const;

/**
 * État complet des broches à un instant donné. Les tableaux sont indexés par la
 * position du nom dans `PinTable.names` — un seul objet par publication, plutôt
 * qu'un dictionnaire par broche, pour que le coût de sérialisation ne dépende pas
 * du nombre de broches câblées.
 */
export interface PinSnapshot {
  /** Numéro de publication, croissant : la page ignore un instantané en retard. */
  seq: number;
  /** Niveau logique, 0 ou 1. */
  digital: Uint8Array;
  /** Ce que le MCU impose (cf. `DriveCode`). */
  drive: Uint8Array;
  /** Largeur de la dernière impulsion haute mesurée, en µs (0 = inconnue). */
  pulseUs: Float32Array;
  /** Rapport cyclique mesuré, 0..1. */
  pwmDuty: Float32Array;
  /** 1 si la broche bascule (tone()/PWM actif). */
  pulseActive: Uint8Array;
  /** Temps SIMULÉ depuis le démarrage, en ms. */
  simulatedMs: number;
  /** Temps RÉEL cumulé passé dans la boucle du moteur, en ms. */
  busyMs: number;
  /** Retard (ms simulées) que le moteur doit encore à l'horloge du programme. */
  lagMs: number;
  /** Vrai si la simulation est en pause (pas à pas inclus). */
  paused: boolean;
  /**
   * Rubans NeoPixel : couleurs par broche, une entrée `0xRRGGBB` par LED. Hors des
   * vues typées ci-dessus — ces états sont peu nombreux, de taille variable, et
   * un ruban absent du schéma ne coûte rien.
   */
  neopixel: Record<string, number[]>;
  /** Écrans LCD en parallèle : lignes de texte par identifiant de composant. */
  lcd: Record<string, string[]>;
  /**
   * Latch des afficheurs 7 segments multiplexés : `digits × 8` valeurs 0/1 par
   * composant. Échantillonné dans le worker à chaque front GPIO — depuis la page
   * on ne verrait qu'un instantané sur quatre, et les chiffres brefs seraient
   * manqués. Publié seulement s'il a changé (le tableau est absent sinon).
   */
  sevenSeg: Record<string, Uint8Array>;
}

/** Carte à simuler, telle que la page la choisit. */
export type WorkerBoard = 'uno' | 'mega' | 'pico';

/** Ordres de la page vers le fil de simulation. */
export type ToWorker =
  | {
      t: 'init';
      board: WorkerBoard;
      /**
       * Programme compilé. Pour l'AVR c'est le flash (`Uint16Array`), TRANSFÉRÉ au
       * worker plutôt que copié ; pour le Pico, l'objet `PicoProgram` (script et
       * bibliothèques), sérialisé normalement.
       */
      program: Uint16Array | unknown;
      /** Infos DWARF du débogueur C/AVR (absentes pour le Pico). */
      debugInfo?: unknown;
      /** Broches à publier dans l'instantané. */
      pins: string[];
    }
  | { t: 'start' }
  | { t: 'stop' }
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'step' }
  | { t: 'setSpeed'; fraction: number }
  | { t: 'setBreakpoints'; breakpoints: unknown[] }
  | { t: 'setInput'; pin: string; high: boolean }
  | { t: 'setAnalog'; pin: string; fraction: number }
  /**
   * Formes d'onde analogiques, DÉCRITES et non calculées : le worker les évalue
   * lui-même à l'instant exact de la conversion ADC. C'est ce qui remplace le
   * `setAnalogSampler` de la page — une fonction ne traverse pas la frontière, et
   * la relever à cadence fixe depuis la page rendrait la courbe en escalier.
   * La liste est complète à chaque envoi.
   */
  | { t: 'setAnalogWaves'; waves: AnalogWave[] }
  | { t: 'writeSerial'; text: string }
  | { t: 'setPulseMonitors'; pins: string[] }
  | { t: 'setUltrasonic'; sensors: unknown[] }
  /**
   * Touches enfoncées, à plat. Le moteur relisait jusqu'ici l'ensemble `pressed`
   * PAR RÉFÉRENCE à chaque balayage de clavier : une référence ne traverse pas la
   * frontière du worker, l'UI publie donc la liste à chaque appui.
   */
  | { t: 'setKeypads'; keypads: unknown[] }
  | { t: 'keypadPressed'; pressed: string[] }
  | { t: 'setDht22'; sensors: unknown[] }
  | { t: 'setNeopixels'; strips: unknown[] }
  | { t: 'setLcdParallel'; screens: unknown[] }
  /**
   * Afficheurs 7 segments multiplexés, DÉCRITS : le worker échantillonne leur
   * latch à chaque front GPIO et publie le résultat dans l'instantané. C'est le
   * seul état visible qui exige la cadence du MCU, pas celle de l'écran.
   */
  | { t: 'setSevenSeg'; displays: SevenSegMuxSpec[] }
  /**
   * Périphériques de bus (I²C et SPI) DÉCRITS : le worker fabrique les siens et
   * les branche au moteur. L'objet lui-même ne traverse pas — ses méthodes sont
   * appelées au milieu d'une trame, à la cadence du bus.
   */
  | { t: 'setBusDevices'; specs: BusDeviceSpec[] }
  /**
   * Pont réseau du Pico W : la requête est partie du worker (`netRequest`), c'est
   * l'HÔTE qui a fait le vrai fetch (le worker n'a ni `vscode.postMessage` ni le
   * droit de sortir), et la réponse revient ici pour être réinjectée au script.
   */
  | { t: 'netResponse'; response: unknown }
  | { t: 'dispose' };

/**
 * État visible des périphériques de bus, publié à la cadence de l'écran. Seul ce
 * qui a CHANGÉ depuis la publication précédente y figure : un OLED immobile ne
 * coûte rien, et un TFT ne publie que la zone repeinte.
 */
export interface ScreenUpdate {
  /** Lignes de texte des afficheurs LCD, par identifiant de composant. */
  lcd: Record<string, string[]>;
  /** Les 16 rapports cycliques des cartes 16 servos. */
  pca: Record<string, Float32Array>;
  /** Tampon GDDRAM des OLED (pages × largeur, 8 pixels verticaux par octet). */
  oled: Record<string, Uint8Array>;
  /** Zone repeinte des écrans TFT, en RGBA. */
  tft: Record<string, { x: number; y: number; w: number; h: number; data: Uint8ClampedArray }>;
}

/** Nouvelles du fil de simulation vers la page. */
export type FromWorker =
  | { t: 'ready' }
  | { t: 'snapshot'; snap: PinSnapshot }
  | { t: 'screens'; screens: ScreenUpdate }
  | { t: 'serial'; chunk: string }
  | { t: 'debugPause'; state: unknown }
  /** MicroPython : le script de l'utilisateur commence VRAIMENT (cf. `onRunning`). */
  | { t: 'scriptStarted' }
  /** MicroPython : bascule vers le script instrumenté (cf. `onDebugRestart`). */
  | { t: 'debugRestart'; phase: 'start' | 'end' }
  /** Pico W : le script demande une requête HTTP, que seul l'hôte peut faire. */
  | { t: 'netRequest'; req: unknown }
  /** Le moteur a levé une exception : la page repasse en mode dégradé. */
  | { t: 'error'; message: string };

/**
 * Période de publication de l'instantané, en ms de temps RÉEL. Quatre fois plus
 * serré que le rafraîchissement de l'écran (~16 ms) : les lectures de la page
 * portent toujours sur un état de moins d'une frame, et la charge de messages
 * reste au quart de ce qu'un envoi par front GPIO coûterait.
 */
export const SNAPSHOT_PERIOD_MS = 4;

/**
 * Période de publication des ÉCRANS, en ms de temps réel. Quatre fois plus lâche
 * que l'instantané de broches : ces états ne sont relus qu'au rendu (~16 ms), et
 * un OLED pèse 1 024 octets là où toutes les broches d'une Uno en pèsent 200.
 * Publier une image par instantané ne rendrait pas l'écran plus juste, seulement
 * la liaison plus chargée.
 */
export const SCREEN_PERIOD_MS = 16;

/** Alloue un instantané vide pour `count` broches. */
export function emptySnapshot(count: number): PinSnapshot {
  return {
    seq: 0,
    digital: new Uint8Array(count),
    drive: new Uint8Array(count),
    pulseUs: new Float32Array(count),
    pwmDuty: new Float32Array(count),
    pulseActive: new Uint8Array(count),
    simulatedMs: 0,
    busyMs: 0,
    lagMs: 0,
    paused: false,
    neopixel: {},
    lcd: {},
    sevenSeg: {},
  };
}
