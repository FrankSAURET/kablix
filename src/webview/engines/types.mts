// Interface commune des moteurs de simulation (AVR, RP2040).

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
  /**
   * Déclare les capteurs ultrason : à chaque impulsion TRIG détectée, le moteur
   * génère sur ECHO une impulsion de largeur = distance × 58 µs (en temps simulé).
   */
  setUltrasonic?(sensors: UltrasonicSensor[]): void;
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
