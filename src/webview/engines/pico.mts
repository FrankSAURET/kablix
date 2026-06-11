// Moteur de simulation Raspberry Pi Pico (RP2040) basé sur rp2040js.
// Deux modes de chargement :
//   - 'ram'   : image bare-metal copiée en SRAM (sortie du compilateur intégré) ;
//   - 'flash' : firmware UF2/ELF programmé en flash + bootrom B1 (pico-sdk,
//               MicroPython…), avec USB-CDC et UART0 reliés au moniteur série.
// En mode flash, un script MicroPython optionnel est injecté via le raw REPL
// (Ctrl-A … Ctrl-D) dès que l'USB est énuméré.
import { RP2040, Simulator, USBCDC, GPIOPinState, ConsoleLogger, LogLevel } from 'rp2040js';
import { bootromB1 } from './bootrom-b1.mjs';
import type { FlashSegment, SimEngine } from './types.mjs';

const RAM_START = 0x20000000;
const FLASH_START = 0x10000000;

export type PicoProgram =
  | { kind: 'ram'; image: Uint8Array }
  | { kind: 'flash'; segments: FlashSegment[]; script?: string };

function gpioIndex(name: string): number | null {
  const m = /^(?:GP)?(\d+)$/.exec(name);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n < 30 ? n : null;
}

// Canal ADC d'une broche analogique (GP26..GP28 -> 0..2).
function adcChannel(name: string): number | null {
  const i = gpioIndex(name);
  return i !== null && i >= 26 && i <= 29 ? i - 26 : null;
}

/** États successifs de l'injection d'un script via le raw REPL MicroPython. */
type ReplPhase =
  | 'idle'        // pas de script à injecter
  | 'wait-raw'    // Ctrl-A envoyé, on attend l'invite du raw REPL
  | 'wait-ok'     // script envoyé, on attend la confirmation « OK »
  | 'stdout'      // le script s'exécute, sortie standard relayée
  | 'stderr'      // après le premier \x04 : sortie d'erreur relayée
  | 'done';       // exécution finie, repassé en REPL interactif

export class PicoEngine implements SimEngine {
  onUpdate: (() => void) | null = null;
  onSerial: ((chunk: string) => void) | null = null;

  private sim: Simulator;
  private mcu: RP2040;
  private cdc: USBCDC | null = null;
  private script: string | null = null;
  private replPhase: ReplPhase = 'idle';
  private replBuffer = '';

  constructor(program: PicoProgram) {
    this.sim = new Simulator();
    this.mcu = this.sim.rp2040;
    this.mcu.logger = new ConsoleLogger(LogLevel.Error);

    if (program.kind === 'ram') {
      this.mcu.sram.set(program.image, 0); // image chargée à 0x20000000
      this.mcu.core.VTOR = RAM_START;
      this.mcu.core.reset();
    } else {
      // Bootrom B1 requis : les firmwares pico-sdk/MicroPython appellent ses
      // fonctions ROM (boot2, routines flottantes, memcpy…).
      this.mcu.loadBootrom(bootromB1);
      for (const seg of program.segments) {
        const offset = seg.addr - FLASH_START;
        if (offset < 0 || offset + seg.data.length > this.mcu.flash.length) continue;
        this.mcu.flash.set(seg.data, offset);
      }
      this.script = program.script ?? null;

      this.cdc = new USBCDC(this.mcu.usbCtrl);
      this.cdc.onSerialData = (buffer) => this.onCdcData(buffer);
      this.cdc.onDeviceConnected = () => this.onCdcConnected();

      // Démarrage identique au bootrom réel : exécution de boot2 en début de flash.
      this.mcu.core.PC = FLASH_START;
    }

    for (const pin of this.mcu.gpio) {
      pin.addListener(() => this.onUpdate?.());
    }
    // UART0 relié au moniteur série (programmes C bare-metal / pico-sdk).
    this.mcu.uart[0].onByte = (value) => this.onSerial?.(String.fromCharCode(value));
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

  setAnalog(name: string, fraction: number): void {
    const ch = adcChannel(name);
    if (ch === null) return;
    // rp2040js attend la valeur brute 12 bits du convertisseur.
    this.mcu.adc.channelValues[ch] = Math.round(Math.max(0, Math.min(1, fraction)) * 0xfff);
  }

  writeSerial(text: string): void {
    for (const byte of new TextEncoder().encode(text)) {
      this.cdc?.sendSerialByte(byte);
      this.mcu.uart[0].feedByte(byte);
    }
  }

  start(): void {
    if (!this.sim.executing) this.sim.execute();
  }

  stop(): void {
    this.sim.stop();
  }

  dispose(): void {
    this.stop();
  }

  // --- USB-CDC : console MicroPython + injection raw REPL ---------------------
  private onCdcConnected(): void {
    if (!this.cdc) return;
    if (this.script) {
      // Ctrl-C ×2 : interrompt un éventuel main.py, puis Ctrl-A : raw REPL.
      this.replPhase = 'wait-raw';
      this.cdc.sendSerialByte(3);
      this.cdc.sendSerialByte(3);
      this.cdc.sendSerialByte(1);
    } else {
      // Affiche simplement l'invite REPL dans le moniteur.
      this.cdc.sendSerialByte(13);
      this.cdc.sendSerialByte(10);
    }
  }

  private onCdcData(buffer: Uint8Array): void {
    const text = Array.from(buffer, (b) => String.fromCharCode(b)).join('');
    if (this.replPhase === 'idle' || this.replPhase === 'done') {
      this.onSerial?.(text);
      return;
    }
    for (const ch of text) this.handleReplChar(ch);
  }

  /** Petit automate qui suit le protocole raw REPL caractère par caractère. */
  private handleReplChar(ch: string): void {
    switch (this.replPhase) {
      case 'wait-raw':
        this.replBuffer += ch;
        // Invite du raw REPL : « raw REPL; CTRL-B to exit\r\n> »
        if (this.replBuffer.includes('raw REPL; CTRL-B to exit') && ch === '>') {
          this.replBuffer = '';
          this.replPhase = 'wait-ok';
          this.sendScript();
        }
        break;
      case 'wait-ok':
        this.replBuffer += ch;
        if (this.replBuffer.endsWith('OK')) {
          this.replBuffer = '';
          this.replPhase = 'stdout';
        }
        break;
      case 'stdout':
        if (ch === '\x04') this.replPhase = 'stderr';
        else this.onSerial?.(ch);
        break;
      case 'stderr':
        if (ch === '\x04') {
          // Fin d'exécution : on repasse en REPL interactif (Ctrl-B).
          this.replPhase = 'done';
          this.cdc?.sendSerialByte(2);
        } else {
          this.onSerial?.(ch);
        }
        break;
      default:
        this.onSerial?.(ch);
    }
  }

  private sendScript(): void {
    if (!this.cdc || !this.script) return;
    for (const byte of new TextEncoder().encode(this.script)) {
      this.cdc.sendSerialByte(byte);
    }
    this.cdc.sendSerialByte(4); // Ctrl-D : exécute
  }
}
