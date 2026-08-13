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
  | { t: 'dispose' };

/** Nouvelles du fil de simulation vers la page. */
export type FromWorker =
  | { t: 'ready' }
  | { t: 'snapshot'; snap: PinSnapshot }
  | { t: 'serial'; chunk: string }
  | { t: 'debugPause'; state: unknown }
  | { t: 'scriptStarted' }
  /** Le moteur a levé une exception : la page repasse en mode dégradé. */
  | { t: 'error'; message: string };

/**
 * Période de publication de l'instantané, en ms de temps RÉEL. Quatre fois plus
 * serré que le rafraîchissement de l'écran (~16 ms) : les lectures de la page
 * portent toujours sur un état de moins d'une frame, et la charge de messages
 * reste au quart de ce qu'un envoi par front GPIO coûterait.
 */
export const SNAPSHOT_PERIOD_MS = 4;

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
  };
}
