// Moteur de simulation Raspberry Pi Pico (RP2040) basé sur rp2040js.
// Deux modes de chargement :
//   - 'ram'   : image bare-metal copiée en SRAM (sortie du compilateur intégré) ;
//   - 'flash' : firmware UF2/ELF programmé en flash + bootrom B1 (pico-sdk,
//               MicroPython…), avec USB-CDC et UART0 reliés au moniteur série.
// En mode flash, un script MicroPython optionnel est injecté via le raw REPL
// (Ctrl-A … Ctrl-D) dès que l'USB est énuméré.
import { RP2040, Simulator, USBCDC, GPIOPinState, ConsoleLogger, LogLevel } from 'rp2040js';
import { bootromB1 } from './bootrom-b1.mjs';
import type { DebugPauseState, FlashSegment, SimEngine } from './types.mjs';

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
  | 'idle'         // pas de script à injecter
  | 'wait-raw'     // Ctrl-A envoyé, on attend l'invite du raw REPL
  | 'paste-hdr'    // \x05A\x01 envoyé, on attend « R\x01 » + taille de fenêtre
  | 'paste-stream' // envoi du script sous contrôle de flux (raw-paste)
  | 'paste-ack'    // tout envoyé + \x04, on attend l'accusé \x04 du firmware
  | 'wait-ok'      // mode dégradé sans raw-paste : on attend « OK »
  | 'stdout'       // le script s'exécute, sortie standard relayée
  | 'stderr'       // après le premier \x04 : sortie d'erreur relayée
  | 'done';        // exécution finie, repassé en REPL interactif

export class PicoEngine implements SimEngine {
  onUpdate: (() => void) | null = null;
  onSerial: ((chunk: string) => void) | null = null;
  onDebugPause: ((state: DebugPauseState) => void) | null = null;

  /** Pas à pas : défini uniquement en mode script MicroPython (cf. constructeur). */
  step?: () => void;

  private isPaused = false;
  private disposed = false;
  private sim: Simulator;
  private mcu: RP2040;
  private cdc: USBCDC | null = null;
  private script: string | null = null;
  private replPhase: ReplPhase = 'idle';
  private replBuffer = '';
  // Contrôle de flux raw-paste : le firmware accorde une fenêtre d'octets et
  // la ré-augmente (\x01) au fur et à mesure qu'il consomme le script.
  private scriptBytes: Uint8Array = new Uint8Array(0);
  private sendPos = 0;
  private pasteWindow = 0;
  private pasteIncrement = 0;
  private pasteHdr: number[] = [];
  /** Vrai si la pause courante a été obtenue par arrêt du simulateur (hors script). */
  private pausedByStop = false;
  /** Tampon de détection des séquences de débogage « \x1bKX…\n » du préambule __kx. */
  private kxBuf = '';

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
      // Le pas à pas n'existe qu'en mode script MicroPython instrumenté.
      if (this.script) this.step = () => this.doStep();

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
    this.disposed = true;
    this.stop();
  }

  get paused(): boolean {
    return this.isPaused;
  }

  /** Vrai quand le script MicroPython instrumenté est en cours d'exécution. */
  private get scriptRunning(): boolean {
    return this.script !== null && this.replPhase === 'stdout';
  }

  pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    if (this.scriptRunning) {
      // Pause coopérative : \x05 (ENQ) sera traité au prochain appel __kx du
      // script instrumenté. Le firmware doit continuer à tourner pour lire
      // stdin — surtout pas de sim.stop() ici.
      this.cdc?.sendSerialByte(0x05);
    } else {
      // Programme C bare-metal (ou script pas encore lancé) : gel du simulateur.
      this.pausedByStop = true;
      this.sim.stop();
      this.onDebugPause?.({ variables: [] });
      this.onUpdate?.();
    }
  }

  resume(): void {
    if (!this.isPaused || this.disposed) return;
    this.isPaused = false;
    if (this.pausedByStop) {
      this.pausedByStop = false;
      this.sim.execute();
    } else {
      // \x07 (BEL) : __kx désactive le mode pas à pas et rend la main au script.
      this.cdc?.sendSerialByte(0x07);
    }
  }

  /** Un pas de débogage MicroPython (exposé via `step` en mode script). */
  private doStep(): void {
    if (this.disposed || !this.scriptRunning || this.pausedByStop) return;
    if (!this.isPaused) {
      // Première pause : équivalent d'une demande de pause, l'état arrivera
      // au prochain __kx.
      this.isPaused = true;
      this.cdc?.sendSerialByte(0x05);
    } else {
      // \x06 (ACK) : exécute une ligne puis publie le nouvel état.
      this.cdc?.sendSerialByte(0x06);
    }
  }

  setSpeed(_fraction: number): void {
    // rp2040js ne propose pas de régulation fine ; le ralenti n'est pas
    // disponible sur le Pico (pause/reprise et pas à pas restent possibles).
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
      this.emitSerial(text);
      return;
    }
    for (const ch of text) this.handleReplChar(ch);
  }

  // --- Filtrage des séquences de débogage \x1bKX{json}\n ----------------------
  // Les octets arrivent par paquets arbitraires : un petit tampon reconstitue
  // la séquence avant de décider si elle va au moniteur ou au panneau Variables.
  private static readonly KX_PREFIX = '\x1bKX';

  private emitSerial(text: string): void {
    for (const ch of text) this.emitSerialChar(ch);
  }

  private emitSerialChar(ch: string): void {
    if (this.kxBuf.length === 0) {
      if (ch === '\x1b') {
        this.kxBuf = ch; // début possible d'une séquence KX
        return;
      }
      this.onSerial?.(ch);
      return;
    }
    this.kxBuf += ch;
    const prefix = PicoEngine.KX_PREFIX;
    if (this.kxBuf.length < prefix.length) {
      if (!prefix.startsWith(this.kxBuf)) this.flushKxBuf();
      return;
    }
    if (!this.kxBuf.startsWith(prefix)) {
      this.flushKxBuf();
      return;
    }
    if (ch === '\n') {
      // Séquence complète : jamais affichée, transformée en état de pause.
      const payload = this.kxBuf.slice(prefix.length).replace(/\r$/, '');
      this.kxBuf = '';
      this.handleKxLine(payload);
      return;
    }
    if (this.kxBuf.length > 4096) this.flushKxBuf(); // garde-fou anti-débordement
  }

  /** Restitue au moniteur un tampon qui n'était finalement pas une séquence KX. */
  private flushKxBuf(): void {
    const buf = this.kxBuf;
    this.kxBuf = '';
    this.onSerial?.(buf.slice(0, -1));
    // Le dernier caractère peut redémarrer une séquence : on le retraite.
    this.emitSerialChar(buf[buf.length - 1]);
  }

  /** Décode un état de pause publié par __kx et le relaie au panneau Variables. */
  private handleKxLine(json: string): void {
    try {
      const data = JSON.parse(json) as { l?: number; v?: Record<string, string> };
      // Pause effective confirmée par le script (mode pas à pas actif).
      this.isPaused = true;
      this.pausedByStop = false;
      this.onDebugPause?.({
        line: typeof data.l === 'number' ? data.l : undefined,
        variables: Object.entries(data.v ?? {}).map(([name, value]) => ({
          name,
          value: String(value),
        })),
      });
      this.onUpdate?.();
    } catch {
      // Séquence malformée : ignorée (jamais relayée au moniteur).
    }
  }

  /** Petit automate qui suit le protocole raw REPL caractère par caractère. */
  private handleReplChar(ch: string): void {
    const byte = ch.charCodeAt(0);
    switch (this.replPhase) {
      case 'wait-raw':
        this.replBuffer += ch;
        // Invite du raw REPL : « raw REPL; CTRL-B to exit\r\n> »
        if (this.replBuffer.includes('raw REPL; CTRL-B to exit') && ch === '>') {
          this.replBuffer = '';
          // Demande le mode raw-paste (\x05A\x01) : son contrôle de flux évite
          // de déborder le tampon d'entrée avec un script long (préambule de
          // débogage compris), quel que soit le rythme de la simulation.
          this.replPhase = 'paste-hdr';
          this.pasteHdr = [];
          this.cdc?.sendSerialByte(0x05);
          this.cdc?.sendSerialByte(0x41);
          this.cdc?.sendSerialByte(0x01);
        }
        break;
      case 'paste-hdr':
        // Réponse attendue : 'R' 0x01 puis fenêtre initiale sur 2 octets (LE).
        this.pasteHdr.push(byte);
        if (this.pasteHdr.length === 2 && (this.pasteHdr[0] !== 0x52 || this.pasteHdr[1] !== 0x01)) {
          // Firmware sans raw-paste : repli sur l'envoi direct historique.
          this.replPhase = 'wait-ok';
          this.sendScript();
        } else if (this.pasteHdr.length === 4) {
          this.pasteIncrement = this.pasteHdr[2] | (this.pasteHdr[3] << 8);
          this.pasteWindow = this.pasteIncrement;
          this.sendPos = 0;
          this.scriptBytes = new TextEncoder().encode(this.script ?? '');
          this.replPhase = 'paste-stream';
          this.sendPasteChunk();
        }
        break;
      case 'paste-stream':
        if (byte === 0x01) {
          // Le firmware a consommé une fenêtre : il en accorde une nouvelle.
          this.pasteWindow += this.pasteIncrement;
          this.sendPasteChunk();
        } else if (byte === 0x04) {
          // Abandon côté firmware : on clôt proprement et on suit la sortie.
          this.cdc?.sendSerialByte(0x04);
          this.replPhase = 'stdout';
        }
        break;
      case 'paste-ack':
        // Accusé de fin de données : la compilation puis l'exécution démarrent.
        if (byte === 0x04) this.replPhase = 'stdout';
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
        else this.emitSerial(ch);
        break;
      case 'stderr':
        if (ch === '\x04') {
          // Fin d'exécution : on repasse en REPL interactif (Ctrl-B).
          this.replPhase = 'done';
          this.cdc?.sendSerialByte(2);
          // Une pause coopérative ne peut plus aboutir : état remis au repos.
          if (this.isPaused && !this.pausedByStop) this.isPaused = false;
        } else {
          this.emitSerial(ch);
        }
        break;
      default:
        this.emitSerial(ch);
    }
  }

  /** Envoie le script dans la limite de la fenêtre accordée par le firmware. */
  private sendPasteChunk(): void {
    if (!this.cdc) return;
    while (this.pasteWindow > 0 && this.sendPos < this.scriptBytes.length) {
      this.cdc.sendSerialByte(this.scriptBytes[this.sendPos++]);
      this.pasteWindow--;
    }
    if (this.sendPos >= this.scriptBytes.length && this.replPhase === 'paste-stream') {
      this.cdc.sendSerialByte(0x04); // fin des données
      this.replPhase = 'paste-ack';
    }
  }

  /** Envoi direct (mode dégradé, firmwares sans raw-paste) : scripts courts. */
  private sendScript(): void {
    if (!this.cdc || !this.script) return;
    for (const byte of new TextEncoder().encode(this.script)) {
      this.cdc.sendSerialByte(byte);
    }
    this.cdc.sendSerialByte(4); // Ctrl-D : exécute
  }
}
