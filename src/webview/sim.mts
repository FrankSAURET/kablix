// Contrôleur de la webview MicroSim : atelier visuel, simulation multi-cartes
// (Arduino Uno / Raspberry Pi Pico) et messagerie avec l'extension.
import '@wokwi/elements/dist/esm/arduino-uno-element.js';
import '@wokwi/elements/dist/esm/led-element.js';
import '@wokwi/elements/dist/esm/pushbutton-element.js';
import '@wokwi/elements/dist/esm/resistor-element.js';
import '@wokwi/elements/dist/esm/rgb-led-element.js';
import '@wokwi/elements/dist/esm/buzzer-element.js';
import '@wokwi/elements/dist/esm/potentiometer-element.js';
import './pico-board-element.mjs';

import { Editor } from './diagram/editor.mjs';
import { partDef } from './diagram/catalog.mjs';
import { ledOn, rgbLedChannel, buzzerActive, buttonBindings } from './diagram/model.mjs';
import { AvrEngine } from './engines/avr.mjs';
import { PicoEngine } from './engines/pico.mjs';
import type { SimEngine } from './engines/types.mjs';
import { UNO_DEMO } from './programs/uno-demo.mjs';
import { PICO_BLINK } from './programs/pico-blink.mjs';

type Board = 'uno' | 'pico';
type PicoFormat = 'rp2040-ram' | 'rp2040-flash';

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

// --- DOM refs ----------------------------------------------------------------
const boardSel = document.getElementById('board') as HTMLSelectElement;
const runBtn = document.getElementById('run') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const compileBtn = document.getElementById('compile') as HTMLButtonElement;
const loadWsBtn = document.getElementById('load-workspace') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const serialEl = document.getElementById('serial') as HTMLPreElement;
const clearBtn = document.getElementById('clear-serial') as HTMLButtonElement;
const canvas = document.getElementById('canvas') as HTMLDivElement;
const palette = document.getElementById('palette') as HTMLDivElement;
const wiresSvg = document.getElementById('wires') as unknown as SVGSVGElement;

const editor = new Editor(canvas, palette, wiresSvg);

let engine: SimEngine | null = null;
let currentBoard: Board = 'uno';
let unoProgram: Uint16Array = UNO_DEMO;
let picoProgram: Uint8Array = PICO_BLINK;
let picoFormat: PicoFormat = 'rp2040-ram';
let buttonRemovers: Array<() => void> = [];

const setStatus = (text: string): void => {
  statusEl.textContent = text;
};

// --- Mise à jour visuelle des composants ------------------------------------

function refreshComponents(): void {
  if (!engine) return;
  const read = (name: string): boolean => engine!.readDigital(name);

  for (const part of editor.diagram.parts) {
    const kind = partDef(part.type).kind;
    const el = editor.elementOf(part.id);
    if (!el) continue;

    if (kind === 'led') {
      (el as unknown as { value: boolean }).value = ledOn(editor.diagram, part.id, read);
    } else if (kind === 'rgb-led') {
      const rgb = el as unknown as { ledRed: number; ledGreen: number; ledBlue: number };
      rgb.ledRed   = rgbLedChannel(editor.diagram, part.id, 'R', read) ? 1 : 0;
      rgb.ledGreen = rgbLedChannel(editor.diagram, part.id, 'G', read) ? 1 : 0;
      rgb.ledBlue  = rgbLedChannel(editor.diagram, part.id, 'B', read) ? 1 : 0;
    } else if (kind === 'buzzer') {
      (el as unknown as { hasSignal: boolean }).hasSignal = buzzerActive(editor.diagram, part.id, read);
    } else if (kind === 'mcu-pico') {
      (el as unknown as { gp25: boolean }).gp25 = engine!.readDigital('GP25');
    }
  }
}

// --- Gestion des boutons -----------------------------------------------------

function bindButtons(): void {
  for (const remove of buttonRemovers) remove();
  buttonRemovers = [];
  if (!engine) return;
  for (const binding of buttonBindings(editor.diagram)) {
    const el = editor.elementOf(binding.partId);
    if (!el) continue;
    engine.setInput(binding.mcuPin, true); // relâché = pull-up
    const press = () => engine?.setInput(binding.mcuPin, false);
    const release = () => engine?.setInput(binding.mcuPin, true);
    el.addEventListener('button-press', press);
    el.addEventListener('button-release', release);
    buttonRemovers.push(() => {
      el.removeEventListener('button-press', press);
      el.removeEventListener('button-release', release);
    });
  }
}

function rebind(): void {
  bindButtons();
  refreshComponents();
}

// --- Contrôle de simulation --------------------------------------------------

function startRun(): void {
  stopRun();

  if (currentBoard === 'pico') {
    engine = new PicoEngine(picoProgram, picoFormat);
  } else {
    engine = new AvrEngine(unoProgram);
  }

  engine.onUpdate = refreshComponents;
  engine.onSerial = (chunk) => {
    serialEl.textContent += chunk;
    serialEl.scrollTop = serialEl.scrollHeight;
  };
  rebind();
  engine.start();
  runBtn.disabled = true;
  stopBtn.disabled = false;
  setStatus('En cours…');
}

function stopRun(): void {
  for (const remove of buttonRemovers) remove();
  buttonRemovers = [];
  engine?.dispose();
  engine = null;
  runBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus('Arrêté');
}

editor.onChange = () => {
  if (engine) rebind();
};

// --- Schémas de démarrage ----------------------------------------------------

function buildStarterUno(): void {
  const uno = editor.addPart('uno', 20, 50);
  const resistor = editor.addPart('resistor', 360, 90);
  const led = editor.addPart('led', 470, 70);
  const button = editor.addPart('button', 360, 230);

  editor.addWire({ partId: uno.id, pin: '13' }, { partId: resistor.id, pin: '1' });
  editor.addWire({ partId: resistor.id, pin: '2' }, { partId: led.id, pin: 'A' });
  editor.addWire({ partId: led.id, pin: 'C' }, { partId: uno.id, pin: 'GND.1' });
  editor.addWire({ partId: uno.id, pin: '2' }, { partId: button.id, pin: '1.l' });
  editor.addWire({ partId: button.id, pin: '2.l' }, { partId: uno.id, pin: 'GND.2' });
  editor.redrawWires();
}

function buildStarterPico(): void {
  const pico = editor.addPart('pico', 20, 80);
  const resistor = editor.addPart('resistor', 370, 60);
  const led = editor.addPart('led', 480, 40);
  const button = editor.addPart('button', 370, 220);

  // GP25 → résistance → LED → GND
  editor.addWire({ partId: pico.id, pin: 'GP25' }, { partId: resistor.id, pin: '1' });
  editor.addWire({ partId: resistor.id, pin: '2' }, { partId: led.id, pin: 'A' });
  editor.addWire({ partId: led.id, pin: 'C' }, { partId: pico.id, pin: 'GND.3' });

  // GP15 → bouton → GND (bouton utilisateur)
  editor.addWire({ partId: pico.id, pin: 'GP13' }, { partId: button.id, pin: '1.l' });
  editor.addWire({ partId: button.id, pin: '2.l' }, { partId: pico.id, pin: 'GND.4' });
  editor.redrawWires();
}

function buildStarter(): void {
  if (currentBoard === 'pico') {
    buildStarterPico();
  } else {
    buildStarterUno();
  }
}

function switchBoard(board: Board): void {
  if (board === currentBoard) return;
  stopRun();
  currentBoard = board;
  // Vide le canvas et reconstruit le schéma de démarrage
  for (const part of [...editor.diagram.parts]) {
    editor.removePart(part.id);
  }
  buildStarter();
  vscode.postMessage({ type: 'board', board });
}

// --- Événements DOM ----------------------------------------------------------

boardSel.addEventListener('change', () => switchBoard(boardSel.value as Board));
runBtn.addEventListener('click', startRun);
stopBtn.addEventListener('click', stopRun);
clearBtn.addEventListener('click', () => { serialEl.textContent = ''; });
compileBtn.addEventListener('click', () => {
  setStatus('Compilation…');
  vscode.postMessage({ type: 'compile' });
});
loadWsBtn.addEventListener('click', () => {
  setStatus('Chargement du workspace…');
  vscode.postMessage({ type: 'loadWorkspace' });
});

// --- Messages de l'extension -------------------------------------------------

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as {
    type?: string;
    board?: Board;
    format?: string;
    bytes?: number[];
    text?: string;
  };

  switch (msg?.type) {
    case 'runProgram':
      if (msg.board === 'uno' && msg.bytes) {
        unoProgram = Uint16Array.from(msg.bytes);
        if (currentBoard !== 'uno') {
          boardSel.value = 'uno';
          switchBoard('uno');
          return;
        }
        startRun();
      } else if (msg.board === 'pico' && msg.bytes) {
        picoProgram = Uint8Array.from(msg.bytes);
        picoFormat = (msg.format === 'rp2040-flash') ? 'rp2040-flash' : 'rp2040-ram';
        if (currentBoard !== 'pico') {
          boardSel.value = 'pico';
          switchBoard('pico');
          return;
        }
        startRun();
      }
      break;
    case 'status':
      setStatus(String(msg.text ?? ''));
      break;
  }
});

// --- Démarrage ---------------------------------------------------------------
buildStarter();
setStatus('Prêt');
vscode.postMessage({ type: 'ready' });
