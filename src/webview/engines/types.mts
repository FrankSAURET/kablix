// Types partagés par les moteurs de simulation (AVR, RP2040).

export interface LedSpec {
  id: string;
  label: string;
  /** Couleur CSS de la LED allumée. */
  color: string;
}

export interface BoardLayout {
  /** Nom affiché de la carte. */
  name: string;
  /** Classe CSS du visuel de la carte (ex. 'board--uno'). */
  cssClass: string;
  leds: LedSpec[];
  /** La carte expose-t-elle un bouton poussoir pilotable ? */
  hasButton: boolean;
  buttonLabel?: string;
}

export interface EngineCallbacks {
  /** Appelé quand une LED change d'état. */
  onLed(id: string, on: boolean): void;
  /** Appelé pour chaque fragment reçu sur la liaison série. */
  onSerial(chunk: string): void;
}

export interface SimEngine {
  readonly layout: BoardLayout;
  start(): void;
  stop(): void;
  /** Pour les cartes avec bouton : true = appuyé. */
  setButton(pressed: boolean): void;
  dispose(): void;
}
