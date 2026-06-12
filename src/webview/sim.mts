// Contrôleur de la webview Kablix : atelier visuel (placement + câblage),
// simulation Arduino Uno (avr8js) / Raspberry Pi Pico (rp2040js) et
// messagerie avec l'extension.
import '@wokwi/elements/dist/esm/arduino-uno-element.js';
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
import './elements/pico-board.mjs';
import './elements/breadboard.mjs';
import './elements/custom-part.mjs';

import { initLocale, t } from './i18n.mjs';
import { Editor, type PaletteState } from './diagram/editor.mjs';
import { partDef, type BoardId, type CustomPartData } from './diagram/catalog.mjs';
import {
  ledOn,
  rgbLedState,
  buzzerOn,
  sevenSegmentState,
  ledBarState,
  buttonBindings,
  potBindings,
  slideSwitchBindings,
  dipSwitchBindings,
  joystickBindings,
  digitalSourceBindings,
  analogSourceBindings,
  servoBindings,
} from './diagram/model.mjs';
import { AvrEngine } from './engines/avr.mjs';
import { PicoEngine, type PicoProgram } from './engines/pico.mjs';
import type { SimEngine } from './engines/types.mjs';
import { UNO_DEMO } from './programs/uno-demo.mjs';
import { PICO_BLINK } from './programs/pico-blink.mjs';

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
declare global {
  interface Window {
    KABLIX_LANG?: string;
  }
}
initLocale(window.KABLIX_LANG);
const vscode = acquireVsCodeApi();

const boardSelect = document.getElementById('board') as HTMLSelectElement;
const runBtn = document.getElementById('run') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const compileBtn = document.getElementById('compile') as HTMLButtonElement;
const loadBtn = document.getElementById('load-workspace') as HTMLButtonElement;
const exportBtn = document.getElementById('export-svg') as HTMLButtonElement;
const labelsBtn = document.getElementById('toggle-labels') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const serialEl = document.getElementById('serial') as HTMLPreElement;
const serialInput = document.getElementById('serial-input') as HTMLInputElement;
const serialSend = document.getElementById('serial-send') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-serial') as HTMLButtonElement;
const canvas = document.getElementById('canvas') as HTMLDivElement;
const palette = document.getElementById('palette') as HTMLDivElement;
const wiresSvg = document.getElementById('wires') as unknown as SVGSVGElement;
const inspector = document.getElementById('inspector') as HTMLDivElement;

const editor = new Editor(canvas, palette, wiresSvg, inspector);

let board: BoardId = 'uno';
let engine: SimEngine | null = null;
let unoProgram: Uint16Array = UNO_DEMO;
let picoProgram: PicoProgram = { kind: 'ram', image: PICO_BLINK };
let inputRemovers: Array<() => void> = [];

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
      case 'buzzer':
        if (def.custom) el.active = buzzerOn(editor.diagram, part.id, read);
        else el.hasSignal = buzzerOn(editor.diagram, part.id, read);
        break;
      case '7segment':
        el.values = sevenSegmentState(editor.diagram, part.id, read);
        break;
      case 'led-bar':
        el.values = ledBarState(editor.diagram, part.id, read);
        break;
      case 'servo': {
        // Comportement simplifié : bras à 90° quand la broche PWM est haute.
        const pin = servoTargets.get(part.id);
        if (pin) el.angle = engine.readDigital(pin) ? 90 : 0;
        break;
      }
      case 'mcu':
        // LED embarquée GP25 du Pico.
        if (def.board === 'pico') el.ledPower = engine.readDigital('GP25');
        break;
    }
  }
}

// --- Liaison des entrées (boutons, potentiomètres) ---------------------------
function bindInputs(): void {
  for (const remove of inputRemovers) remove();
  inputRemovers = [];
  if (!engine) return;

  for (const binding of buttonBindings(editor.diagram)) {
    const el = editor.elementOf(binding.partId);
    if (!el) continue;
    engine.setInput(binding.mcuPin, true); // relâché = pull-up (haut)
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
    const apply = () => {
      const value = Number(el.value ?? 0);
      const max = Number(el.max ?? 100) || 100;
      engine?.setAnalog(binding.mcuPin, value / max);
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

// --- Cycle de vie de la simulation -------------------------------------------
function startRun(): void {
  stopRun();
  try {
    engine = board === 'uno' ? new AvrEngine(unoProgram) : new PicoEngine(picoProgram);
  } catch (err) {
    setStatus(t('Error: {0}', err instanceof Error ? err.message : String(err)));
    return;
  }
  engine.onUpdate = queueRefresh;
  engine.onSerial = appendSerial;
  rebind();
  engine.start();
  runBtn.disabled = true;
  stopBtn.disabled = false;
  const isPython = board === 'pico' && picoProgram.kind === 'flash' && picoProgram.script;
  setStatus(isPython ? t('Starting MicroPython… (a few seconds)') : t('Running…'));
}

function stopRun(): void {
  for (const remove of inputRemovers) remove();
  inputRemovers = [];
  engine?.dispose();
  engine = null;
  runBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus(t('Stopped'));
}

editor.onChange = () => {
  if (engine) rebind();
};

// --- Barre d'outils -----------------------------------------------------------
runBtn.addEventListener('click', startRun);
stopBtn.addEventListener('click', stopRun);
clearBtn.addEventListener('click', () => {
  serialEl.textContent = '';
});
compileBtn.addEventListener('click', () => {
  setStatus(t('Compiling…'));
  vscode.postMessage({ type: 'compile', board });
});
loadBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'loadWorkspace', board });
});
exportBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'exportSvg', svg: editor.exportSvg() });
});

// --- Préférences d'interface (noms visibles, tri de palette, derniers utilisés)
// Par défaut les noms n'apparaissent qu'à la sélection ; 🏷 force l'affichage.
let showLabels = false;
let paletteState: PaletteState = { sort: 'category', recents: [] };

function applyShowLabels(): void {
  canvas.classList.toggle('canvas--show-labels', showLabels);
  labelsBtn.classList.toggle('primary', showLabels);
}
applyShowLabels();

function saveUiState(): void {
  vscode.postMessage({ type: 'saveUiState', state: { ...paletteState, showLabels } });
}

labelsBtn.addEventListener('click', () => {
  showLabels = !showLabels;
  applyShowLabels();
  saveUiState();
});

editor.onPaletteStateChange = (state) => {
  paletteState = state;
  saveUiState();
};

// Persistance des composants personnalisés (stockés côté extension).
editor.onCustomPartsChange = (parts: CustomPartData[]) => {
  vscode.postMessage({ type: 'saveCustomParts', parts });
};
editor.onExportCustomPart = (part: CustomPartData) => {
  vscode.postMessage({ type: 'exportCustomPart', part });
};
boardSelect.addEventListener('change', () => {
  board = boardSelect.value === 'pico' ? 'pico' : 'uno';
  vscode.postMessage({ type: 'board', board });
  stopRun();
  setStatus(t('Board: {0}', board === 'uno' ? 'Arduino Uno' : 'Raspberry Pi Pico'));
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
      if (msg.board === 'uno') {
        unoProgram = Uint16Array.from(msg.bytes as number[]);
        switchBoard('uno');
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
        switchBoard('pico');
      }
      startRun();
      break;
    case 'status':
      setStatus(String(msg.text));
      break;
    case 'customParts':
      editor.loadCustomParts((msg.parts as CustomPartData[]) ?? []);
      break;
    case 'uiState': {
      const state = (msg.state ?? {}) as Partial<PaletteState> & { showLabels?: boolean };
      if (typeof state.showLabels === 'boolean') showLabels = state.showLabels;
      applyShowLabels();
      paletteState = {
        sort: state.sort === 'alpha' ? 'alpha' : 'category',
        recents: Array.isArray(state.recents) ? state.recents : [],
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

// Feuille de dessin vide au démarrage : l'utilisateur compose son schéma.
setStatus(t('Ready'));
vscode.postMessage({ type: 'ready' });
