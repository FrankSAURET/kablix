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
import './elements/pico-board.mjs';

import { Editor } from './diagram/editor.mjs';
import { partDef, type BoardId } from './diagram/catalog.mjs';
import {
  ledOn,
  rgbLedState,
  buzzerOn,
  buttonBindings,
  potBindings,
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
const vscode = acquireVsCodeApi();

const boardSelect = document.getElementById('board') as HTMLSelectElement;
const runBtn = document.getElementById('run') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const compileBtn = document.getElementById('compile') as HTMLButtonElement;
const loadBtn = document.getElementById('load-workspace') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const serialEl = document.getElementById('serial') as HTMLPreElement;
const serialInput = document.getElementById('serial-input') as HTMLInputElement;
const serialSend = document.getElementById('serial-send') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-serial') as HTMLButtonElement;
const canvas = document.getElementById('canvas') as HTMLDivElement;
const palette = document.getElementById('palette') as HTMLDivElement;
const wiresSvg = document.getElementById('wires') as unknown as SVGSVGElement;

const editor = new Editor(canvas, palette, wiresSvg);

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
  for (const part of editor.diagram.parts) {
    const def = partDef(part.type);
    const el = editor.elementOf(part.id);
    if (!el) continue;
    switch (def.kind) {
      case 'led':
        el.value = ledOn(editor.diagram, part.id, read);
        break;
      case 'rgb-led': {
        const s = rgbLedState(editor.diagram, part.id, read);
        el.ledRed = s.red ? 1 : 0;
        el.ledGreen = s.green ? 1 : 0;
        el.ledBlue = s.blue ? 1 : 0;
        break;
      }
      case 'buzzer':
        el.hasSignal = buzzerOn(editor.diagram, part.id, read);
        break;
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
    setStatus(`Erreur : ${err instanceof Error ? err.message : err}`);
    return;
  }
  engine.onUpdate = queueRefresh;
  engine.onSerial = appendSerial;
  rebind();
  engine.start();
  runBtn.disabled = true;
  stopBtn.disabled = false;
  const isPython = board === 'pico' && picoProgram.kind === 'flash' && picoProgram.script;
  setStatus(isPython ? 'Démarrage MicroPython… (quelques secondes)' : 'En cours…');
}

function stopRun(): void {
  for (const remove of inputRemovers) remove();
  inputRemovers = [];
  engine?.dispose();
  engine = null;
  runBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus('Arrêté');
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
  setStatus('Compilation…');
  vscode.postMessage({ type: 'compile', board });
});
loadBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'loadWorkspace', board });
});
boardSelect.addEventListener('change', () => {
  board = boardSelect.value === 'pico' ? 'pico' : 'uno';
  vscode.postMessage({ type: 'board', board });
  stopRun();
  buildStarter();
  setStatus(`Carte : ${board === 'uno' ? 'Arduino Uno' : 'Raspberry Pi Pico'}`);
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
  }
});

/** Aligne la carte affichée avec celle du programme reçu. */
function switchBoard(target: BoardId): void {
  if (board === target) return;
  board = target;
  boardSelect.value = target;
  stopRun();
  buildStarter();
}

// --- Schémas de démarrage -------------------------------------------------------
function buildStarter(): void {
  editor.clear();
  if (board === 'uno') {
    // Uno + LED (D13) + bouton (D2).
    const uno = editor.addPart('uno', 20, 50);
    const resistor = editor.addPart('resistor', 360, 90);
    const led = editor.addPart('led', 470, 70);
    const button = editor.addPart('button', 360, 230);

    editor.addWire({ partId: uno.id, pin: '13' }, { partId: resistor.id, pin: '1' });
    editor.addWire({ partId: resistor.id, pin: '2' }, { partId: led.id, pin: 'A' });
    editor.addWire({ partId: led.id, pin: 'C' }, { partId: uno.id, pin: 'GND.1' });
    editor.addWire({ partId: uno.id, pin: '2' }, { partId: button.id, pin: '1.l' });
    editor.addWire({ partId: button.id, pin: '2.l' }, { partId: uno.id, pin: 'GND.2' });
  } else {
    // Pico + LED externe sur GP25 (via résistance) + bouton sur GP13.
    const pico = editor.addPart('pico', 20, 60);
    const resistor = editor.addPart('resistor', 440, 90);
    const led = editor.addPart('led', 550, 70);
    const button = editor.addPart('button', 440, 240);

    editor.addWire({ partId: pico.id, pin: 'GP25' }, { partId: resistor.id, pin: '1' });
    editor.addWire({ partId: resistor.id, pin: '2' }, { partId: led.id, pin: 'A' });
    editor.addWire({ partId: led.id, pin: 'C' }, { partId: pico.id, pin: 'GND.1' });
    editor.addWire({ partId: pico.id, pin: 'GP13' }, { partId: button.id, pin: '1.l' });
    editor.addWire({ partId: button.id, pin: '2.l' }, { partId: pico.id, pin: 'GND.4' });
  }
  editor.redrawWires();
}

buildStarter();
setStatus('Prêt');
vscode.postMessage({ type: 'ready' });
