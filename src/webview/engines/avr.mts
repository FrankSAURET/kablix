// Moteur de simulation Arduino Uno (ATmega328P) basé sur avr8js.
// Expose un accès générique aux broches numériques 0–13 et A0–A5, ainsi que la
// liaison série (USART0).
import {
  CPU,
  avrInstruction,
  AVRIOPort,
  AVRUSART,
  portBConfig,
  portCConfig,
  portDConfig,
  usart0Config,
  PinState,
} from 'avr8js';
import type { SimEngine } from './types.mjs';

const CLOCK_HZ = 16_000_000;

type PortKey = 'B' | 'C' | 'D';

// Broche Arduino (nom) -> port AVR + index de bit.
const UNO_PINS: Record<string, [PortKey, number]> = {
  '0': ['D', 0], '1': ['D', 1], '2': ['D', 2], '3': ['D', 3],
  '4': ['D', 4], '5': ['D', 5], '6': ['D', 6], '7': ['D', 7],
  '8': ['B', 0], '9': ['B', 1], '10': ['B', 2], '11': ['B', 3],
  '12': ['B', 4], '13': ['B', 5],
  'A0': ['C', 0], 'A1': ['C', 1], 'A2': ['C', 2],
  'A3': ['C', 3], 'A4': ['C', 4], 'A5': ['C', 5],
};

export class AvrEngine implements SimEngine {
  onUpdate: (() => void) | null = null;
  onSerial: ((chunk: string) => void) | null = null;

  private cpu: CPU;
  private ports: Record<PortKey, AVRIOPort>;
  private usart: AVRUSART;
  private rafId: number | null = null;
  private running = false;

  constructor(program: Uint16Array) {
    this.cpu = new CPU(program.slice());
    this.ports = {
      B: new AVRIOPort(this.cpu, portBConfig),
      C: new AVRIOPort(this.cpu, portCConfig),
      D: new AVRIOPort(this.cpu, portDConfig),
    };
    this.usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);

    for (const port of Object.values(this.ports)) {
      port.addListener(() => this.onUpdate?.());
    }
    this.usart.onByteTransmit = (b: number) => this.onSerial?.(String.fromCharCode(b));
  }

  readDigital(name: string): boolean {
    const map = UNO_PINS[name];
    if (!map) return false;
    const [port, bit] = map;
    return this.ports[port].pinState(bit) === PinState.High;
  }

  setInput(name: string, value: boolean): void {
    const map = UNO_PINS[name];
    if (!map) return;
    const [port, bit] = map;
    this.ports[port].setPin(bit, value);
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
    const deadline = this.cpu.cycles + CLOCK_HZ / 60;
    while (this.cpu.cycles < deadline) {
      avrInstruction(this.cpu);
      this.cpu.tick();
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
}
