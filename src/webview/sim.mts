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
// Composants supplémentaires importés du catalogue @wokwi/elements.
import '@wokwi/elements/dist/esm/lcd1602-element.js';
import '@wokwi/elements/dist/esm/lcd2004-element.js';
import '@wokwi/elements/dist/esm/ssd1306-element.js';
import '@wokwi/elements/dist/esm/neopixel-element.js';
import '@wokwi/elements/dist/esm/neopixel-matrix-element.js';
import '@wokwi/elements/dist/esm/led-ring-element.js';
import '@wokwi/elements/dist/esm/pushbutton-6mm-element.js';
import '@wokwi/elements/dist/esm/ntc-temperature-sensor-element.js';
import '@wokwi/elements/dist/esm/gas-sensor-element.js';
import '@wokwi/elements/dist/esm/heart-beat-sensor-element.js';
import '@wokwi/elements/dist/esm/flame-sensor-element.js';
import '@wokwi/elements/dist/esm/small-sound-sensor-element.js';
import './elements/pico-board.mjs';
import './elements/breadboard.mjs';
import './elements/custom-part.mjs';

import { initLocale, t } from './i18n.mjs';
import { Editor, type PaletteState } from './diagram/editor.mjs';
import { partDef, boardFamily, isBoardId, type BoardId, type CustomPartData } from './diagram/catalog.mjs';
import { toWokwiDiagram, fromWokwiDiagram } from './diagram/wokwi.mjs';
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
  ultrasonicBindings,
} from './diagram/model.mjs';
import { AvrEngine } from './engines/avr.mjs';
import { PicoEngine, type PicoProgram } from './engines/pico.mjs';
import type { AvrDebugInfo, Breakpoint, DebugPauseState, SimEngine } from './engines/types.mjs';
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

const editor = new Editor(canvas, palette, wiresSvg, inspector);

let board: BoardId = 'uno';
let engine: SimEngine | null = null;
let unoProgram: Uint16Array = UNO_DEMO;
let unoDebugInfo: AvrDebugInfo | null = null;
let picoProgram: PicoProgram = { kind: 'ram', image: PICO_BLINK };
let inputRemovers: Array<() => void> = [];
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
      case 'mcu':
        // LED embarquée GP25 du Pico / Pico W.
        if (def.board && boardFamily(def.board) === 'rp2040') el.ledPower = engine.readDigital('GP25');
        break;
    }
  }
}

// --- Liaison des entrées (boutons, potentiomètres) ---------------------------
function bindInputs(): void {
  for (const remove of inputRemovers) remove();
  inputRemovers = [];
  if (!engine) return;

  // Broches de servo à mesurer en largeur d'impulsion (angle réel).
  engine.setPulseMonitors?.(servoBindings(editor.diagram).map((b) => b.mcuPin));

  // Capteurs ultrason (HC-SR04) : distance lue dans l'inspecteur (défaut 20 cm).
  engine.setUltrasonic?.(
    ultrasonicBindings(editor.diagram).map((b) => {
      const part = editor.diagram.parts.find((p) => p.id === b.partId);
      return { trig: b.trig, echo: b.echo, distanceCm: Number(part?.attrs?.distance ?? 20) };
    })
  );

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
  if (state.variables.length === 0) {
    // Pause sans variable lisible (C : seules les globales sont listées ; il faut
    // les infos de débogage DWARF). On l'indique plutôt que de laisser vide.
    const row = debugVarsEl.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 2;
    cell.className = 'debug__empty';
    cell.textContent = t('No readable variable here (C: global variables only).');
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
  rebind();
  engine.start();
  editor.setLocked(true); // schéma figé pendant la simulation
  useDebugAsInspector(true); // Variables à la place des Propriétés
  runBtn.disabled = true;
  stopBtn.disabled = false;
  updateDebugButtons();
  const isPython = boardFamily(board) === 'rp2040' && picoProgram.kind === 'flash' && !!picoProgram.script;
  setStatus(isPython ? t('Starting MicroPython… (a few seconds)') : t('Running…'));
}

function stopRun(): void {
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
let paletteState: PaletteState = { sort: 'category', recents: [] };
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
editor.onExportCustomPart = (part: CustomPartData) => {
  vscode.postMessage({ type: 'exportCustomPart', part });
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
