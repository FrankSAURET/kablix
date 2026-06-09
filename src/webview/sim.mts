// Contrôleur de la webview MicroSim : gère l'UI, le moteur de simulation actif
// (Arduino Uno / Raspberry Pi Pico) et la messagerie avec l'extension.
import { AvrEngine } from './engines/avr.mjs';
import { PicoEngine } from './engines/pico.mjs';
import type { EngineCallbacks, SimEngine } from './engines/types.mjs';
import { UNO_DEMO } from './programs/uno-demo.mjs';
import { PICO_BLINK } from './programs/pico-blink.mjs';

type Board = 'uno' | 'pico';

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

// --- Éléments du DOM ---------------------------------------------------------
const boardSelect = document.getElementById('board') as HTMLSelectElement;
const runBtn = document.getElementById('run') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const compileBtn = document.getElementById('compile') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const boardEl = document.getElementById('board-view') as HTMLDivElement;
const serialEl = document.getElementById('serial') as HTMLPreElement;
const clearBtn = document.getElementById('clear-serial') as HTMLButtonElement;

let engine: SimEngine | null = null;
let currentBoard: Board = 'uno';

const callbacks: EngineCallbacks = {
  onLed(id, on) {
    document.getElementById(`led-${id}`)?.classList.toggle('led--on', on);
  },
  onSerial(chunk) {
    serialEl.textContent += chunk;
    serialEl.scrollTop = serialEl.scrollHeight;
  },
};

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function makeEngine(board: Board, program: Uint16Array | Uint8Array): SimEngine {
  if (board === 'uno') {
    return new AvrEngine(program as Uint16Array, callbacks);
  }
  return new PicoEngine(program as Uint8Array, callbacks);
}

function defaultProgram(board: Board): Uint16Array | Uint8Array {
  return board === 'uno' ? UNO_DEMO : PICO_BLINK;
}

function renderBoard(layout: SimEngine['layout']): void {
  boardEl.className = `board ${layout.cssClass}`;
  boardEl.innerHTML = `<div class="board__label">${layout.name}</div>`;

  const ledRow = document.createElement('div');
  ledRow.className = 'led-row';
  for (const led of layout.leds) {
    const wrap = document.createElement('div');
    wrap.className = 'led-wrap';
    wrap.innerHTML = `<div class="led" id="led-${led.id}" style="--led-color:${led.color}"></div><span class="led__label">${led.label}</span>`;
    ledRow.appendChild(wrap);
  }
  boardEl.appendChild(ledRow);

  if (layout.hasButton) {
    const btn = document.createElement('button');
    btn.className = 'push-button';
    btn.textContent = `Bouton ${layout.buttonLabel ?? ''}`.trim();
    btn.addEventListener('mousedown', () => engine?.setButton(true));
    btn.addEventListener('mouseup', () => engine?.setButton(false));
    btn.addEventListener('mouseleave', () => engine?.setButton(false));
    boardEl.appendChild(btn);
  }
}

function loadEngine(
  board: Board,
  program: Uint16Array | Uint8Array,
  autoStart: boolean
): void {
  engine?.dispose();
  currentBoard = board;
  boardSelect.value = board;
  engine = makeEngine(board, program);
  renderBoard(engine.layout);
  runBtn.disabled = false;
  stopBtn.disabled = true;
  if (autoStart) {
    startRun();
  } else {
    setStatus('Prêt');
  }
}

function startRun(): void {
  if (!engine) return;
  engine.start();
  runBtn.disabled = true;
  stopBtn.disabled = false;
  setStatus('En cours…');
}

function stopRun(): void {
  if (!engine) return;
  engine.stop();
  runBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus('Arrêté');
}

// --- Événements UI -----------------------------------------------------------
runBtn.addEventListener('click', startRun);
stopBtn.addEventListener('click', stopRun);
clearBtn.addEventListener('click', () => {
  serialEl.textContent = '';
});
boardSelect.addEventListener('change', () => {
  const board = boardSelect.value as Board;
  vscode.postMessage({ type: 'board', board });
  loadEngine(board, defaultProgram(board), false);
});
compileBtn.addEventListener('click', () => {
  setStatus('Compilation…');
  vscode.postMessage({ type: 'compile', board: currentBoard });
});

// --- Messages de l'extension -------------------------------------------------
window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data;
  switch (msg?.type) {
    case 'runProgram': {
      const board = msg.board as Board;
      const program =
        board === 'uno'
          ? Uint16Array.from(msg.bytes as number[])
          : Uint8Array.from(msg.bytes as number[]);
      loadEngine(board, program, true);
      break;
    }
    case 'status':
      setStatus(String(msg.text));
      break;
  }
});

// --- Initialisation ----------------------------------------------------------
loadEngine('uno', defaultProgram('uno'), false);
vscode.postMessage({ type: 'ready' });
