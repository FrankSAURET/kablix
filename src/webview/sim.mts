// Contrôleur de la webview Kablix : atelier visuel (placement + câblage),
// simulation Arduino Uno (avr8js) et messagerie avec l'extension.
import '@wokwi/elements/dist/esm/arduino-uno-element.js';
import '@wokwi/elements/dist/esm/led-element.js';
import '@wokwi/elements/dist/esm/pushbutton-element.js';
import '@wokwi/elements/dist/esm/resistor-element.js';

import { Editor } from './diagram/editor.mjs';
import { partDef } from './diagram/catalog.mjs';
import { ledOn, buttonBindings } from './diagram/model.mjs';
import { AvrEngine } from './engines/avr.mjs';
import type { SimEngine } from './engines/types.mjs';
import { UNO_DEMO } from './programs/uno-demo.mjs';

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

const runBtn = document.getElementById('run') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const compileBtn = document.getElementById('compile') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const serialEl = document.getElementById('serial') as HTMLPreElement;
const clearBtn = document.getElementById('clear-serial') as HTMLButtonElement;
const canvas = document.getElementById('canvas') as HTMLDivElement;
const palette = document.getElementById('palette') as HTMLDivElement;
const wiresSvg = document.getElementById('wires') as unknown as SVGSVGElement;

const editor = new Editor(canvas, palette, wiresSvg);

let engine: SimEngine | null = null;
let program: Uint16Array = UNO_DEMO;
let buttonRemovers: Array<() => void> = [];

const setStatus = (text: string): void => {
  statusEl.textContent = text;
};

function refreshLeds(): void {
  if (!engine) return;
  const read = (name: string): boolean => engine!.readDigital(name);
  for (const part of editor.diagram.parts) {
    if (partDef(part.type).kind !== 'led') continue;
    const el = editor.elementOf(part.id);
    if (el) el.value = ledOn(editor.diagram, part.id, read);
  }
}

function bindButtons(): void {
  for (const remove of buttonRemovers) remove();
  buttonRemovers = [];
  if (!engine) return;
  for (const binding of buttonBindings(editor.diagram)) {
    const el = editor.elementOf(binding.partId);
    if (!el) continue;
    engine.setInput(binding.mcuPin, true); // relâché = pull-up (haut)
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
  refreshLeds();
}

function startRun(): void {
  stopRun();
  engine = new AvrEngine(program);
  engine.onUpdate = refreshLeds;
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

runBtn.addEventListener('click', startRun);
stopBtn.addEventListener('click', stopRun);
clearBtn.addEventListener('click', () => {
  serialEl.textContent = '';
});
compileBtn.addEventListener('click', () => {
  setStatus('Compilation…');
  vscode.postMessage({ type: 'compile', board: 'uno' });
});

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data;
  switch (msg?.type) {
    case 'runProgram':
      if (msg.board === 'uno') {
        program = Uint16Array.from(msg.bytes as number[]);
        startRun();
      }
      break;
    case 'status':
      setStatus(String(msg.text));
      break;
  }
});

// --- Schéma de démarrage : Uno + LED (D13) + bouton (D2) --------------------
function buildStarter(): void {
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

buildStarter();
setStatus('Prêt');
vscode.postMessage({ type: 'ready' });
