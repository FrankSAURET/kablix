// Moteur de simulation Raspberry Pi Pico (RP2040) basé sur rp2040js.
// Composant exposé : LED embarquée sur GPIO25.
import { RP2040, GPIOPinState } from 'rp2040js';
import type { BoardLayout, EngineCallbacks, SimEngine } from './types.mjs';

const RAM_START = 0x20000000;
const LED_GPIO = 25;
const STEPS_PER_FRAME = 400_000;

export class PicoEngine implements SimEngine {
  readonly layout: BoardLayout = {
    name: 'Raspberry Pi Pico (RP2040)',
    cssClass: 'board--pico',
    leds: [{ id: 'led', label: 'LED (GP25)', color: '#4dff7a' }],
    hasButton: false,
  };

  private mcu: RP2040;
  private rafId: number | null = null;
  private running = false;

  constructor(program: Uint8Array, private readonly cb: EngineCallbacks) {
    this.mcu = new RP2040();
    this.mcu.sram.set(program, 0); // image chargée à 0x20000000
    this.mcu.core.VTOR = RAM_START;
    this.mcu.core.reset();

    this.mcu.gpio[LED_GPIO].addListener((state) => {
      this.cb.onLed('led', state === GPIOPinState.High);
    });
  }

  // Le Pico de démo n'a pas de bouton utilisateur.
  setButton(): void {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  dispose(): void {
    this.stop();
  }

  private loop = (): void => {
    if (!this.running) return;
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      this.mcu.step();
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
}
