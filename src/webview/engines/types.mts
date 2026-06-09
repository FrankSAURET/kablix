// Interface commune des moteurs de simulation (AVR, RP2040).

export interface SimEngine {
  start(): void;
  stop(): void;
  dispose(): void;
  /** État logique d'une broche numérique nommée (ex. '13', 'A0', 'GP25'). */
  readDigital(name: string): boolean;
  /** Force la valeur externe d'une broche d'entrée (bouton, capteur…). */
  setInput(name: string, value: boolean): void;
  /** Appelé à chaque changement d'état des broches (pour rafraîchir l'affichage). */
  onUpdate: (() => void) | null;
  /** Appelé pour chaque fragment reçu sur la liaison série. */
  onSerial: ((chunk: string) => void) | null;
}
