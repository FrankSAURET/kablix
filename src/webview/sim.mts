// Contrôleur de la webview Kablix : atelier visuel (placement + câblage),
// simulation Arduino Uno (avr8js) / Raspberry Pi Pico (rp2040js) et
// messagerie avec l'extension.
import '@wokwi/elements/dist/esm/arduino-uno-element.js';
import '@wokwi/elements/dist/esm/arduino-nano-element.js';
import '@wokwi/elements/dist/esm/arduino-mega-element.js';
import '@wokwi/elements/dist/esm/led-element.js';
import '@wokwi/elements/dist/esm/pushbutton-element.js';
import '@wokwi/elements/dist/esm/resistor-element.js';
import '@wokwi/elements/dist/esm/rgb-led-element.js';
import '@wokwi/elements/dist/esm/buzzer-element.js';
import '@wokwi/elements/dist/esm/potentiometer-element.js';
import '@wokwi/elements/dist/esm/slide-potentiometer-element.js';
import '@wokwi/elements/dist/esm/7segment-element.js';
import '@wokwi/elements/dist/esm/led-bar-graph-element.js';
import '@wokwi/elements/dist/esm/slide-switch-element.js';
import '@wokwi/elements/dist/esm/dip-switch-8-element.js';
import '@wokwi/elements/dist/esm/analog-joystick-element.js';
import '@wokwi/elements/dist/esm/photoresistor-sensor-element.js';
import '@wokwi/elements/dist/esm/pir-motion-sensor-element.js';
import '@wokwi/elements/dist/esm/tilt-switch-element.js';
import '@wokwi/elements/dist/esm/servo-element.js';
// Composants supplémentaires importés du catalogue @wokwi/elements.
import '@wokwi/elements/dist/esm/lcd1602-element.js';
import '@wokwi/elements/dist/esm/lcd2004-element.js';
import '@wokwi/elements/dist/esm/ssd1306-element.js';
import '@wokwi/elements/dist/esm/ili9341-element.js';
import '@wokwi/elements/dist/esm/microsd-card-element.js';
import '@wokwi/elements/dist/esm/neopixel-element.js';
import '@wokwi/elements/dist/esm/neopixel-matrix-element.js';
import '@wokwi/elements/dist/esm/led-ring-element.js';
import '@wokwi/elements/dist/esm/pushbutton-6mm-element.js';
import '@wokwi/elements/dist/esm/ntc-temperature-sensor-element.js';
import '@wokwi/elements/dist/esm/gas-sensor-element.js';
import '@wokwi/elements/dist/esm/heart-beat-sensor-element.js';
import '@wokwi/elements/dist/esm/flame-sensor-element.js';
import '@wokwi/elements/dist/esm/small-sound-sensor-element.js';
import '@wokwi/elements/dist/esm/hc-sr04-element.js';
import '@wokwi/elements/dist/esm/dht22-element.js';
import '@wokwi/elements/dist/esm/membrane-keypad-element.js';
import './elements/pico-board.mjs';
import './elements/breadboard.mjs';
import './elements/custom-part.mjs';
import './elements/slide-pot.mjs';

import { initLocale, t } from './i18n.mjs';
import { Editor, type PaletteState } from './diagram/editor.mjs';
import { partDef, boardFamily, isBoardId, type BoardId, type CustomPartData } from './diagram/catalog.mjs';
import { toWokwiDiagram, fromWokwiDiagram } from './diagram/wokwi.mjs';
import {
  ledOn,
  rgbLedState,
  buzzerOn,
  sevenSegmentState,
  sevenSegmentDigit,
  ledBarState,
  buttonBindings,
  potBindings,
  slideSwitchBindings,
  dipSwitchBindings,
  joystickBindings,
  digitalSourceBindings,
  analogSourceBindings,
  servoBindings,
  buzzerBindings,
  ultrasonicBindings,
  keypadBindings,
  dht22Bindings,
  pca9685Bindings,
  neopixelBindings,
  spiDeviceBindings,
  type Pca9685Binding,
} from './diagram/model.mjs';
import { AvrEngine } from './engines/avr.mjs';
import { PicoEngine, type PicoProgram } from './engines/pico.mjs';
import {
  Lcd1602Device,
  Pca9685Device,
  Ssd1306Device,
  Ili9341Device,
  SdCardSpiDevice,
  type I2cDevice,
  type SpiDevice,
} from './engines/i2c-devices.mjs';
import type {
  AvrDebugInfo,
  Breakpoint,
  DebugPauseState,
  KeypadConfig,
  SimEngine,
} from './engines/types.mjs';
import { UNO_DEMO } from './programs/uno-demo.mjs';
import { PICO_BLINK } from './programs/pico-blink.mjs';

interface VsCodeApi {
  postMessage(message: unknown): void;
  /** État persistant de la webview (survit au déplacement / rechargement de l'onglet). */
  getState(): unknown;
  setState(state: unknown): void;
}

/** État sauvegardé dans la webview pour survivre à un déplacement d'onglet. */
interface PersistedState {
  diagram?: { parts?: unknown[]; wires?: unknown[] };
  board?: BoardId;
  showLabels?: boolean;
}
declare function acquireVsCodeApi(): VsCodeApi;
declare global {
  interface Window {
    KABLIX_LANG?: string;
  }
}
initLocale(window.KABLIX_LANG);
const vscode = acquireVsCodeApi();
// Atelier sauvegardé d'un précédent affichage (déplacement d'onglet) ; restauré
// une fois les composants personnalisés chargés, puis oublié.
let restoredState = vscode.getState() as PersistedState | undefined;

const boardSelect = document.getElementById('board') as HTMLSelectElement;
const runBtn = document.getElementById('run') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const loadBtn = document.getElementById('load-workspace') as HTMLButtonElement;
const exportBtn = document.getElementById('export-svg') as HTMLButtonElement;
const saveProjectBtn = document.getElementById('save-project') as HTMLButtonElement;
const openProjectBtn = document.getElementById('open-project') as HTMLButtonElement;
const labelsBtn = document.getElementById('toggle-labels') as HTMLButtonElement;
const helpBtn = document.getElementById('open-help') as HTMLButtonElement;
const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
const stepBtn = document.getElementById('step') as HTMLButtonElement;
const speedSelect = document.getElementById('speed') as HTMLSelectElement;
const debugSection = document.getElementById('debug') as HTMLElement;
const workshopEl = document.querySelector('.workshop') as HTMLElement;
const stageEl = document.querySelector('.stage') as HTMLElement;
const serialEl0 = document.querySelector('.serial') as HTMLElement;
const debugLineEl = document.getElementById('debug-line') as HTMLSpanElement;
const debugVarsEl = document.getElementById('debug-vars') as HTMLTableElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const serialEl = document.getElementById('serial') as HTMLPreElement;
const serialInput = document.getElementById('serial-input') as HTMLInputElement;
const serialSend = document.getElementById('serial-send') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-serial') as HTMLButtonElement;
const canvas = document.getElementById('canvas') as HTMLDivElement;
const palette = document.getElementById('palette') as HTMLDivElement;
const wiresSvg = document.getElementById('wires') as unknown as SVGSVGElement;
const inspector = document.getElementById('inspector') as HTMLDivElement;
const codeFileBtn = document.getElementById('code-file') as HTMLButtonElement;
const resetSimBtn = document.getElementById('reset-sim') as HTMLButtonElement;
const clearCanvasBtn = document.getElementById('clear-canvas') as HTMLButtonElement;
const fitViewBtn = document.getElementById('fit-view') as HTMLButtonElement;
const autoRouteBtn = document.getElementById('auto-route') as HTMLButtonElement;

const editor = new Editor(canvas, palette, wiresSvg, inspector);

let board: BoardId = 'uno';
let engine: SimEngine | null = null;
let unoProgram: Uint16Array = UNO_DEMO;
let unoDebugInfo: AvrDebugInfo | null = null;
let picoProgram: PicoProgram = { kind: 'ram', image: PICO_BLINK };
let inputRemovers: Array<() => void> = [];
// Périphériques I²C de la simulation en cours (partId → appareil décodeur).
let i2cDevices = new Map<string, Lcd1602Device | Pca9685Device | Ssd1306Device>();
// Canaux PCA9685 → composants pilotés (calculé au câblage).
let pcaBindings: Pca9685Binding[] = [];
// Chaînes NeoPixel : partId → broche MCU DIN (pour lire les couleurs décodées).
let neopixelTargets = new Map<string, string>();
// Buzzers : partId → broche MCU pilotant le buzzer (pour la fréquence du son).
let buzzerTargets = new Map<string, string>();
// Écrans SPI : partId → appareil (rendu de l'image). OLED SSD1306 / TFT ILI9341.
let spiOledDevices = new Map<string, Ssd1306Device>();
let spiTftDevices = new Map<string, Ili9341Device>();
// Afficheurs 7 segments multi-chiffres : partId → segments mémorisés (latch) de
// chaque chiffre (le balayage n'éclaire qu'un chiffre à la fois ; on conserve la
// dernière valeur connue de chacun pour reconstituer l'affichage complet).
let sevenSegLatch = new Map<string, number[]>();
let breakpoints: Breakpoint[] = []; // points d'arrêt envoyés par l'extension (ligne + condition)
// Vrai dès qu'un programme compilé/chargé a été reçu : sinon, lancer la
// simulation déclenche d'abord une compilation automatique du fichier de code.
let programLoaded = false;

const setStatus = (text: string): void => {
  statusEl.textContent = text;
};

const appendSerial = (chunk: string): void => {
  serialEl.textContent += chunk;
  serialEl.scrollTop = serialEl.scrollHeight;
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- Son des buzzers (Web Audio) ---------------------------------------------
// Un oscillateur par buzzer actif : la fréquence suit le signal qui le pilote
// (tone()/PWM mesuré en largeur d'impulsion → f = 1 / période) ; à défaut d'un
// signal mesurable (broche maintenue haute), un bip par défaut est émis.
const buzzerAudio = (() => {
  type Voice = { osc: OscillatorNode; gain: GainNode };
  let ctx: AudioContext | null = null;
  const voices = new Map<string, Voice>();
  const DEFAULT_HZ = 2000; // bip d'un buzzer « actif » sans signal toggling

  const ensureCtx = (): AudioContext | null => {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };

  return {
    /** Réveille le contexte audio (à appeler sur un geste utilisateur : ▶). */
    resume(): void {
      ensureCtx();
    },
    /** Active/met à jour le son d'un buzzer (freqHz ≤ 0 → fréquence par défaut). */
    set(id: string, freqHz: number): void {
      const audio = ensureCtx();
      if (!audio) return;
      const hz = freqHz > 20 && freqHz < 20000 ? freqHz : DEFAULT_HZ;
      let v = voices.get(id);
      if (!v) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'square';
        gain.gain.value = 0.04; // volume discret
        osc.connect(gain).connect(audio.destination);
        osc.start();
        v = { osc, gain };
        voices.set(id, v);
      }
      v.osc.frequency.setValueAtTime(hz, audio.currentTime);
    },
    /** Coupe le son d'un buzzer. */
    clear(id: string): void {
      const v = voices.get(id);
      if (!v) return;
      try {
        v.osc.stop();
        v.osc.disconnect();
        v.gain.disconnect();
      } catch {
        // déjà arrêté
      }
      voices.delete(id);
    },
    /** Coupe tous les buzzers (arrêt / réinitialisation de la simulation). */
    stopAll(): void {
      for (const id of [...voices.keys()]) this.clear(id);
    },
  };
})();

// --- Rafraîchissement visuel (limité à une fois par frame) -------------------
let refreshQueued = false;

function queueRefresh(): void {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    refreshVisuals();
  });
}

function refreshVisuals(): void {
  if (!engine) return;
  const read = (name: string): boolean => engine!.readDigital(name);
  const servoTargets = new Map(servoBindings(editor.diagram).map((b) => [b.partId, b.mcuPin]));
  for (const part of editor.diagram.parts) {
    const def = partDef(part.type);
    const el = editor.elementOf(part.id);
    if (!el) continue;
    switch (def.kind) {
      case 'led':
        if (def.custom) el.active = ledOn(editor.diagram, part.id, read);
        else el.value = ledOn(editor.diagram, part.id, read);
        break;
      case 'rgb-led': {
        const s = rgbLedState(editor.diagram, part.id, read);
        el.ledRed = s.red ? 1 : 0;
        el.ledGreen = s.green ? 1 : 0;
        el.ledBlue = s.blue ? 1 : 0;
        break;
      }
      case 'buzzer': {
        // Un buzzer piloté par tone()/PWM voit sa broche osciller vite : tester
        // le niveau instantané (buzzerOn) couperait le son entre deux frames. On
        // le considère donc actif si la broche BASCULE (pulseActive) — signal
        // carré — ou, à défaut, s'il y a une tension continue (buzzer actif).
        const pin = buzzerTargets.get(part.id);
        const toggling = pin ? engine.pulseActive?.(pin) ?? false : false;
        const on = toggling || buzzerOn(editor.diagram, part.id, read);
        if (def.custom) el.active = on;
        else el.hasSignal = on;
        if (on) {
          // Fréquence d'après la largeur de l'impulsion haute (signal carré de
          // tone()/PWM : période = 2 × largeur haute → f = 1e6 / (2 × largeur)).
          const highUs = pin && toggling ? engine.readPulseUs?.(pin) ?? 0 : 0;
          buzzerAudio.set(part.id, highUs > 0 ? 1e6 / (2 * highUs) : 0);
        } else {
          buzzerAudio.clear(part.id);
        }
        break;
      }
      case '7segment': {
        const digits = Math.max(1, Number(part.attrs?.digits ?? 1) || 1);
        if (digits <= 1) {
          el.values = sevenSegmentState(editor.diagram, part.id, read);
        } else {
          // Multiplexage : on échantillonne le chiffre actuellement sélectionné
          // (broche DIGn active) et on mémorise ses segments ; les autres gardent
          // leur dernière valeur connue → l'affichage complet reste stable.
          const commonAnode = part.attrs?.common === 'anode';
          let latch = sevenSegLatch.get(part.id);
          if (!latch || latch.length !== digits * 8) {
            latch = new Array(digits * 8).fill(0);
            sevenSegLatch.set(part.id, latch);
          }
          for (let d = 0; d < digits; d++) {
            const { active, values } = sevenSegmentDigit(
              editor.diagram, part.id, read, `DIG${d + 1}`, commonAnode
            );
            if (active) for (let s = 0; s < 8; s++) latch[d * 8 + s] = values[s];
          }
          el.values = latch.slice();
        }
        break;
      }
      case 'led-bar':
        el.values = ledBarState(editor.diagram, part.id, read);
        break;
      case 'servo': {
        // Angle réel d'après la largeur d'impulsion mesurée (1000 µs → 0°,
        // 1500 µs → 90°, 2000 µs → 180°). Repli sur 0/90° si la mesure n'est pas
        // disponible (broche non encore pilotée, moteur sans mesure d'impulsion).
        const pin = servoTargets.get(part.id);
        if (!pin) break;
        const us = engine.readPulseUs?.(pin) ?? 0;
        if (us > 0) {
          el.angle = Math.max(0, Math.min(180, ((us - 1000) / 1000) * 180));
        } else {
          el.angle = engine.readDigital(pin) ? 90 : 0;
        }
        break;
      }
      case 'i2c-lcd': {
        // Texte décodé du bus I²C affiché sur le LCD. Composant perso
        // (kablix-custom-part) → setLcd superpose le texte sur le dessin ;
        // élément Wokwi wokwi-lcd1602 → on alimente directement son écran (text).
        const dev = i2cDevices.get(part.id);
        if (dev instanceof Lcd1602Device) {
          const setLcd = el.setLcd as
            | ((lines: string[], rect: { x: number; y: number; w: number; h: number }) => void)
            | undefined;
          if (setLcd) {
            setLcd(dev.text, lcdScreenRect(part, def.custom?.svg));
          } else {
            (el as unknown as { text?: string }).text = dev.text.join('\n');
          }
        }
        break;
      }
      case 'i2c-oled': {
        // Tampon GDDRAM décodé → image de l'écran OLED (blanc sur noir).
        const dev = i2cDevices.get(part.id);
        if (dev instanceof Ssd1306Device) {
          renderOled(el as unknown as { imageData?: ImageData; redraw?: () => void }, dev);
        }
        break;
      }
      case 'spi-oled': {
        // Écran OLED SPI : tampon décodé du bus SPI → image.
        const dev = spiOledDevices.get(part.id);
        if (dev) renderOled(el as unknown as { imageData?: ImageData; redraw?: () => void }, dev);
        break;
      }
      case 'spi-tft': {
        // Écran TFT couleur ILI9341 : image RGBA → canvas de l'élément.
        const dev = spiTftDevices.get(part.id);
        if (dev) renderTft(el as unknown as { canvas?: HTMLCanvasElement | null }, dev);
        break;
      }
      case 'spi-sd':
        break; // carte SD : pas de rendu (répondeur de protocole seulement)
      case 'neopixel': {
        // Couleurs décodées de la chaîne WS2812 → LED de l'élément.
        const pin = neopixelTargets.get(part.id);
        const colors = pin ? engine.readNeopixel?.(pin) ?? [] : [];
        renderNeopixel(part.type, el, colors, part.attrs);
        break;
      }
      case 'mcu':
        // LED embarquée GP25 du Pico / Pico W.
        if (def.board && boardFamily(def.board) === 'rp2040') el.ledPower = engine.readDigital('GP25');
        break;
    }
  }
  // Seconde passe : les sorties PCA9685 priment sur l'état « hors-net » des cibles.
  applyPca9685();
}

// --- Liaison des entrées (boutons, potentiomètres) ---------------------------
function bindInputs(): void {
  for (const remove of inputRemovers) remove();
  inputRemovers = [];
  if (!engine) return;

  // Broches à mesurer en largeur d'impulsion : servo (angle réel) + buzzer
  // (fréquence du son). Une seule liste pour le moniteur du moteur.
  const buzzers = buzzerBindings(editor.diagram);
  buzzerTargets = new Map(buzzers.map((b) => [b.partId, b.mcuPin]));
  engine.setPulseMonitors?.([
    ...servoBindings(editor.diagram).map((b) => b.mcuPin),
    ...buzzers.map((b) => b.mcuPin),
  ]);

  // Capteurs ultrason (HC-SR04) : distance lue dans l'inspecteur (défaut 20 cm).
  engine.setUltrasonic?.(
    ultrasonicBindings(editor.diagram).map((b) => {
      const part = editor.diagram.parts.find((p) => p.id === b.partId);
      return { trig: b.trig, echo: b.echo, distanceCm: Number(part?.attrs?.distance ?? 20) };
    })
  );

  // Claviers matriciels : une touche enfoncée relie sa ligne et sa colonne. On
  // suit les touches enfoncées via les événements de l'élément (button-press /
  // button-release) ; le moteur tire la colonne à LOW quand la ligne l'est.
  const keypads: KeypadConfig[] = [];
  for (const b of keypadBindings(editor.diagram)) {
    const el = editor.elementOf(b.partId);
    const pressed = new Set<string>();
    if (el) {
      const update = (e: Event, add: boolean): void => {
        const d = (e as CustomEvent).detail as { row?: number; column?: number };
        if (typeof d?.row !== 'number' || typeof d?.column !== 'number') return;
        const key = `${d.row},${d.column}`;
        if (add) pressed.add(key);
        else pressed.delete(key);
        // L'ensemble `pressed` est partagé avec le moteur (par référence) : le
        // prochain balayage du firmware (quelques µs) prendra la touche en compte.
      };
      const onPress = (e: Event): void => update(e, true);
      const onRelease = (e: Event): void => update(e, false);
      el.addEventListener('button-press', onPress);
      el.addEventListener('button-release', onRelease);
      inputRemovers.push(() => {
        el.removeEventListener('button-press', onPress);
        el.removeEventListener('button-release', onRelease);
      });
    }
    keypads.push({ rows: b.rows, cols: b.cols, pressed });
  }
  engine.setKeypads?.(keypads);

  // Capteurs DHT22 (1-wire) : température/humidité réglées dans l'inspecteur.
  engine.setDht22?.(
    dht22Bindings(editor.diagram).map((b) => {
      const part = editor.diagram.parts.find((p) => p.id === b.partId);
      return {
        pin: b.pin,
        temperatureC: Number(part?.attrs?.temperature ?? 22),
        humidity: Number(part?.attrs?.humidity ?? 50),
      };
    })
  );

  // Chaînes NeoPixel (WS2812) : broche DIN décodée par le moteur.
  const nps = neopixelBindings(editor.diagram);
  neopixelTargets = new Map(nps.map((b) => [b.partId, b.mcuPin]));
  engine.setNeopixels?.(nps.map((b) => ({ pin: b.mcuPin, count: b.count })));

  for (const binding of buttonBindings(editor.diagram)) {
    const el = editor.elementOf(binding.partId);
    if (!el) continue;
    // L'entrée suit directement l'état enfoncé du bouton : appui = LOW, relâché
    // = HIGH (pull-up). Un clic simple est transitoire ; Ctrl+clic maintient le
    // bouton enfoncé (mode « sticky » natif de l'élément : aucun relâchement
    // n'est émis), ce qui permet de le laisser dans cet état pour déboguer.
    engine.setInput(binding.mcuPin, true); // au repos = pull-up (haut)
    const press = () => engine?.setInput(binding.mcuPin, false);
    const release = () => engine?.setInput(binding.mcuPin, true);
    el.addEventListener('button-press', press);
    el.addEventListener('button-release', release);
    inputRemovers.push(() => {
      el.removeEventListener('button-press', press);
      el.removeEventListener('button-release', release);
    });
  }

  for (const binding of potBindings(editor.diagram)) {
    const el = editor.elementOf(binding.partId);
    if (!el) continue;
    // Seul le potentiomètre À GLISSIÈRE avait son sens inversé (curseur vers la
    // masse → lecture forte) : on l'inverse. Le rotatif reste tel quel.
    const isSlide = editor.diagram.parts.find((p) => p.id === binding.partId)?.type === 'slide-pot';
    const apply = () => {
      const value = Number(el.value ?? 0);
      const max = Number(el.max ?? 100) || 100;
      const frac = value / max;
      // Sens de base (le modèle à glissière est inversé), puis inversion
      // supplémentaire si l'utilisateur a permuté VCC et GND sur les extrémités.
      let level = isSlide ? 1 - frac : frac;
      if (binding.inverted) level = 1 - level;
      engine?.setAnalog(binding.mcuPin, level);
    };
    apply(); // pousse la position actuelle au démarrage
    el.addEventListener('input', apply);
    inputRemovers.push(() => el.removeEventListener('input', apply));
  }

  // Interrupteur à glissière : la broche du côté connecté est tirée à LOW.
  for (const binding of slideSwitchBindings(editor.diagram)) {
    const el = editor.elementOf(binding.partId);
    if (!el) continue;
    const apply = () => {
      // value=0 → connecte le côté 1 ; value=1 → connecte le côté 3.
      const connected = (Number(el.value ?? 0) === 0 ? 1 : 3) === binding.side;
      engine?.setInput(binding.mcuPin, !connected);
    };
    apply();
    el.addEventListener('input', apply);
    inputRemovers.push(() => el.removeEventListener('input', apply));
  }

  // DIP switch : chaque canal fermé tire sa broche à LOW.
  for (const binding of dipSwitchBindings(editor.diagram)) {
    const el = editor.elementOf(binding.partId);
    if (!el || binding.channel === undefined) continue;
    const apply = () => {
      const values = (el.values as number[]) ?? [];
      engine?.setInput(binding.mcuPin, !values[binding.channel! - 1]);
    };
    apply();
    el.addEventListener('switch-change', apply);
    inputRemovers.push(() => el.removeEventListener('switch-change', apply));
  }

  // Joystick analogique : axes en 0..1 (repos à 0,5) + bouton SEL actif bas.
  for (const binding of joystickBindings(editor.diagram)) {
    const el = editor.elementOf(binding.partId);
    if (!el) continue;
    const apply = () => {
      if (binding.vert) engine?.setAnalog(binding.vert, (Number(el.yValue ?? 0) + 1) / 2);
      if (binding.horz) engine?.setAnalog(binding.horz, (Number(el.xValue ?? 0) + 1) / 2);
    };
    apply();
    el.addEventListener('input', apply);
    inputRemovers.push(() => el.removeEventListener('input', apply));
    if (binding.sel) {
      const selPin = binding.sel;
      engine.setInput(selPin, true);
      const press = () => engine?.setInput(selPin, false);
      const release = () => engine?.setInput(selPin, true);
      el.addEventListener('button-press', press);
      el.addEventListener('button-release', release);
      inputRemovers.push(() => {
        el.removeEventListener('button-press', press);
        el.removeEventListener('button-release', release);
      });
    }
  }

  // Sources pilotées par l'inspecteur (PIR, inclinaison, photorésistance…) :
  // l'état vient des attributs du composant, relu à chaque changement.
  for (const binding of digitalSourceBindings(editor.diagram)) {
    const part = editor.diagram.parts.find((p) => p.id === binding.partId);
    engine.setInput(binding.mcuPin, part?.attrs?.state === '1');
  }
  for (const binding of analogSourceBindings(editor.diagram)) {
    const part = editor.diagram.parts.find((p) => p.id === binding.partId);
    engine.setAnalog(binding.mcuPin, Number(part?.attrs?.value ?? 50) / 100);
  }
}

function rebind(): void {
  bindInputs();
  queueRefresh();
}

/** Crée les périphériques I²C présents dans le schéma et les relie au moteur. */
function buildI2cDevices(): void {
  i2cDevices = new Map();
  for (const part of editor.diagram.parts) {
    const kind = partDef(part.type).kind;
    if (kind === 'i2c-lcd' && (part.attrs?.pins ?? 'i2c') === 'i2c') {
      // En mode parallèle (pins=full) l'afficheur n'est pas sur le bus I²C : pas
      // de périphérique simulé (il reste visuel).
      const addr = Number(part.attrs?.address ?? 0x27) || 0x27;
      const cols = Number(part.attrs?.cols ?? 16) || 16;
      const rows = Number(part.attrs?.rows ?? 2) || 2;
      i2cDevices.set(part.id, new Lcd1602Device(addr, cols, rows));
    } else if (kind === 'i2c-pwm') {
      const addr = Number(part.attrs?.address ?? 0x40) || 0x40;
      i2cDevices.set(part.id, new Pca9685Device(addr));
    } else if (kind === 'i2c-oled') {
      const addr = Number(part.attrs?.address ?? 0x3c) || 0x3c;
      i2cDevices.set(part.id, new Ssd1306Device(addr, 128, 64));
    }
  }
  const list: I2cDevice[] = [...i2cDevices.values()];
  engine?.setI2cDevices?.(list);
  pcaBindings = pca9685Bindings(editor.diagram);

  // Périphériques SPI : OLED (SSD1306), TFT (ILI9341), carte SD. Broches D/C et
  // CS résolues côté MCU (le CS permet plusieurs périphériques sur le même bus).
  spiOledDevices = new Map();
  spiTftDevices = new Map();
  const spiList: SpiDevice[] = [];
  for (const b of spiDeviceBindings(editor.diagram)) {
    let dev: SpiDevice;
    if (b.kind === 'spi-tft') {
      const tft = new Ili9341Device();
      spiTftDevices.set(b.partId, tft);
      dev = tft;
    } else if (b.kind === 'spi-sd') {
      dev = new SdCardSpiDevice();
    } else {
      const oled = new Ssd1306Device(0x3c, 128, 64);
      spiOledDevices.set(b.partId, oled);
      dev = oled;
    }
    if (b.dcPin) dev.dcPin = b.dcPin;
    if (b.csPin) dev.csPin = b.csPin;
    spiList.push(dev);
  }
  engine?.setSpiDevices?.(spiList);
}

/** Recopie l'image RGBA d'un TFT ILI9341 dans le canvas de l'élément Wokwi. */
function renderTft(el: { canvas?: HTMLCanvasElement | null }, dev: Ili9341Device): void {
  const ctx = el.canvas?.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(dev.width, dev.height);
  img.data.set(dev.data);
  ctx.putImageData(img, 0, 0);
}

/** Recopie le tampon d'un OLED SSD1306 dans l'imageData de l'élément Wokwi. */
function renderOled(
  el: { imageData?: ImageData; redraw?: () => void },
  dev: Ssd1306Device
): void {
  const w = dev.width;
  const h = dev.height;
  const img = el.imageData && el.imageData.width === w && el.imageData.height === h
    ? el.imageData
    : new ImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = dev.pixelOn(x, y);
      const i = (y * w + x) * 4;
      d[i] = on ? 255 : 0;
      d[i + 1] = on ? 255 : 0;
      d[i + 2] = on ? 255 : 0;
      d[i + 3] = 255;
    }
  }
  el.imageData = img;
  el.redraw?.();
}

type Rgb = { r: number; g: number; b: number };

/** Affiche les couleurs WS2812 décodées sur l'élément NeoPixel (pixel / anneau / matrice). */
function renderNeopixel(
  type: string,
  el: Record<string, unknown>,
  colors: Rgb[],
  attrs?: Record<string, string>
): void {
  if (type === 'neopixel') {
    const c = colors[0] ?? { r: 0, g: 0, b: 0 };
    el.r = c.r;
    el.g = c.g;
    el.b = c.b;
    return;
  }
  const setPixel = el.setPixel as
    | ((a: number, b: number | Rgb, c?: Rgb) => void)
    | undefined;
  if (!setPixel) return;
  if (type === 'neopixel-matrix') {
    const cols = Number(attrs?.cols) || 8;
    colors.forEach((c, i) => setPixel(Math.floor(i / cols), i % cols, c));
  } else {
    // led-ring (et chaînes linéaires)
    colors.forEach((c, i) => setPixel(i, c));
  }
}

/** Propage les rapports cycliques des PCA9685 vers les composants pilotés. */
function applyPca9685(): void {
  for (const b of pcaBindings) {
    const dev = i2cDevices.get(b.partId);
    if (!(dev instanceof Pca9685Device)) continue;
    for (const c of b.channels) {
      const el = editor.elementOf(c.targetId);
      if (!el) continue;
      const duty = dev.channelDuty(c.ch);
      if (c.targetKind === 'servo') {
        // 50 Hz : impulsion = duty × 20 ms ; 1–2 ms → 0–180°.
        el.angle = Math.max(0, Math.min(180, (duty * 20000 - 1000) / 1000 * 180));
      } else if (c.targetKind === 'led') {
        el.brightness = duty;
        el.value = duty > 0.04 ? 1 : 0;
      } else {
        el.hasSignal = duty > 0.04; // buzzer
      }
    }
  }
}

/** Dimensions px intrinsèques du dessin d'un composant personnalisé (depuis son SVG). */
function customSvgSize(svg: string | undefined): { w: number; h: number } {
  const w = svg ? /width="([\d.]+)"/.exec(svg) : null;
  const h = svg ? /height="([\d.]+)"/.exec(svg) : null;
  return { w: w ? Number(w[1]) : 120, h: h ? Number(h[1]) : 60 };
}

/** Zone écran d'un LCD (px) : attributs sx/sy/sw/sh, sinon zone haute centrée. */
function lcdScreenRect(part: { attrs?: Record<string, string> }, svg: string | undefined): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const a = part.attrs ?? {};
  const size = customSvgSize(svg);
  return {
    x: Number(a.sx ?? size.w * 0.12),
    y: Number(a.sy ?? size.h * 0.18),
    w: Number(a.sw ?? size.w * 0.76),
    h: Number(a.sh ?? size.h * 0.4),
  };
}

/**
 * Pendant la simulation, le panneau Variables prend la place des Propriétés
 * (inutiles puisque le schéma est figé) dans la colonne de droite.
 */
function useDebugAsInspector(on: boolean): void {
  if (on) {
    inspector.style.display = 'none';
    debugSection.hidden = false;
    debugSection.classList.add('debug--side');
    workshopEl.appendChild(debugSection);
  } else {
    debugSection.classList.remove('debug--side');
    debugSection.hidden = true;
    stageEl.insertBefore(debugSection, serialEl0); // remet le panneau sous le canvas
    inspector.style.display = '';
  }
}

// --- Débogage : pause, pas à pas, panneau des variables -----------------------
// Valeurs de la dernière pause : une variable s'affiche en rouge uniquement si
// sa valeur a changé DEPUIS LE DERNIER ARRÊT (pas de cumul). À chaque reprise
// (pas à pas ou ▶ Démarrer), les rouges précédents repassent donc en noir et
// seules les variables modifiées pendant ce pas/cette reprise repassent en rouge.
let previousVarValues = new Map<string, string>();
/** Vrai si la simulation en cours exécute du MicroPython (sinon C/Arduino). */
let runIsPython = false;

/** Réinitialise l'état des variables (au démarrage / à l'arrêt de la simulation). */
function resetDebugVars(): void {
  previousVarValues = new Map();
  debugVarsEl.innerHTML = '';
}

/** Masque l'instantané (hors pause) sans perdre l'historique des changements. */
function clearDebugVarsDisplay(): void {
  debugVarsEl.innerHTML = '';
}

function renderDebugPause(state: DebugPauseState): void {
  debugSection.hidden = false;
  debugLineEl.textContent = state.line !== undefined ? t('Line {0}', state.line) : '';
  debugVarsEl.innerHTML = '';
  // En-tête permanent en C/Arduino : seules les variables GLOBALES sont lisibles
  // (les locales demanderaient l'analyse CFI DWARF). Cliquable → page d'aide. En
  // MicroPython, pas de cette restriction → en-tête omis (texte barré supprimé).
  if (!runIsPython) {
    const hRow = debugVarsEl.insertRow();
    const hCell = hRow.insertCell();
    hCell.colSpan = 2;
    hCell.className = 'debug__cinfo';
    hCell.textContent = t('ℹ Only global variables are shown (click for help)');
    hCell.title = t('In C/Arduino, declare a variable outside setup() and loop() (global) to inspect it here.');
    hCell.addEventListener('click', () => vscode.postMessage({ type: 'help' }));
  }
  if (state.variables.length === 0) {
    const row = debugVarsEl.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 2;
    cell.className = 'debug__empty';
    cell.textContent = runIsPython
      ? t('No readable variable (define module-level variables to inspect them).')
      : t('No readable variable here.');
  }
  // Affichage « nom : valeur » (sans le type) ; valeur en rouge uniquement si
  // elle diffère de celle du dernier arrêt (delta d'un pas), sans cumul : au
  // prochain arrêt, une variable inchangée depuis revient automatiquement en noir.
  const next = new Map<string, string>();
  for (const v of state.variables) {
    const changed = previousVarValues.has(v.name) && previousVarValues.get(v.name) !== v.value;
    const row = debugVarsEl.insertRow();
    row.insertCell().textContent = `${v.name} :`;
    const valueCell = row.insertCell();
    valueCell.textContent = v.value;
    if (changed) valueCell.classList.add('debug__changed');
    next.set(v.name, v.value);
  }
  previousVarValues = next;
  // Signale la ligne courante à l'extension (surlignage dans l'éditeur).
  if (state.line !== undefined) vscode.postMessage({ type: 'debugLine', line: state.line });
  updateDebugButtons();
}

function updateDebugButtons(): void {
  const paused = engine?.paused ?? false;
  // Hors pas à pas (simulation en cours ou arrêtée), le tableau de variables est
  // un instantané périmé : on le masque. L'historique des changements (rouge)
  // est conservé jusqu'au prochain redémarrage.
  if (!paused) clearDebugVarsDisplay();
  // Les composants restent actionnables même en pause / pas à pas (débogage) :
  // aucun verrou de pointeur n'est posé pendant la simulation.
  pauseBtn.disabled = !engine;
  // Icône seule (bouton sur le canvas) : le libellé passe dans l'info-bulle.
  pauseBtn.textContent = paused ? '▶' : '⏸';
  pauseBtn.title = paused ? t('Resume') : t('Pause / resume the simulation');
  pauseBtn.classList.toggle('primary', paused);
  stepBtn.disabled = !engine || !engine.step;
  if (paused) setStatus(t('Paused'));
}

pauseBtn.addEventListener('click', () => {
  if (!engine) return;
  if (engine.paused) {
    engine.resume();
    setStatus(t('Running…'));
    vscode.postMessage({ type: 'debugResumed' });
  } else {
    engine.pause();
  }
  updateDebugButtons();
});

stepBtn.addEventListener('click', () => {
  engine?.step?.();
  updateDebugButtons();
});

speedSelect.addEventListener('change', () => {
  engine?.setSpeed(Number(speedSelect.value) || 1);
});

// --- Cycle de vie de la simulation -------------------------------------------
function startRun(): void {
  stopRun();
  resetDebugVars(); // nouveau run : l'historique des changements (rouge) repart à zéro
  try {
    engine =
      boardFamily(board) === 'rp2040'
        ? new PicoEngine(picoProgram)
        : new AvrEngine(unoProgram, unoDebugInfo, board === 'mega' ? 'avr2560' : 'avr328');
  } catch (err) {
    setStatus(t('Error: {0}', err instanceof Error ? err.message : String(err)));
    return;
  }
  engine.onUpdate = queueRefresh;
  engine.onSerial = appendSerial;
  engine.onDebugPause = renderDebugPause;
  // Pont réseau Pico W : le moteur publie les requêtes, l'hôte fait le vrai
  // fetch et renvoie la réponse (message 'netResponse').
  if (engine.onNetRequest !== undefined) {
    engine.onNetRequest = (req) => vscode.postMessage({ type: 'net', request: req });
  }
  engine.setSpeed(Number(speedSelect.value) || 1);
  engine.setBreakpoints?.(breakpoints);
  sevenSegLatch = new Map(); // nouveau run : les chiffres mémorisés repartent à zéro
  buildI2cDevices();
  rebind();
  engine.start();
  editor.setLocked(true); // schéma figé pendant la simulation
  useDebugAsInspector(true); // Variables à la place des Propriétés
  runBtn.disabled = true;
  stopBtn.disabled = false;
  const isPython = boardFamily(board) === 'rp2040' && picoProgram.kind === 'flash' && !!picoProgram.script;
  runIsPython = isPython;
  updateDebugButtons();
  setStatus(isPython ? t('Starting MicroPython… (a few seconds)') : t('Running…'));
}

function stopRun(): void {
  buzzerAudio.stopAll(); // coupe les sons de buzzer
  for (const remove of inputRemovers) remove();
  inputRemovers = [];
  engine?.dispose();
  engine = null;
  editor.setLocked(false); // édition du schéma de nouveau possible
  useDebugAsInspector(false); // Propriétés de nouveau dans la colonne de droite
  runBtn.disabled = false;
  stopBtn.disabled = true;
  vscode.postMessage({ type: 'debugResumed' });
  updateDebugButtons();
  setStatus(t('Stopped'));
}

editor.onChange = () => {
  persistState();
  if (engine) rebind();
};

// Persistance de l'atelier dans l'état de la webview : il survit ainsi au
// déplacement de l'onglet (passage en plein écran, autre groupe d'éditeurs…)
// qui recharge la webview et effaçait auparavant le schéma.
function persistState(): void {
  vscode.setState({ diagram: editor.serialize(), board, showLabels } satisfies PersistedState);
}

/**
 * Lancement de la simulation : si aucun programme n'a encore été compilé/chargé,
 * on compile d'abord le fichier de code (la compilation enchaîne sur le run).
 * Sinon, on démarre directement.
 */
function requestRun(): void {
  // ▶ délègue à l'hôte : il (re)compile le fichier de code si le source a changé
  // (ou si rien n'est encore chargé), sinon il répond 'runCached' et on relance
  // le binaire déjà en mémoire. L'utilisateur exécute ainsi toujours sa dernière
  // version, sans bouton « Compiler » séparé.
  buzzerAudio.resume(); // geste utilisateur : autorise le son du buzzer
  setStatus(t('Compiling…'));
  vscode.postMessage({ type: 'compile', board, onlyIfChanged: programLoaded });
}

// --- Barre d'outils -----------------------------------------------------------
runBtn.addEventListener('click', requestRun);
stopBtn.addEventListener('click', stopRun);
// Tout réinitialiser : arrête la simulation et remet les composants à zéro.
resetSimBtn.addEventListener('click', () => {
  stopRun();
  editor.resetVisuals();
  setStatus(t('Reset'));
});
// Recentrer et ajuster la vue sur tout le schéma.
fitViewBtn.addEventListener('click', () => editor.fitView());
// Autoroutage : fils en angles droits (sélection, sinon tout le schéma).
autoRouteBtn.addEventListener('click', () => editor.autoRoute());
// Effacer le schéma (annulable avec Ctrl+Z).
clearCanvasBtn.addEventListener('click', () => {
  if (!editor.isLocked()) editor.clear();
});
clearBtn.addEventListener('click', () => {
  serialEl.textContent = '';
});
loadBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'loadWorkspace', board });
});
exportBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'exportSvg', svg: editor.exportSvg() });
});
saveProjectBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'saveProject', diagram: editor.serialize(), board });
});
openProjectBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'openProject' });
});
// Ouvre la page d'aide (commande kablix.openHelp côté hôte).
helpBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'help' });
});

// --- Préférences d'interface (noms visibles, tri de palette, derniers utilisés)
// Par défaut les noms n'apparaissent qu'à la sélection ; 🏷 force l'affichage.
let showLabels = false;
let paletteState: PaletteState = { sort: 'category', recents: [], showRecents: true, collapsed: [] };
let paletteWidth = 0; // 0 = largeur par défaut (CSS)
let inspectorWidth = 0;

function applyShowLabels(): void {
  canvas.classList.toggle('canvas--show-labels', showLabels);
  labelsBtn.classList.toggle('primary', showLabels);
}
applyShowLabels();

function applyPanelWidths(): void {
  if (paletteWidth) palette.style.flex = `0 0 ${paletteWidth}px`;
  if (inspectorWidth) inspector.style.flex = `0 0 ${inspectorWidth}px`;
}

function saveUiState(): void {
  vscode.postMessage({
    type: 'saveUiState',
    state: { ...paletteState, showLabels, paletteWidth, inspectorWidth },
  });
}

// Redimensionnement des colonnes (bibliothèque / propriétés-variables) par glissement.
function setupSplitter(id: string, which: 'palette' | 'inspector'): void {
  const splitter = document.getElementById(id);
  if (!splitter) return;
  splitter.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startX = (e as PointerEvent).clientX;
    // Colonne cible : l'inspecteur, ou le panneau Variables s'il l'a remplacé.
    const col = which === 'palette' ? palette : inspector.style.display === 'none' ? debugSection : inspector;
    const startW = col.getBoundingClientRect().width;
    const sign = which === 'palette' ? 1 : -1;
    const move = (ev: PointerEvent) => {
      const w = Math.max(90, Math.min(520, startW + sign * (ev.clientX - startX)));
      col.style.flex = `0 0 ${w}px`;
      if (which === 'palette') paletteWidth = w;
      else if (col === inspector) inspectorWidth = w;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveUiState();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}
setupSplitter('splitter-palette', 'palette');
setupSplitter('splitter-inspector', 'inspector');

labelsBtn.addEventListener('click', () => {
  showLabels = !showLabels;
  applyShowLabels();
  saveUiState();
  persistState();
});

editor.onPaletteStateChange = (state) => {
  paletteState = state;
  saveUiState();
};

// Persistance des composants personnalisés (stockés côté extension).
editor.onCustomPartsChange = (parts: CustomPartData[]) => {
  vscode.postMessage({ type: 'saveCustomParts', parts });
};
editor.onOpenExternal = (url: string) => {
  vscode.postMessage({ type: 'openExternal', url });
};
editor.onExportCustomPart = (part: CustomPartData) => {
  vscode.postMessage({ type: 'exportCustomPart', part });
};
// Le dépôt d'une carte à microcontrôleur choisit l'outil de simulation (carte) :
// le menu déroulant de la barre d'outils n'est donc plus nécessaire (masqué).
editor.onPartAdded = (part) => {
  let target: BoardId | undefined;
  try {
    const def = partDef(part.type);
    if (def.kind === 'mcu') target = def.board;
  } catch {
    return;
  }
  if (!target || board === target) return;
  board = target;
  boardSelect.value = board;
  vscode.postMessage({ type: 'board', board });
  programLoaded = false; // le programme compilé était lié à l'autre carte
  stopRun();
  persistState();
  setStatus(t('Board: {0}', boardLabel(board)));
};
boardSelect.addEventListener('change', () => {
  board = isBoardId(boardSelect.value) ? boardSelect.value : 'uno';
  vscode.postMessage({ type: 'board', board });
  programLoaded = false; // le programme compilé était lié à l'autre carte
  stopRun();
  persistState();
  setStatus(t('Board: {0}', boardLabel(board)));
});

/** Libellé lisible d'une carte (nom du composant MCU correspondant). */
function boardLabel(b: BoardId): string {
  try {
    return partDef(b).label;
  } catch {
    return b;
  }
}

// --- Fichier de code à exécuter / déboguer (chip sur le canvas) ---------------
codeFileBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'pickCodeFile' });
});

// --- Moniteur série : envoi vers le microcontrôleur ---------------------------
function sendSerial(): void {
  if (!engine || !serialInput.value) return;
  engine.writeSerial(serialInput.value + '\n');
  serialInput.value = '';
}
serialSend.addEventListener('click', sendSerial);
serialInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendSerial();
});

// --- Messages de l'extension ---------------------------------------------------
window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data;
  switch (msg?.type) {
    case 'runProgram':
      programLoaded = true; // un vrai programme est désormais disponible
      if (msg.board === 'uno') {
        unoProgram = Uint16Array.from(msg.bytes as number[]);
        unoDebugInfo = (msg.debug as AvrDebugInfo | undefined) ?? null;
        ensureFamilyForPayload('uno');
      } else if (msg.board === 'pico') {
        if (msg.format === 'rp2040-ram') {
          picoProgram = { kind: 'ram', image: b64ToBytes(msg.b64 as string) };
        } else {
          picoProgram = {
            kind: 'flash',
            segments: (msg.segments as Array<{ addr: number; b64: string }>).map((s) => ({
              addr: s.addr,
              data: b64ToBytes(s.b64),
            })),
            script: msg.script as string | undefined,
          };
        }
        ensureFamilyForPayload('pico');
      }
      startRun();
      break;
    case 'runCached':
      // Source inchangé depuis la dernière compilation : on relance le binaire
      // déjà en mémoire sans recompiler.
      if (programLoaded) startRun();
      break;
    case 'status':
      setStatus(String(msg.text));
      break;
    case 'config':
      // Bouton « Charger binaire » : masqué sauf si le réglage l'active.
      loadBtn.hidden = !msg.showLoadBinary;
      break;
    case 'netResponse':
      // Réponse réseau de l'hôte : réinjectée dans le script (Pico W).
      engine?.sendNetResponse?.(msg.response);
      break;
    case 'breakpoints':
      // Points d'arrêt de la gouttière de l'éditeur VS Code (ligne 1-based +
      // condition optionnelle évaluée côté moteur).
      breakpoints = Array.isArray(msg.breakpoints) ? (msg.breakpoints as Breakpoint[]) : [];
      engine?.setBreakpoints?.(breakpoints);
      break;
    case 'customParts':
      editor.loadCustomParts((msg.parts as CustomPartData[]) ?? []);
      // Restaure l'atelier d'avant un déplacement d'onglet (une seule fois,
      // après l'enregistrement des composants personnalisés qu'il référence).
      if (restoredState?.diagram) {
        editor.loadDiagram(restoredState.diagram as Parameters<typeof editor.loadDiagram>[0]);
        if (isBoardId(restoredState.board)) {
          board = restoredState.board;
          boardSelect.value = board;
          vscode.postMessage({ type: 'board', board });
        }
        if (typeof restoredState.showLabels === 'boolean') {
          showLabels = restoredState.showLabels;
          applyShowLabels();
        }
      }
      restoredState = undefined;
      break;
    case 'codeFile': {
      // Nom du fichier de code à exécuter / déboguer, envoyé par l'extension.
      const name = typeof msg.name === 'string' ? msg.name : null;
      codeFileBtn.textContent = name ? `📄 ${name}` : `📄 ${t('No file')}`;
      codeFileBtn.title = name
        ? t('Code file: {0} — click to change', name)
        : t('Code file to run / debug — click to change');
      break;
    }
    case 'requestSaveProject':
      // Demande de la commande : on renvoie le schéma pour l'enregistrement.
      vscode.postMessage({ type: 'saveProject', diagram: editor.serialize(), board });
      break;
    case 'requestWokwiExport':
      // Conversion du schéma au format projet Wokwi (diagram.json).
      vscode.postMessage({ type: 'wokwiExport', json: toWokwiDiagram(editor.diagram) });
      break;
    case 'importWokwi': {
      // Projet Wokwi reçu de l'hôte : conversion puis chargement.
      const { parts, wires, skipped } = fromWokwiDiagram(msg.json);
      editor.loadDiagram({ parts, wires });
      // Adopte la carte du premier MCU reconnu dans le schéma importé.
      switchBoard(
        (parts.map((p) => p.type).find((tp) => isBoardId(tp)) as BoardId | undefined) ?? 'uno'
      );
      setStatus(
        skipped.length > 0
          ? t('Wokwi project loaded ({0} unsupported part(s) ignored)', skipped.length)
          : t('Wokwi project loaded')
      );
      break;
    }
    case 'loadProject':
      // Recharge un projet .projix : composants perso, schéma puis carte.
      if (Array.isArray(msg.customParts)) {
        editor.loadCustomParts(msg.customParts as CustomPartData[]);
      }
      editor.loadDiagram(msg.diagram as Parameters<typeof editor.loadDiagram>[0]);
      if (isBoardId(msg.board)) {
        switchBoard(msg.board);
        boardSelect.value = msg.board;
      }
      // Statut neutre après chargement (clé déjà traduite dans i18n).
      setStatus(t('Ready'));
      break;
    case 'uiState': {
      const state = (msg.state ?? {}) as Partial<PaletteState> & {
        showLabels?: boolean;
        paletteWidth?: number;
        inspectorWidth?: number;
      };
      if (typeof state.showLabels === 'boolean') showLabels = state.showLabels;
      applyShowLabels();
      if (typeof state.paletteWidth === 'number') paletteWidth = state.paletteWidth;
      if (typeof state.inspectorWidth === 'number') inspectorWidth = state.inspectorWidth;
      applyPanelWidths();
      paletteState = {
        sort: state.sort === 'alpha' ? 'alpha' : 'category',
        recents: Array.isArray(state.recents) ? state.recents : [],
        showRecents: state.showRecents !== false, // défaut : affiché
        collapsed: Array.isArray(state.collapsed) ? state.collapsed : [],
        fold: state.fold === 'collapse' || state.fold === 'auto' ? state.fold : 'expand',
      };
      editor.loadPaletteState(paletteState);
      break;
    }
  }
});

/** Aligne la carte affichée avec celle du programme reçu. */
function switchBoard(target: BoardId): void {
  if (board === target) return;
  board = target;
  boardSelect.value = target;
  stopRun();
}

/**
 * Le programme reçu indique seulement sa FAMILLE (payload 'uno' = AVR, 'pico' =
 * RP2040). On ne change la carte affichée que si la famille courante ne
 * correspond pas — ainsi un Nano ou un Pico W choisi par l'utilisateur n'est pas
 * réécrasé par 'uno'/'pico' à chaque exécution.
 */
function ensureFamilyForPayload(payloadBoard: 'uno' | 'pico'): void {
  const wantsRp2040 = payloadBoard === 'pico';
  const isRp2040 = boardFamily(board) === 'rp2040';
  if (wantsRp2040 !== isRp2040) switchBoard(payloadBoard);
}

// Feuille de dessin vide au démarrage : l'utilisateur compose son schéma.
setStatus(t('Ready'));
vscode.postMessage({ type: 'ready' });
