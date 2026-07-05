// Interface commune des moteurs de simulation (AVR, RP2040).
import type { I2cDevice, SpiDevice } from './i2c-devices.mjs';

/** Variable affichée dans le panneau de débogage. */
export interface DebugVariable {
  name: string;
  value: string;
  type?: string;
}

/** État transmis à l'UI à chaque pause de la simulation. */
export interface DebugPauseState {
  /** Ligne du fichier source de l'élève (1-based), si connue. */
  line?: number;
  variables: DebugVariable[];
}

/** Point d'arrêt : une ligne, éventuellement conditionnelle. */
export interface Breakpoint {
  /** Ligne (1-based) dans le fichier source principal. */
  line: number;
  /**
   * Expression de condition dans le langage du source (Python pour MicroPython).
   * Le point d'arrêt ne suspend l'exécution que si l'expression est vraie.
   * Absente = point d'arrêt inconditionnel.
   */
  condition?: string;
}

/** Requête réseau émise par le script (pont Pico W) à destination de l'hôte. */
export interface NetRequest {
  id: number;
  /** Méthode HTTP. */
  m: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Réponse réseau renvoyée par l'hôte au script. */
export interface NetResponse {
  id: number;
  status?: number;
  reason?: string;
  body?: string;
  /** Message d'erreur (réseau coupé, hôte refusé…) ; lève une OSError côté script. */
  error?: string;
}

/** Capteur ultrason à simuler : broches TRIG/ECHO (noms MCU) + distance mesurée. */
export interface UltrasonicSensor {
  trig: string;
  echo: string;
  /** Distance simulée, en centimètres (réglée dans l'inspecteur). */
  distanceCm: number;
}

/**
 * Clavier matriciel à simuler. `rows`/`cols` = broches MCU des lignes/colonnes
 * (null si non câblée). `pressed` est partagé avec l'UI : il contient les touches
 * enfoncées au format « ligne,colonne » (indices 0-based). Le moteur reçoit la
 * référence et la relit à chaque balayage (le firmware met une ligne à LOW et lit
 * les colonnes ; une touche enfoncée tire sa colonne à LOW).
 */
export interface KeypadConfig {
  rows: Array<string | null>;
  cols: Array<string | null>;
  pressed: Set<string>;
}

/** Capteur DHT22 (température/humidité, protocole 1-wire) à simuler. */
export interface Dht22Sensor {
  /** Broche MCU reliée à la ligne de données. */
  pin: string;
  /** Température simulée, en °C (réglée dans l'inspecteur). */
  temperatureC: number;
  /** Humidité relative simulée, en % (réglée dans l'inspecteur). */
  humidity: number;
}

/** Afficheur LCD HD44780 en bus parallèle (broches côté MCU). */
export interface LcdParallelConfig {
  /** Identifiant du composant (clé de lecture via `readLcdParallel`). */
  id: string;
  /** Broche MCU de sélection registre/donnée (RS). */
  rs: string;
  /** Broche MCU d'activation (E) : l'octet est figé sur son front descendant. */
  e: string;
  /** Broches de données MCU, ordre LSB→MSB (D4-D7 en 4 bits, D0-D7 en 8 bits). */
  data: string[];
  /** Colonnes de l'afficheur. */
  cols: number;
  /** Lignes de l'afficheur. */
  rows: number;
}

/** Infos de débogage C/AVR extraites à la compilation (DWARF + symboles). */
export interface AvrDebugInfo {
  /** Table adresse flash (octets) → ligne du fichier principal. */
  lines: Array<{ addr: number; line: number; file?: string }>;
  /** Variables globales : adresse dans l'espace données AVR, taille, type. */
  globals: Array<{ name: string; addr: number; size: number; type?: string }>;
}

export interface SimEngine {
  start(): void;
  stop(): void;
  dispose(): void;
  /** Suspend l'exécution ; l'état des broches reste lisible. */
  pause(): void;
  /** Reprend l'exécution après une pause. */
  resume(): void;
  /** Vitesse d'exécution, fraction 0..1 du temps réel (1 = pleine vitesse). */
  setSpeed(fraction: number): void;
  /** Vrai si la simulation est en pause (pas à pas inclus). */
  readonly paused: boolean;
  /** Avance d'une ligne source, si les infos de débogage le permettent. */
  step?(): void;
  /** Points d'arrêt (ligne 1-based + condition optionnelle) du fichier principal. */
  setBreakpoints?(breakpoints: Breakpoint[]): void;
  /** Appelé à chaque pause avec la ligne courante et les variables lisibles. */
  onDebugPause: ((state: DebugPauseState) => void) | null;
  /** État logique d'une broche numérique nommée (ex. '13', 'A0', 'GP25'). */
  readDigital(name: string): boolean;
  /**
   * Déclare les broches dont la largeur d'impulsion doit être mesurée (servo :
   * 1000–2000 µs ↔ 0–180°). À appeler au (re)câblage avec les broches de servo.
   */
  setPulseMonitors?(names: string[]): void;
  /** Largeur de la dernière impulsion haute mesurée sur une broche, en µs (0 si inconnue). */
  readPulseUs?(name: string): number;
  /** Vrai si la broche bascule actuellement (signal carré actif : tone()/PWM) — pour le son du buzzer. */
  pulseActive?(name: string): boolean;
  /**
   * Rapport cyclique (0..1) mesuré sur une broche surveillée depuis la dernière
   * lecture — luminosité réelle d'une LED pilotée en PWM (sinon elle clignoterait
   * au rythme de l'échantillonnage du niveau instantané).
   */
  readPwmDuty?(name: string): number;
  /**
   * Déclare les capteurs ultrason : à chaque impulsion TRIG détectée, le moteur
   * génère sur ECHO une impulsion de largeur = distance × 58 µs (en temps simulé).
   */
  setUltrasonic?(sensors: UltrasonicSensor[]): void;
  /** Déclare les claviers matriciels : une touche enfoncée court-circuite ligne/colonne. */
  setKeypads?(keypads: KeypadConfig[]): void;
  /** Déclare les capteurs DHT22 : répond au protocole 1-wire avec température/humidité. */
  setDht22?(sensors: Dht22Sensor[]): void;
  /** Relie des périphériques I²C (esclaves) au bus du MCU (LCD, PCA9685…). */
  setI2cDevices?(devices: I2cDevice[]): void;
  /** Relie des périphériques SPI (esclaves) au bus du MCU (OLED SPI…). */
  setSpiDevices?(devices: SpiDevice[]): void;
  /** Déclare les chaînes NeoPixel (WS2812) : broche DIN + nombre de LED. */
  setNeopixels?(strips: Array<{ pin: string; count: number }>): void;
  /** Couleurs décodées de la chaîne NeoPixel sur `pin` (composantes 0..1). */
  readNeopixel?(pin: string): Array<{ r: number; g: number; b: number }>;
  /**
   * Déclare les afficheurs LCD HD44780 en bus parallèle : broches RS/E et lignes
   * de données `data` (ordre LSB→MSB : D4-D7 en 4 bits, D0-D7 en 8 bits ; le mode
   * est déduit de la longueur). Le moteur décode l'octet sur chaque front
   * descendant de E et met à jour le texte, lisible par `readLcdParallel`.
   */
  setLcdParallel?(displays: Array<LcdParallelConfig>): void;
  /** Texte décodé de l'afficheur parallèle `id` (une chaîne par ligne). */
  readLcdParallel?(id: string): string[];
  /** Force la valeur externe d'une broche d'entrée (bouton, capteur…). */
  setInput(name: string, value: boolean): void;
  /** Tension externe d'une broche analogique, en fraction 0..1 de VREF. */
  setAnalog(name: string, fraction: number): void;
  /** Envoie du texte au microcontrôleur sur la liaison série. */
  writeSerial(text: string): void;
  /** Appelé à chaque changement d'état des broches (pour rafraîchir l'affichage). */
  onUpdate: (() => void) | null;
  /** Appelé pour chaque fragment reçu sur la liaison série. */
  onSerial: ((chunk: string) => void) | null;
  /** Pont réseau (Pico W) : appelé quand le script émet une requête HTTP. */
  onNetRequest?: ((req: NetRequest) => void) | null;
  /** Réinjecte dans le script la réponse réseau obtenue par l'hôte. */
  sendNetResponse?(response: NetResponse): void;
}

export interface FlashSegment {
  /** Adresse absolue (espace XIP : 0x10000000…). */
  addr: number;
  data: Uint8Array;
}
