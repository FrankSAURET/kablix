// Interface commune des moteurs de simulation (AVR, RP2040).

export interface SimEngine {
  start(): void;
  stop(): void;
  dispose(): void;
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
