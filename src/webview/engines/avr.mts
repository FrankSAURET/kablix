// Moteur de simulation Arduino AVR basé sur avr8js.
//   - 'avr328' : ATmega328P (Uno / Nano / Pro Mini) — broches 0–13, A0–A7 ;
//   - 'avr2560' : ATmega2560 (Mega) — broches 0–53, A0–A15, ports A–L.
// Expose un accès générique aux broches numériques, l'ADC et la liaison série
// (USART0 = Serial sur les deux familles). Les registres USART0 / timers 0-2 /
// ADC sont aux mêmes adresses sur le 328P et le 2560 : les configs avr8js
// conviennent aux deux. Limites Mega (« partiel ») : timers 3-5, USART1-3 et
// canaux ADC 8-15 (A8-A15) ne sont pas simulés.
import {
  CPU,
  avrInstruction,
  AVRIOPort,
  AVRUSART,
  AVRADC,
  AVRTimer,
  AVRTWI,
  twiConfig,
  AVRSPI,
  spiConfig,
  adcConfig,
  portAConfig,
  portBConfig,
  portCConfig,
  portDConfig,
  portEConfig,
  portFConfig,
  portGConfig,
  portHConfig,
  portJConfig,
  portKConfig,
  portLConfig,
  usart0Config,
  timer0Config,
  timer1Config,
  timer2Config,
  PinState,
} from 'avr8js';
import type {
  AvrDebugInfo,
  Breakpoint,
  DebugPauseState,
  DebugVariable,
  SimEngine,
  UltrasonicSensor,
} from './types.mjs';
import { selectSpiDevice, type I2cDevice, type SpiDevice } from './i2c-devices.mjs';
import { Ws2812Decoder } from './ws2812.mjs';

export type AvrFamily = 'avr328' | 'avr2560';

const CLOCK_HZ = 16_000_000;
const CYCLES_PER_US = CLOCK_HZ / 1_000_000; // 16 cycles = 1 µs
const VREF = 5;
// RAMEND du 2560 = 0x21FF : la pile démarre tout en haut de la SRAM, il faut donc
// dimensionner l'espace données pour le couvrir (data = sramBytes + 0x100).
const MEGA_SRAM_BYTES = 0x2200;

type PortKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L';

// Broche Arduino (nom) -> port AVR + index de bit. ATmega328P (Uno / Nano / Pro Mini).
const UNO_PINS: Record<string, [PortKey, number]> = {
  '0': ['D', 0], '1': ['D', 1], '2': ['D', 2], '3': ['D', 3],
  '4': ['D', 4], '5': ['D', 5], '6': ['D', 6], '7': ['D', 7],
  '8': ['B', 0], '9': ['B', 1], '10': ['B', 2], '11': ['B', 3],
  '12': ['B', 4], '13': ['B', 5],
  'A0': ['C', 0], 'A1': ['C', 1], 'A2': ['C', 2],
  'A3': ['C', 3], 'A4': ['C', 4], 'A5': ['C', 5],
};

// ATmega2560 (Mega) : correspondance broche Arduino -> port/bit (datasheet + variant Arduino).
const MEGA_PINS: Record<string, [PortKey, number]> = {
  '0': ['E', 0], '1': ['E', 1], '2': ['E', 4], '3': ['E', 5], '4': ['G', 5],
  '5': ['E', 3], '6': ['H', 3], '7': ['H', 4], '8': ['H', 5], '9': ['H', 6],
  '10': ['B', 4], '11': ['B', 5], '12': ['B', 6], '13': ['B', 7],
  '14': ['J', 1], '15': ['J', 0], '16': ['H', 1], '17': ['H', 0],
  '18': ['D', 3], '19': ['D', 2], '20': ['D', 1], '21': ['D', 0],
  '22': ['A', 0], '23': ['A', 1], '24': ['A', 2], '25': ['A', 3],
  '26': ['A', 4], '27': ['A', 5], '28': ['A', 6], '29': ['A', 7],
  '30': ['C', 7], '31': ['C', 6], '32': ['C', 5], '33': ['C', 4],
  '34': ['C', 3], '35': ['C', 2], '36': ['C', 1], '37': ['C', 0],
  '38': ['D', 7], '39': ['G', 2], '40': ['G', 1], '41': ['G', 0],
  '42': ['L', 7], '43': ['L', 6], '44': ['L', 5], '45': ['L', 4],
  '46': ['L', 3], '47': ['L', 2], '48': ['L', 1], '49': ['L', 0],
  '50': ['B', 3], '51': ['B', 2], '52': ['B', 1], '53': ['B', 0],
  'A0': ['F', 0], 'A1': ['F', 1], 'A2': ['F', 2], 'A3': ['F', 3],
  'A4': ['F', 4], 'A5': ['F', 5], 'A6': ['F', 6], 'A7': ['F', 7],
  'A8': ['K', 0], 'A9': ['K', 1], 'A10': ['K', 2], 'A11': ['K', 3],
  'A12': ['K', 4], 'A13': ['K', 5], 'A14': ['K', 6], 'A15': ['K', 7],
  'SDA': ['D', 1], 'SCL': ['D', 0],
};

// Broche analogique -> canal ADC. Le 328P expose A0-A5 ; le 2560 A0-A7 (canaux
// 0-7, port F). A8-A15 (canaux 8-15) nécessiteraient le bit MUX5 non géré.
const UNO_ADC: Record<string, number> = { A0: 0, A1: 1, A2: 2, A3: 3, A4: 4, A5: 5 };
const MEGA_ADC: Record<string, number> = { ...UNO_ADC, A6: 6, A7: 7 };

export class AvrEngine implements SimEngine {
  onUpdate: (() => void) | null = null;
  onSerial: ((chunk: string) => void) | null = null;
  onDebugPause: ((state: DebugPauseState) => void) | null = null;

  private cpu: CPU;
  private ports: Partial<Record<PortKey, AVRIOPort>>;
  private pinMap: Record<string, [PortKey, number]>;
  private adcMap: Record<string, number>;
  private usart: AVRUSART;
  private twi: AVRTWI;
  private spi: AVRSPI;
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

  // Famille AVR ciblée : 'avr328' (Uno / Nano / Pro Mini) ou 'avr2560' (Mega).
  private readonly family: AvrFamily;

  // Mesure de largeur d'impulsion (servo) : broches surveillées + état d'arête.
  private pulsePins: Array<{ name: string; port: PortKey; bit: number }> = [];
  private pulseState = new Map<string, { high: boolean; rise: number; lastUs: number; lastEdge: number }>();

  // Capteurs ultrason + actions d'entrée programmées en temps simulé (génération ECHO).
  private ultrasonic: UltrasonicSensor[] = [];
  private scheduled: Array<{ cycle: number; name: string; value: boolean }> = [];

  // Chaînes NeoPixel : décodeur WS2812 par broche DIN surveillée.
  private neopixels: Array<{ name: string; port: PortKey; bit: number; dec: Ws2812Decoder; last: boolean }> = [];

  constructor(
    program: Uint16Array,
    debugInfo?: AvrDebugInfo | null,
    family: AvrFamily = 'avr328'
  ) {
    this.family = family;
    this.debugInfo = debugInfo ?? null;
    const isMega = family === 'avr2560';
    // Le Mega a 8 Ko de SRAM (pile en haut, RAMEND 0x21FF) : l'espace données par
    // défaut (328P) serait trop petit et la pile déborderait.
    this.cpu = isMega ? new CPU(program.slice(), MEGA_SRAM_BYTES) : new CPU(program.slice());
    this.pinMap = isMega ? MEGA_PINS : UNO_PINS;
    this.adcMap = isMega ? MEGA_ADC : UNO_ADC;
    this.ports = isMega
      ? {
          A: new AVRIOPort(this.cpu, portAConfig),
          B: new AVRIOPort(this.cpu, portBConfig),
          C: new AVRIOPort(this.cpu, portCConfig),
          D: new AVRIOPort(this.cpu, portDConfig),
          E: new AVRIOPort(this.cpu, portEConfig),
          F: new AVRIOPort(this.cpu, portFConfig),
          G: new AVRIOPort(this.cpu, portGConfig),
          H: new AVRIOPort(this.cpu, portHConfig),
          J: new AVRIOPort(this.cpu, portJConfig),
          K: new AVRIOPort(this.cpu, portKConfig),
          L: new AVRIOPort(this.cpu, portLConfig),
        }
      : {
          B: new AVRIOPort(this.cpu, portBConfig),
          C: new AVRIOPort(this.cpu, portCConfig),
          D: new AVRIOPort(this.cpu, portDConfig),
        };
    this.usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);
    this.twi = new AVRTWI(this.cpu, twiConfig, CLOCK_HZ); // bus I²C (Wire) — esclaves branchés via setI2cDevices
    this.spi = new AVRSPI(this.cpu, spiConfig, CLOCK_HZ); // bus SPI — esclave branché via setSpiDevices
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.timers = [
      new AVRTimer(this.cpu, timer0Config),
      new AVRTimer(this.cpu, timer1Config),
      new AVRTimer(this.cpu, timer2Config),
    ];

    for (const port of Object.values(this.ports)) {
      // À chaque changement de port : échantillonne les impulsions (servo) puis
      // rafraîchit l'affichage.
      port?.addListener(() => {
        this.samplePulses();
        this.sampleNeopixels();
        this.onUpdate?.();
      });
    }
    this.usart.onByteTransmit = (b: number) => {
      const text = this.serialDecoder.decode(Uint8Array.of(b), { stream: true });
      if (text) this.onSerial?.(text);
    };
  }

  readDigital(name: string): boolean {
    const map = this.pinMap[name];
    if (!map) return false;
    const [port, bit] = map;
    return this.ports[port]?.pinState(bit) === PinState.High;
  }

  setInput(name: string, value: boolean): void {
    const map = this.pinMap[name];
    if (!map) return;
    const [port, bit] = map;
    this.ports[port]?.setPin(bit, value);
  }

  setPulseMonitors(names: string[]): void {
    this.pulsePins = [];
    for (const name of names) {
      const m = this.pinMap[name];
      if (!m) continue;
      this.pulsePins.push({ name, port: m[0], bit: m[1] });
      if (!this.pulseState.has(name)) this.pulseState.set(name, { high: false, rise: 0, lastUs: 0, lastEdge: 0 });
    }
  }

  readPulseUs(name: string): number {
    return this.pulseState.get(name)?.lastUs ?? 0;
  }

  /** Vrai si la broche a basculé récemment (< 60 ms simulées) = signal carré actif (tone/PWM). */
  pulseActive(name: string): boolean {
    const st = this.pulseState.get(name);
    if (!st) return false;
    return this.cpu.cycles - st.lastEdge < 60_000 * CYCLES_PER_US;
  }

  /** Relie des esclaves I²C au bus : le maître TWI route vers eux par adresse. */
  setI2cDevices(devices: I2cDevice[]): void {
    const twi = this.twi;
    let current: I2cDevice | null = null;
    twi.eventHandler = {
      start: (repeated: boolean) => {
        for (const d of devices) d.onStart?.(repeated);
        twi.completeStart();
      },
      stop: () => {
        current?.onStop?.();
        current = null;
        twi.completeStop();
      },
      connectToSlave: (addr: number) => {
        current = devices.find((d) => d.address === addr) ?? null;
        twi.completeConnect(current !== null); // ACK seulement si l'adresse existe
      },
      writeByte: (value: number) => {
        twi.completeWrite(current ? current.write(value) : false);
      },
      readByte: () => {
        twi.completeRead(current ? current.read() : 0xff);
      },
    };
  }

  setNeopixels(strips: Array<{ pin: string; count: number }>): void {
    this.neopixels = [];
    for (const s of strips) {
      const m = this.pinMap[s.pin];
      if (!m) continue;
      this.neopixels.push({
        name: s.pin,
        port: m[0],
        bit: m[1],
        dec: new Ws2812Decoder(s.count, CYCLES_PER_US),
        last: false,
      });
    }
  }

  readNeopixel(pin: string): Array<{ r: number; g: number; b: number }> {
    const n = this.neopixels.find((np) => np.name === pin);
    if (!n) return [];
    n.dec.flush(); // classe le dernier bit (la trame est terminée à la lecture)
    return n.dec.colors;
  }

  /** Alimente les décodeurs WS2812 avec les fronts des broches DIN surveillées. */
  private sampleNeopixels(): void {
    if (this.neopixels.length === 0) return;
    const now = this.cpu.cycles;
    for (const n of this.neopixels) {
      const level = this.ports[n.port]?.pinState(n.bit) === PinState.High;
      if (level !== n.last) {
        n.dec.edge(now, level);
        n.last = level;
      }
    }
  }

  /**
   * Relie des esclaves SPI : à chaque octet, on route vers le périphérique dont
   * la broche CS est active (bas), ou celui sans CS à défaut.
   */
  setSpiDevices(devices: SpiDevice[]): void {
    this.spi.onByte = (mosi: number) => {
      const dev = selectSpiDevice(devices, (p) => this.readDigital(p));
      if (!dev) {
        this.spi.completeTransfer(0xff);
        return;
      }
      const dc = dev.dcPin ? this.readDigital(dev.dcPin) : false;
      this.spi.completeTransfer(dev.transfer(mosi, dc));
    };
  }

  setUltrasonic(sensors: UltrasonicSensor[]): void {
    this.ultrasonic = sensors;
    this.scheduled = [];
    // Surveille les broches TRIG (en plus des broches déjà suivies, ex. servo).
    for (const s of sensors) {
      const m = this.pinMap[s.trig];
      if (!m) continue;
      if (!this.pulsePins.some((p) => p.name === s.trig)) {
        this.pulsePins.push({ name: s.trig, port: m[0], bit: m[1] });
      }
      if (!this.pulseState.has(s.trig)) {
        this.pulseState.set(s.trig, { high: false, rise: 0, lastUs: 0, lastEdge: 0 });
      }
    }
  }

  /** Mesure la durée de l'état haut sur les broches surveillées (front montant→descendant). */
  private samplePulses(): void {
    if (this.pulsePins.length === 0) return;
    const now = this.cpu.cycles;
    for (const pp of this.pulsePins) {
      const high = this.ports[pp.port]?.pinState(pp.bit) === PinState.High;
      const st = this.pulseState.get(pp.name);
      if (!st) continue;
      if (high && !st.high) {
        st.high = true;
        st.rise = now;
        st.lastEdge = now; // front montant : la broche bascule (activité)
      } else if (!high && st.high) {
        st.high = false;
        st.lastEdge = now; // front descendant
        const widthUs = (now - st.rise) / CYCLES_PER_US;
        st.lastUs = widthUs; // dernière largeur d'impulsion haute (servo, fréquence buzzer)
        this.maybeFireEcho(pp.name, widthUs); // une impulsion TRIG déclenche ECHO
      }
    }
  }

  /** Sur une impulsion TRIG valide (≥ 8 µs), programme l'impulsion ECHO correspondante. */
  private maybeFireEcho(trigName: string, widthUs: number): void {
    if (widthUs < 8) return;
    for (const s of this.ultrasonic) {
      if (s.trig !== trigName) continue;
      const cm = Math.max(2, Math.min(400, s.distanceCm || 0)); // plage HC-SR04 : 2–400 cm
      const start = this.cpu.cycles + 200 * CYCLES_PER_US; // ~200 µs de latence capteur
      const widthCycles = cm * 58 * CYCLES_PER_US; // 58 µs/cm (aller-retour)
      this.scheduled.push({ cycle: start, name: s.echo, value: true });
      this.scheduled.push({ cycle: start + widthCycles, name: s.echo, value: false });
    }
  }

  /** Applique les actions d'entrée programmées arrivées à échéance (temps simulé). */
  private fireScheduled(): void {
    const now = this.cpu.cycles;
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      if (now >= this.scheduled[i].cycle) {
        const a = this.scheduled[i];
        this.setInput(a.name, a.value);
        this.scheduled.splice(i, 1);
      }
    }
  }

  setAnalog(name: string, fraction: number): void {
    const ch = this.adcMap[name];
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

  /**
   * Convertit les lignes cochées en adresses flash (1re entrée par ligne). Les
   * conditions (champ `condition`) ne sont pas évaluées côté C/AVR : il faudrait
   * un évaluateur d'expression C sur les globales DWARF (hors périmètre). Un
   * point d'arrêt conditionnel en C se comporte donc comme inconditionnel.
   */
  setBreakpoints(breakpoints: Breakpoint[]): void {
    this.breakpoints.clear();
    if (!this.debugInfo) return;
    const wanted = new Set(breakpoints.map((b) => b.line));
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
        // Actions d'entrée programmées (ECHO ultrason) à échéance en temps simulé.
        if (this.scheduled.length > 0) this.fireScheduled();
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
