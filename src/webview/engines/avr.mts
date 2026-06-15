// Moteur de simulation Arduino Uno (ATmega328P) basé sur avr8js.
// Expose un accès générique aux broches numériques 0–13 et A0–A5, l'ADC
// (entrées analogiques A0–A5) et la liaison série bidirectionnelle (USART0).
import {
  CPU,
  avrInstruction,
  AVRIOPort,
  AVRUSART,
  AVRADC,
  AVRTimer,
  adcConfig,
  portBConfig,
  portCConfig,
  portDConfig,
  usart0Config,
  timer0Config,
  timer1Config,
  timer2Config,
  PinState,
} from 'avr8js';
import type { AvrDebugInfo, DebugPauseState, DebugVariable, SimEngine } from './types.mjs';

const CLOCK_HZ = 16_000_000;
const VREF = 5;

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

// Broche analogique -> canal ADC.
const ADC_CHANNELS: Record<string, number> = {
  A0: 0, A1: 1, A2: 2, A3: 3, A4: 4, A5: 5,
};

export class AvrEngine implements SimEngine {
  onUpdate: (() => void) | null = null;
  onSerial: ((chunk: string) => void) | null = null;
  onDebugPause: ((state: DebugPauseState) => void) | null = null;

  private cpu: CPU;
  private ports: Record<PortKey, AVRIOPort>;
  private usart: AVRUSART;
  private adc: AVRADC;
  // Timers 0/1/2 : indispensables pour millis()/micros()/delay() (sans eux la
  // boucle de delay() ne se terminait jamais et la simulation semblait planter).
  private timers: AVRTimer[];
  private rafId: number | null = null;
  private running = false;
  private rxQueue: number[] = [];
  private isPaused = false;
  private speed = 1; // fraction du temps réel exécutée à chaque frame
  private debugInfo: AvrDebugInfo | null = null;
  private breakpoints = new Set<number>(); // adresses flash (octets) des points d'arrêt
  private skipBreakAddr: number | null = null; // adresse à ne pas re-déclencher après un arrêt
  // Décodage UTF-8 incrémental de la liaison série : un caractère accentué
  // (ex. « é » = 2 octets) est émis octet par octet par l'USART ; le décodeur
  // en flux tampon les séquences incomplètes pour restituer le bon caractère.
  private serialDecoder = new TextDecoder('utf-8');

  constructor(program: Uint16Array, debugInfo?: AvrDebugInfo | null) {
    this.debugInfo = debugInfo ?? null;
    this.cpu = new CPU(program.slice());
    this.ports = {
      B: new AVRIOPort(this.cpu, portBConfig),
      C: new AVRIOPort(this.cpu, portCConfig),
      D: new AVRIOPort(this.cpu, portDConfig),
    };
    this.usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.timers = [
      new AVRTimer(this.cpu, timer0Config),
      new AVRTimer(this.cpu, timer1Config),
      new AVRTimer(this.cpu, timer2Config),
    ];

    for (const port of Object.values(this.ports)) {
      port.addListener(() => this.onUpdate?.());
    }
    this.usart.onByteTransmit = (b: number) => {
      const text = this.serialDecoder.decode(Uint8Array.of(b), { stream: true });
      if (text) this.onSerial?.(text);
    };
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

  setAnalog(name: string, fraction: number): void {
    const ch = ADC_CHANNELS[name];
    if (ch === undefined) return;
    this.adc.channelValues[ch] = Math.max(0, Math.min(1, fraction)) * VREF;
  }

  writeSerial(text: string): void {
    // Encodage UTF-8 (un caractère accentué saisi devient plusieurs octets).
    for (const byte of new TextEncoder().encode(text)) this.rxQueue.push(byte);
    this.flushRx();
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

  get paused(): boolean {
    return this.isPaused;
  }

  pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.emitDebugPause();
  }

  resume(): void {
    this.isPaused = false;
  }

  setSpeed(fraction: number): void {
    this.speed = Math.max(0.001, Math.min(1, fraction));
  }

  /** Avance jusqu'à la prochaine ligne source (ou un point d'arrêt). */
  step(): void {
    if (!this.debugInfo || this.debugInfo.lines.length === 0) return;
    this.isPaused = true; // le pas à pas s'exécute toujours en pause (émission en fin de pas)
    const startLine = this.currentLine();
    // Plafond ≈ 0,25 s simulée : un delay() long ne gèle pas l'interface ;
    // si le plafond est atteint, on reste en pause là où on est.
    for (let i = 0; i < 4_000_000; i++) {
      avrInstruction(this.cpu);
      this.cpu.tick();
      const pcBytes = this.cpu.pc * 2;
      if (pcBytes !== this.skipBreakAddr) this.skipBreakAddr = null;
      if (this.skipBreakAddr === null && this.breakpoints.has(pcBytes)) {
        this.skipBreakAddr = pcBytes; // ne pas re-déclencher au prochain départ
        break;
      }
      const line = this.lineForPc(pcBytes);
      if (line !== undefined && line !== startLine) break;
    }
    this.flushRx();
    this.emitDebugPause();
  }

  /** Convertit les lignes cochées en adresses flash (1re entrée par ligne). */
  setBreakpoints(lines: number[]): void {
    this.breakpoints.clear();
    if (!this.debugInfo) return;
    const wanted = new Set(lines);
    for (const entry of this.debugInfo.lines) {
      // Table triée par adresse : delete() ne retient que la première entrée.
      if (wanted.delete(entry.line)) this.breakpoints.add(entry.addr);
    }
  }

  /** Ligne source pour une adresse flash en octets (recherche dichotomique). */
  private lineForPc(pcBytes: number): number | undefined {
    const table = this.debugInfo?.lines;
    if (!table || table.length === 0 || pcBytes < table[0].addr) return undefined;
    let lo = 0;
    let hi = table.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (table[mid].addr <= pcBytes) lo = mid;
      else hi = mid - 1;
    }
    return table[lo].line;
  }

  /** Ligne source associée au PC courant, d'après la table DWARF. */
  private currentLine(): number | undefined {
    return this.lineForPc(this.cpu.pc * 2); // PC AVR en mots, table DWARF en octets
  }

  /** Lit les globales en SRAM (little-endian) pour le panneau Variables. */
  private readVariables(): DebugVariable[] {
    if (!this.debugInfo) return [];
    const data = this.cpu.data;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const out: DebugVariable[] = [];
    for (const g of this.debugInfo.globals) {
      if (g.addr + g.size > data.length) continue;
      const type = (g.type ?? '').toLowerCase();
      const unsigned = type.includes('unsigned') || type.startsWith('uint') || type === 'bool';
      let value: string;
      if (g.size === 4 && type.includes('float')) {
        // Float IEEE 754 ; arrondi pour masquer le bruit binaire (3.1400001…).
        value = String(Math.round(view.getFloat32(g.addr, true) * 1e6) / 1e6);
      } else if (g.size === 1) {
        const n = unsigned ? view.getUint8(g.addr) : view.getInt8(g.addr);
        value = type.includes('bool') ? (n ? 'true' : 'false') : String(n);
      } else if (g.size === 2) {
        value = String(unsigned ? view.getUint16(g.addr, true) : view.getInt16(g.addr, true));
      } else {
        value = String(unsigned ? view.getUint32(g.addr, true) : view.getInt32(g.addr, true));
      }
      out.push({ name: g.name, value, type: g.type });
    }
    return out;
  }

  /** Publie l'état courant (ligne + variables) vers le panneau de débogage. */
  private emitDebugPause(): void {
    if (!this.onDebugPause) return;
    this.onDebugPause({ line: this.currentLine(), variables: this.readVariables() });
    this.onUpdate?.();
  }

  // L'USART ne peut recevoir qu'un octet à la fois : on vide la file dès que
  // le récepteur est libre (réessai à la frame suivante sinon).
  private flushRx(): void {
    while (this.rxQueue.length > 0 && !this.usart.rxBusy) {
      const ok = this.usart.writeByte(this.rxQueue[0]);
      if (!ok) break;
      this.rxQueue.shift();
    }
  }

  private loop = (): void => {
    if (!this.running) return;
    if (!this.isPaused) {
      // Ralenti : on n'exécute qu'une fraction du budget de cycles par frame.
      const deadline = this.cpu.cycles + (CLOCK_HZ / 60) * this.speed;
      while (this.cpu.cycles < deadline && !this.isPaused) {
        avrInstruction(this.cpu);
        this.cpu.tick();
        // Points d'arrêt : test du PC (en octets) après chaque instruction.
        if (this.breakpoints.size > 0) {
          const pcBytes = this.cpu.pc * 2;
          if (pcBytes !== this.skipBreakAddr) this.skipBreakAddr = null;
          if (this.skipBreakAddr === null && this.breakpoints.has(pcBytes)) {
            this.skipBreakAddr = pcBytes; // resume() repartira sans re-déclencher ici
            this.pause(); // émet l'état et interrompt la boucle (isPaused)
          }
        }
      }
      this.flushRx();
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
}
