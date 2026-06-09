// Moteur de simulation Arduino Uno (ATmega328P) basé sur avr8js.
// Composants exposés : LED D13 (PB5), LED D8 (PB0), bouton D2 (PD2), série USART0.
import {
  CPU,
  avrInstruction,
  AVRIOPort,
  AVRUSART,
  portBConfig,
  portDConfig,
  usart0Config,
  PinState,
} from 'avr8js';
import type { BoardLayout, EngineCallbacks, SimEngine } from './types.mjs';

const CLOCK_HZ = 16_000_000;

export class AvrEngine implements SimEngine {
  readonly layout: BoardLayout = {
    name: 'Arduino Uno (ATmega328P)',
    cssClass: 'board--uno',
    leds: [
      { id: 'd13', label: 'D13', color: '#ff4d4d' },
      { id: 'd8', label: 'D8', color: '#4dff7a' },
    ],
    hasButton: true,
    buttonLabel: 'D2',
  };

  private cpu: CPU;
  private portB: AVRIOPort;
  private portD: AVRIOPort;
  private usart: AVRUSART;
  private rafId: number | null = null;
  private running = false;

  constructor(program: Uint16Array, private readonly cb: EngineCallbacks) {
    this.cpu = new CPU(program.slice());
    this.portB = new AVRIOPort(this.cpu, portBConfig);
    this.portD = new AVRIOPort(this.cpu, portDConfig);
    this.usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);

    this.portB.addListener(() => {
      this.cb.onLed('d13', this.portB.pinState(5) === PinState.High);
      this.cb.onLed('d8', this.portB.pinState(0) === PinState.High);
    });
    this.usart.onByteTransmit = (b: number) => {
      this.cb.onSerial(String.fromCharCode(b));
    };

    // Bouton relâché au départ : on émule le pull-up en pilotant la broche haut.
    this.setButton(false);
  }

  setButton(pressed: boolean): void {
    // Bouton câblé vers la masse : appuyé = niveau bas, relâché = pull-up (haut).
    this.portD.setPin(2, !pressed);
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
