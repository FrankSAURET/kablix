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
  /** Lignes (1-based) munies d'un point d'arrêt dans le fichier principal. */
  setBreakpoints?(lines: number[]): void;
  /** Appelé à chaque pause avec la ligne courante et les variables lisibles. */
  onDebugPause: ((state: DebugPauseState) => void) | null;
  /** État logique d'une broche numérique nommée (ex. '13', 'A0', 'GP25'). */
  readDigital(name: string): boolean;
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
}

export interface FlashSegment {
  /** Adresse absolue (espace XIP : 0x10000000…). */
  addr: number;
  data: Uint8Array;
}
