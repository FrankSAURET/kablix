// Moteur de simulation Raspberry Pi Pico (RP2040) basé sur rp2040js.
// Supporte deux modes :
//   'rp2040-ram'   : image bare-metal chargée en SRAM (table de vecteurs en RAM)
//   'rp2040-flash' : firmware UF2/ELF chargé en flash (SDK pico, MicroPython…)
import { RP2040, GPIOPinState } from 'rp2040js';
import type { SimEngine } from './types.mjs';

const RAM_START = 0x20000000;
const FLASH_START = 0x10000000;
const STEPS_PER_FRAME = 400_000;

// Offset de la table de vecteurs dans le flash pour les apps pico-sdk :
// 256 octets de stage-2 bootloader, puis les vecteurs de l'application.
const FLASH_VTOR_OFFSET = 0x100;

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

  constructor(program: Uint8Array, format: 'rp2040-ram' | 'rp2040-flash' = 'rp2040-ram') {
    this.mcu = new RP2040();

    if (format === 'rp2040-flash') {
      // Chargement en flash : firmware complet (pico-sdk, MicroPython, …).
      // On place le binaire au début du flash et on pointe VTOR sur la table
      // de vecteurs de l'application (après les 256 octets du stage-2).
      this.mcu.flash.set(program.slice(0, this.mcu.flash.length), 0);
      this.mcu.core.VTOR = FLASH_START + FLASH_VTOR_OFFSET;
    } else {
      // Chargement en RAM : binaire bare-metal avec table de vecteurs en tête.
      this.mcu.sram.set(program.slice(0, this.mcu.sram.length), 0);
      this.mcu.core.VTOR = RAM_START;
    }

    this.mcu.core.reset();

    // Sortie série UART0 (stdio par défaut sur le Pico).
    this.mcu.uart[0].onByte = (value: number) => {
      this.onSerial?.(String.fromCharCode(value));
    };

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
