// Moteur de simulation Raspberry Pi Pico (RP2040) basé sur rp2040js.
// Image bare-metal chargée en RAM (voir le moteur de compilation).
import { RP2040, GPIOPinState } from 'rp2040js';
import type { SimEngine } from './types.mjs';

const RAM_START = 0x20000000;
const STEPS_PER_FRAME = 400_000;

function gpioIndex(name: string): number | null {
  const m = /^(?:GP)?(\d+)$/.exec(name);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n < 30 ? n : null;
}

export class PicoEngine implements SimEngine {
  onUpdate: (() => void) | null = null;
  onSerial: ((chunk: string) => void) | null = null;

  private mcu: RP2040;
  private rafId: number | null = null;
  private running = false;

  constructor(program: Uint8Array) {
    this.mcu = new RP2040();
    this.mcu.sram.set(program, 0); // image chargée à 0x20000000
    this.mcu.core.VTOR = RAM_START;
    this.mcu.core.reset();
    for (const pin of this.mcu.gpio) {
      pin.addListener(() => this.onUpdate?.());
    }
  }

  readDigital(name: string): boolean {
    const i = gpioIndex(name);
    if (i === null) return false;
    return this.mcu.gpio[i].value === GPIOPinState.High;
  }

  setInput(name: string, value: boolean): void {
    const i = gpioIndex(name);
    if (i === null) return;
    this.mcu.gpio[i].setInputValue(value);
  }

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
