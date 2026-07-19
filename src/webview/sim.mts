// Contrôleur de la webview Kablix : atelier visuel (placement + câblage),
// simulation Arduino Uno (avr8js) / Raspberry Pi Pico (rp2040js) et
// messagerie avec l'extension.
// Composants forkés de @wokwi/elements v1.9.2 (MIT) — voir composants/LICENSE-wokwi.md.
import './composants/arduino-uno-element.mjs';
import './composants/arduino-nano-element.mjs';
import './composants/arduino-mega-element.mjs';
import './composants/led-element.mjs';
import './composants/pushbutton-element.mjs';
import './composants/resistor-element.mjs';
import './composants/ldr-element.mjs';
import './composants/ntc-element.mjs';
import './composants/ptc-element.mjs';
import './composants/rgb-led-element.mjs';
import './composants/buzzer-element.mjs';
import './composants/potentiometer-element.mjs';
import './composants/slide-potentiometer-element.mjs';
import './composants/7segment-element.mjs';
import './composants/led-bar-graph-element.mjs';
import './composants/slide-switch-element.mjs';
import './composants/dip-switch-8-element.mjs';
import './composants/analog-joystick-element.mjs';
import './composants/photoresistor-sensor-element.mjs';
import './composants/pir-motion-sensor-element.mjs';
import './composants/tilt-switch-element.mjs';
import './composants/servo-element.mjs';
import './composants/lcd1602-element.mjs';
import './composants/ssd1306-element.mjs';
import './composants/ili9341-element.mjs';
import './composants/microsd-card-element.mjs';
import './composants/neopixel-element.mjs';
import './composants/neopixel-matrix-element.mjs';
import './composants/led-ring-element.mjs';
import './composants/pushbutton-6mm-element.mjs';
import './composants/ntc-temperature-sensor-element.mjs';
import './composants/gas-sensor-element.mjs';
import './composants/heart-beat-sensor-element.mjs';
import './composants/flame-sensor-element.mjs';
import './composants/small-sound-sensor-element.mjs';
import './composants/hc-sr04-element.mjs';
import './composants/dht22-element.mjs';
import './composants/membrane-keypad-element.mjs';
// Composants entièrement maison.
import './composants/pico-board.mjs';
import './composants/breadboard.mjs';
import './composants/grove-shield-element.mjs';
import './composants/alim-element.mjs';
import './composants/pca9685-element.mjs';
import './composants/custom-part.mjs';

import { initLocale, t } from './i18n.mjs';
import { Plotter } from './plotter.mjs';
import { Editor, KABLIX_BADGE, type PaletteState } from './diagram/editor.mjs';
import { partDef, boardFamily, isBoardId, PARAM_ATTR_PREFIX, type BoardId, type CustomPartData } from './diagram/catalog.mjs';
import { compileExpr } from './diagram/expr.mjs';
import { toWokwiDiagram, fromWokwiDiagram } from './diagram/wokwi.mjs';
import {
  ledOn,
  ledMcuPin,
  ledPowerCircuit,
  ledElectrical,
  psuLoadAmps,
  pca9685PowerState,
  rgbSeriesOhms,
  sevenSegSeriesOhms,
  ledBarSeriesOhms,
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
  aoDoSensorBindings,
  servoBindings,
  buzzerBindings,
  ultrasonicBindings,
  keypadBindings,
  dht22Bindings,
  pca9685Bindings,
  rgbLedBindings,
  sevenSegmentBindings,
  neopixelBindings,
  lcdParallelBindings,
  spiDeviceBindings,
  adcDividerLevels,
  variableResistorOhms,
  VARIABLE_RESISTOR_TYPES,
  type Part,
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

/** Mode d'affichage des noms de composants (bouton « Noms » de la barre). */
type LabelsMode = 'all' | 'selected' | 'none';

/** État sauvegardé dans la webview pour survivre à un déplacement d'onglet. */
interface PersistedState {
  diagram?: { parts?: unknown[]; wires?: unknown[] };
  board?: BoardId;
  /** Héritage (≤ v2026.7.107) : true = tous les noms, false = sélection seule. */
  showLabels?: boolean;
  labelsMode?: LabelsMode;
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
const newProjectBtn = document.getElementById('new-project') as HTMLButtonElement;
const saveProjectBtn = document.getElementById('save-project') as HTMLButtonElement;
const saveProjectAsBtn = document.getElementById('save-project-as') as HTMLButtonElement;
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
const serialInputRow = document.getElementById('serial-input-row') as HTMLDivElement;
const clearBtn = document.getElementById('clear-serial') as HTMLButtonElement;
const serialTitleEl = document.getElementById('serial-title') as HTMLSpanElement;
const closeSerialBtn = document.getElementById('close-serial') as HTMLButtonElement;
const toggleSerialBtn = document.getElementById('toggle-serial') as HTMLButtonElement;
const plotterSection = document.getElementById('plotter-section') as HTMLElement;
const togglePlotterBtn = document.getElementById('toggle-plotter') as HTMLButtonElement;
const closePlotterBtn = document.getElementById('close-plotter') as HTMLButtonElement;
const canvas = document.getElementById('canvas') as HTMLDivElement;
const palette = document.getElementById('palette') as HTMLDivElement;
const wiresSvg = document.getElementById('wires') as unknown as SVGSVGElement;
const inspector = document.getElementById('inspector') as HTMLDivElement;
const codeFileBtn = document.getElementById('code-file') as HTMLButtonElement;
const replBtn = document.getElementById('repl') as HTMLButtonElement;
const projectNameEl = document.getElementById('project-name') as HTMLSpanElement;
const resetSimBtn = document.getElementById('reset-sim') as HTMLButtonElement;
const clearCanvasBtn = document.getElementById('clear-canvas') as HTMLButtonElement;
const fitViewBtn = document.getElementById('fit-view') as HTMLButtonElement;
const autoRouteBtn = document.getElementById('auto-route') as HTMLButtonElement;
const internalToggleBtn = document.getElementById('internal-toggle') as HTMLButtonElement;
internalToggleBtn.innerHTML = KABLIX_BADGE;

const editor = new Editor(canvas, palette, wiresSvg, inspector);

// Bouton ☢ de la barre d'outils : affiché seulement quand le composant sélectionné
// dispose d'un câblage interne / poster de brochage ; agit sur ce composant.
editor.onSelectionChange = ({ schema, shown }) => {
  internalToggleBtn.hidden = !schema;
  internalToggleBtn.classList.toggle('canvas-controls__btn--active', shown);
};
internalToggleBtn.addEventListener('click', () => editor.toggleSelectedSchema());

// Message « Simulation en cours » : bandeau PERMANENT rouge sur jaune, fixé entre
// les deux barres d'outils (au-dessus du canvas), visible pendant toute la
// simulation. Clignote 3× quand une action d'édition interdite est tentée.
const simBanner = document.getElementById('sim-banner') as HTMLDivElement;
simBanner.textContent = t('⚠ Simulation running: editing is disabled.');
simBanner.hidden = true;
function showSimBanner(show: boolean): void {
  simBanner.hidden = !show;
  if (!show) simBanner.classList.remove('sim-banner--blink');
}
editor.onBlockedEdit = () => {
  // Relance l'animation de clignotement (3 flashs) à chaque tentative interdite.
  simBanner.classList.remove('sim-banner--blink');
  void simBanner.offsetWidth; // reflow
  simBanner.classList.add('sim-banner--blink');
};
simBanner.addEventListener('animationend', () => simBanner.classList.remove('sim-banner--blink'));

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
// Capteurs de pouls : broche analogique MCU + élément (BPM réglé par le curseur).
// La sortie OUT est régénérée à chaque frame en forme d'onde cardiaque (PPG).
type SimElement = NonNullable<ReturnType<Editor['elementOf']>>;
let pulseTargets: Array<{ pin: string; el: SimElement }> = [];
// Capteurs PIR : broche MCU + élément. La sortie suit `el.motion` (survol souris
// / Ctrl+clic), relue à chaque frame car le survol n'émet pas d'événement.
let motionTargets: Array<{ pin: string; el: SimElement; last: boolean }> = [];
// LED RGB : partId → broches MCU des canaux R/G/B (rapport cyclique PWM).
let rgbLedTargets = new Map<string, { r: string | null; g: string | null; b: string | null }>();
// Afficheur 7 segments 1 chiffre : partId → broche MCU de chaque segment
// (rapport cyclique PWM, un segment piloté en PWM pour varier sa luminosité
// clignoterait sinon au rythme de l'échantillonnage).
let sevenSegTargets = new Map<string, Record<string, string | null>>();
// Écrans SPI : partId → appareil (rendu de l'image). OLED SSD1306 / TFT ILI9341.
let spiOledDevices = new Map<string, Ssd1306Device>();
let spiTftDevices = new Map<string, Ili9341Device>();
// Afficheurs 7 segments multi-chiffres : partId → segments mémorisés (latch) de
// chaque chiffre (le balayage n'éclaire qu'un chiffre à la fois ; on conserve la
// dernière valeur connue de chacun pour reconstituer l'affichage complet).
let sevenSegLatch = new Map<string, number[]>();
// Afficheur 7 segments à 1 chiffre : anti-scintillement. Un script MicroPython
// (interprété, donc lent face à l'AVR compilé) écrit ses broches de segment une
// par une ; l'écart réel entre deux écritures peut dépasser plusieurs frames de
// rendu (~16 ms), donc un simple « stable sur 2 frames » ne suffit pas. On
// republie le nouvel état seulement s'il n'a plus changé depuis un court délai
// réel (attend la fin de la rafale d'écritures avant d'afficher).
const SEVEN_SEG_SETTLE_MS = 40;
let sevenSegStable = new Map<string, { shown: number[]; pending: number[]; pendingSince: number }>();
// LED grillées pendant ce run (résistance série trop faible → sur-courant) :
// l'état est définitif jusqu'au prochain lancement (la LED est « remplacée »).
const burnedLeds = new Set<string>();
// Facteur de luminosité par LED (résistance trop forte → LED sombre), mémorisé
// à la dernière frame où la LED conduisait.
const ledLumFactor = new Map<string, number>();
let breakpoints: Breakpoint[] = []; // points d'arrêt envoyés par l'extension (ligne + condition)
// Vrai dès qu'un programme compilé/chargé a été reçu : sinon, lancer la
// simulation déclenche d'abord une compilation automatique du fichier de code.
let programLoaded = false;

const setStatus = (text: string): void => {
  statusEl.textContent = text;
};

/** Message de statut TEMPORAIRE (ex. « Projet sauvegardé ») : affiché 3 s puis
 *  retour au statut précédent — sauf s'il a changé entre-temps (simulation…). */
let flashTimer: ReturnType<typeof setTimeout> | undefined;
const flashStatus = (text: string): void => {
  clearTimeout(flashTimer);
  const previous = statusEl.textContent ?? '';
  statusEl.textContent = text;
  flashTimer = setTimeout(() => {
    if (statusEl.textContent === text) statusEl.textContent = previous;
  }, 3000);
};

/**
 * Micro-émulation terminal : le REPL MicroPython édite sa ligne avec
 * Backspace (0x08) + « effacer jusqu'à fin de ligne » (`\x1b[K`) plutôt que
 * de renvoyer tout le texte — sans ce traitement, `textContent += chunk`
 * afficherait le code de contrôle brut (ex. littéralement « [K » à l'écran).
 * Les séquences ANSI non gérées (couleurs, curseur…) sont juste avalées.
 */
let ansiEscape = ''; // séquence "\x1b[...": accumulée jusqu'à sa lettre finale
function processAnsi(chunk: string): string {
  let text = serialEl.textContent ?? '';
  for (const ch of chunk) {
    if (ansiEscape) {
      ansiEscape += ch;
      // Terminée par une lettre (ex. « K » = efface jusqu'à fin de ligne) : le
      // Backspace qui précède toujours cette séquence a déjà reculé le curseur
      // d'un cran, donc rien de plus à effacer dans ce buffer texte simplifié.
      if (/[A-Za-z]/.test(ch)) ansiEscape = '';
      continue;
    }
    if (ch === '\x1b') {
      ansiEscape = ch;
    } else if (ch === '\b' || ch === '\x7f') {
      text = text.slice(0, -1);
    } else if (ch === '\r') {
      // MicroPython envoie \r\n en fin de ligne ; en white-space: pre-wrap,
      // le navigateur rend déjà un CR comme un saut de ligne à lui seul — le
      // \n qui suit en ajouterait un second. On avale le CR, le \n fait le travail.
      continue;
    } else {
      text += ch;
    }
  }
  return text;
}

const appendSerial = (chunk: string): void => {
  serialEl.textContent = processAnsi(chunk);
  serialEl.scrollTop = serialEl.scrollHeight;
};

/** Vide la console/moniteur série. */
const clearSerial = (): void => {
  serialEl.textContent = '';
  ansiEscape = '';
};

/**
 * Mode REPL interactif (Pico, firmware MicroPython sans script) : la console
 * elle-même capture le clavier et transmet chaque touche au microcontrôleur
 * octet par octet — comme un vrai terminal série, c'est le firmware qui fait
 * l'écho (aucun texte inséré localement). La ligne d'envoi séparée n'a plus
 * lieu d'être dans ce mode.
 */
let replMode = false;

function setReplMode(active: boolean): void {
  replMode = active;
  serialInputRow.hidden = active;
  serialEl.classList.toggle('serial__out--repl', active);
  // contenteditable (plutôt que juste tabindex) : c'est ce qui fait émettre au
  // navigateur un vrai événement `paste` avec clipboardData rempli — sans ça,
  // Ctrl+V ne déclenche rien sur un <pre> simplement focusable.
  serialEl.contentEditable = active ? 'true' : 'false';
  if (active) serialEl.focus();
}

/** Traduit une touche du clavier en octet(s) série (Entrée → CR, Retour → DEL, flèches ignorées). */
function replKeyToBytes(e: KeyboardEvent): string | null {
  if (e.key === 'Enter') return '\r';
  if (e.key === 'Backspace') return '\x7f';
  if (e.key === 'Tab') return '\t';
  if (e.ctrlKey && e.key.length === 1) {
    // Ctrl+V : toujours le collage natif (jamais un code de contrôle).
    // Ctrl+C avec une sélection active : copie native, pas une interruption —
    // sans texte sélectionné, on retombe sur le code de contrôle (0x03).
    if (e.key.toUpperCase() === 'V') return null;
    if (e.key.toUpperCase() === 'C' && (window.getSelection()?.toString().length ?? 0) > 0) {
      return null;
    }
    // Ctrl+lettre -> code de contrôle (Ctrl-C = 0x03, Ctrl-D = 0x04…), utile
    // pour interrompre un script ou forcer un soft-reboot depuis le REPL.
    const code = e.key.toUpperCase().charCodeAt(0) - 64;
    return code >= 0 && code < 32 ? String.fromCharCode(code) : null;
  }
  if (e.key.length === 1 && !e.altKey && !e.metaKey) return e.key;
  return null;
}

serialEl.addEventListener('keydown', (e) => {
  if (!replMode || !engine) return;
  const bytes = replKeyToBytes(e);
  if (bytes === null) return;
  e.preventDefault();
  engine.writeSerial(bytes);
});

// Verrou d'insertion : sur un contentEditable, bloquer `keydown` ne suffit pas
// à empêcher Chrome/Electron d'insérer aussi le texte nativement (l'édition
// passe par `beforeinput`, pas `keydown`) — c'est le firmware qui fait l'écho
// via `appendSerial`, donc toute insertion native produirait un texte en
// double. Le collage (`insertFromPaste`) est bloqué ici aussi : le handler
// `paste` ci-dessous gère lui-même l'envoi au firmware, `beforeinput` arrive
// avant et insérerait sinon le texte collé une seconde fois nativement.
serialEl.addEventListener('beforeinput', (e) => {
  if (!replMode) return;
  e.preventDefault();
});

// Collage (Ctrl+V ou menu contextuel) : le texte du presse-papiers part
// octet par octet, comme une frappe rapide — MicroPython l'interprète ligne
// par ligne (utile pour coller plusieurs commandes d'un coup). Un texte copié
// depuis un éditeur (VS Code…) sous Windows contient des fins de ligne CRLF
// (`\r\n`) : les traiter indépendamment (`\r` tel quel + `\n` → `\r`) envoyait
// DEUX Entrée par ligne, chacune affichant sa propre invite `>>> ` — d'où des
// lignes vides après chaque commande collée. `\r\n`/`\r`/`\n` sont donc
// d'abord normalisés en un seul `\r` par fin de ligne avant l'envoi.
serialEl.addEventListener('paste', (e) => {
  if (!replMode || !engine) return;
  e.preventDefault();
  const text = e.clipboardData?.getData('text/plain') ?? '';
  const normalized = text.replace(/\r\n|\r|\n/g, '\r');
  for (const ch of normalized) engine.writeSerial(ch);
});

// --- Fichier de code : état « aucun fichier choisi » --------------------------
// Vrai dès qu'un fichier de code est associé (chip du canvas). Sinon le bouton
// s'affiche en jaune sur rouge (avertissement) et clignote au lancement.
let hasCodeFile = false;

/** Fait clignoter 3 fois le bouton du fichier de code (avertissement : aucun choisi). */
function blinkCodeFileBtn(): void {
  codeFileBtn.classList.remove('canvas-controls__file--blink');
  void codeFileBtn.offsetWidth; // reflow : relance l'animation à chaque appel
  codeFileBtn.classList.add('canvas-controls__file--blink');
}
codeFileBtn.addEventListener('animationend', () => {
  codeFileBtn.classList.remove('canvas-controls__file--blink');
});

// --- Visibilité du moniteur série / console -----------------------------------
let serialVisible = true;

/** Affiche ou masque la section du moniteur série et mémorise le choix. */
function setSerialVisible(visible: boolean, persist = true): void {
  serialVisible = visible;
  serialEl0.hidden = !visible;
  toggleSerialBtn.classList.toggle('primary', visible);
  if (persist) saveUiState();
}

// --- Traceur de courbes (télémétrie `>nom:valeur` + sondes analogiques) -------
const plotter = new Plotter();
// Préférence utilisateur persistée : undefined = jamais touché → le panneau
// s'ouvre tout seul à la première donnée reçue ; false = fermé explicitement.
let plotterUserPref: boolean | undefined;
let plotterVisible = false;

/** Affiche ou masque le traceur (persist = choix explicite de l'utilisateur). */
function setPlotterVisible(visible: boolean, persist = true): void {
  plotterVisible = visible;
  plotterSection.hidden = !visible;
  togglePlotterBtn.classList.toggle('primary', visible);
  if (visible) plotter.refresh(); // le canvas était en taille nulle : redessin
  if (persist) {
    plotterUserPref = visible;
    saveUiState();
  }
}

plotter.onFirstData = () => {
  // Auto-ouverture à la première télémétrie, sauf refus explicite mémorisé.
  if (!plotterVisible && plotterUserPref !== false) setPlotterVisible(true, false);
};
plotter.onExportCsv = (csv) => {
  vscode.postMessage({ type: 'exportCsv', csv });
};
// Ligne retenue par le filtre télémétrie finalement non conforme : rendue à la
// console (ex. « > » isolé tapé au REPL).
plotter.onHoldFlush = (text) => appendSerial(text);
togglePlotterBtn.addEventListener('click', () => setPlotterVisible(!plotterVisible));
closePlotterBtn.addEventListener('click', () => setPlotterVisible(false));

/** Titre du panneau série : « Console » pour un Pico, « Moniteur série » sinon. */
function updateSerialTitle(): void {
  serialTitleEl.textContent =
    boardFamily(board) === 'rp2040' ? t('Console') : t('Serial monitor');
  replBtn.hidden = boardFamily(board) !== 'rp2040';
}

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

// Boucle de rendu continue (découplée du moteur) pendant toute la simulation.
// Nécessaire car une mise à jour PONCTUELLE du calque transformé du canvas (LCD
// écrit une fois puis inactif) n'est pas toujours repeinte par le navigateur : la
// repeinture ne « prend » que sous flux d'invalidations continu. Un composant qui
// bouge sans cesse (7 segments multiplexé) suffisait à faire réapparaître le LCD ;
// on garantit ce flux nous-mêmes en redessinant à chaque frame tant que le moteur
// tourne. Léger (refreshVisuals ~1 ms) et le moteur cède la main (setTimeout).
let renderRaf = 0;
function renderTick(): void {
  if (!engine) {
    renderRaf = 0;
    return;
  }
  updatePulses();
  updateMotion();
  refreshVisuals();
  renderRaf = requestAnimationFrame(renderTick);
}

/** Met à jour la sortie des capteurs PIR selon le survol souris (au changement). */
function updateMotion(): void {
  if (!engine || motionTargets.length === 0) return;
  for (const target of motionTargets) {
    const now = Boolean(target.el.motion);
    if (now !== target.last) {
      engine.setInput(target.pin, now);
      target.last = now;
    }
  }
}

/**
 * Forme d'onde de pouls (PPG) normalisée 0..1 sur une phase t∈[0,1) : montée
 * systolique rapide (pic vers t≈0.16), redescente, petite onde dicrotique
 * (t≈0.42), puis ligne de base. Approximation par deux gaussiennes.
 *
 * Ligne de base haute (0.6) + amplitude modérée (0.15) : un vrai capteur KY-039
 * varie peu en valeur absolue (bruit + faible modulation), il ne bascule pas
 * entre presque 0 et presque plein échelle à chaque battement. Avec une ligne de
 * base quasi nulle, les algos de détection par seuil relatif (ex. tuto KY-039
 * classique : max_value -= 1000 // delay_msec) perdent le pic en 1-2 échantillons
 * à 60 ms et redéclenchent sur la même descente → BPM mesuré ~2× trop élevé.
 */
function pulseWaveform(t: number): number {
  const g = (c: number, w: number) => Math.exp(-((t - c) * (t - c)) / (2 * w * w));
  const systolic = g(0.16, 0.1);
  const dicrotic = 0.35 * g(0.42, 0.1);
  return Math.max(0, Math.min(1, 0.6 + 0.15 * Math.max(systolic, dicrotic)));
}

/** Met à jour la sortie analogique de chaque capteur de pouls selon son BPM. */
function updatePulses(): void {
  if (!engine || pulseTargets.length === 0) return;
  const now = performance.now();
  for (const { pin, el } of pulseTargets) {
    const bpm = Math.max(0, Math.min(200, Number(el.bpm ?? 72)));
    if (bpm <= 0) {
      engine.setAnalog(pin, 0.08); // pas de pouls : ligne de base
      continue;
    }
    const periodMs = 60000 / bpm;
    const t = (now % periodMs) / periodMs; // phase 0..1 du battement courant
    engine.setAnalog(pin, pulseWaveform(t));
  }
}
function startRenderLoop(): void {
  if (!renderRaf) renderRaf = requestAnimationFrame(renderTick);
}
function stopRenderLoop(): void {
  if (renderRaf) cancelAnimationFrame(renderRaf);
  renderRaf = 0;
}

// Précharge la police LED des écrans LCD dès l'ouverture de la webview (thread
// libre). Un `<text>` SVG dont la police n'est pas encore décodée peut rester
// invisible ; en cours de simulation le décodage est repoussé (thread saturé),
// d'où un texte qui n'apparaît qu'à la pause. On force le chargement tôt et on
// redessine une fois la police prête.
try {
  const fonts = (document as unknown as { fonts?: { load(f: string): Promise<unknown> } }).fonts;
  fonts?.load("20px 'LED Board-7'").then(() => queueRefresh()).catch(() => {});
} catch {
  /* API Font Loading absente : repli sur la police à chasse fixe */
}

/** Valeur courante (Ω) d'une résistance variable nue — curseur du composant en
 *  simulation ; null si l'élément est absent (repli : point de repos des attrs). */
function liveVariableOhms(part: Part): number | null {
  if (!VARIABLE_RESISTOR_TYPES.has(part.type)) return null;
  const el = editor.elementOf(part.id);
  const x = Number((part.type === 'ldr' ? el?.lux : el?.temperature) ?? NaN);
  if (!Number.isFinite(x)) return null;
  return variableResistorOhms(part.type, x, part.attrs);
}

/** Tension courante (V) d'une alim de laboratoire (bouton du dessin en direct). */
function psuLiveVolts(psuId: string): number | null {
  const v = Number(editor.elementOf(psuId)?.volts);
  return Number.isFinite(v) ? v : null;
}

function refreshVisuals(): void {
  if (!engine) return;
  const read = (name: string): boolean => engine!.readDigital(name);
  const servoTargets = new Map(servoBindings(editor.diagram).map((b) => [b.partId, b.mcuPin]));
  for (const part of editor.diagram.parts) {
    const def = partDef(part.type);
    const el = editor.elementOf(part.id);
    if (!el) continue;
    // Un composant qui échoue au rendu ne doit jamais figer toute la simulation
    // (le reste des composants continue de se rafraîchir).
    try {
    switch (def.kind) {
      case 'led': {
        const on = ledOn(editor.diagram, part.id, read);
        // LED pilotée en PWM (variateur de luminosité) : le niveau instantané
        // alterne 0/1 à haute fréquence → la LED « clignote » au rythme du
        // rafraîchissement. On affiche alors le rapport cyclique comme luminosité
        // (comme la LED RGB et le 7 segments).
        const pwmPin = ledMcuPin(editor.diagram, part.id);
        const duty = pwmPin && engine!.pulseActive?.(pwmPin) ? engine!.readPwmDuty?.(pwmPin) : undefined;
        if (def.custom) {
          el.active = on;
          break;
        }
        // Résistance série : trop faible (ou absente) → courant de crête
        // destructeur dès que la LED conduit, elle grille (flamme, définitif
        // jusqu'au prochain lancement) ; trop forte → luminosité réduite,
        // voire nulle. Le duty PWM ne protège pas du courant de crête.
        const conducts = on || (duty !== undefined && duty > 0.001);
        if (conducts && !burnedLeds.has(part.id)) {
          // Tension de la source : celle de l'alim de laboratoire si le chemin
          // de l'anode y aboutit (bouton relu en direct), sinon VCC de la carte.
          const circ = ledPowerCircuit(editor.diagram, part.id, psuLiveVolts);
          const vs = circ.supplyVolts ?? (boardFamily(board) === 'rp2040' ? 3.3 : 5);
          const elec = ledElectrical(circ.ohms, vs, part.attrs?.color);
          if (elec.overCurrent) burnedLeds.add(part.id);
          else ledLumFactor.set(part.id, elec.lum);
        }
        if (burnedLeds.has(part.id)) {
          el.burned = true;
          el.value = false;
          el.brightness = 0;
          break;
        }
        el.burned = false;
        const lum = ledLumFactor.get(part.id) ?? 1;
        if (duty !== undefined) {
          el.value = duty > 0.001 && lum > 0;
          el.brightness = duty * lum;
        } else {
          el.value = on && lum > 0;
          el.brightness = lum;
        }
        break;
      }
      case 'rgb-led': {
        const s = rgbLedState(editor.diagram, part.id, read);
        // Canal piloté en PWM : le niveau instantané fait clignoter la LED au
        // rythme du rafraîchissement. On affiche alors le rapport cyclique
        // mesuré (= luminosité réelle), inversé pour une anode commune.
        const bind = rgbLedTargets.get(part.id);
        const chan = (lit: boolean, pin: string | null | undefined): number => {
          if (!s.comOk || !pin || !engine!.pulseActive?.(pin)) return lit ? 1 : 0;
          const duty = engine!.readPwmDuty?.(pin);
          if (duty === undefined) return lit ? 1 : 0;
          return s.commonAnode ? 1 - duty : duty;
        };
        // Résistance série PAR CANAL (même physique que la LED simple) : un
        // canal qui conduit en sur-courant grille toute la LED (flamme) ;
        // résistance trop forte → canal assombri voire éteint.
        const vs = boardFamily(board) === 'rp2040' ? 3.3 : 5;
        const level = (chanPin: 'R' | 'G' | 'B', color: string, raw: number): number => {
          if (raw <= 0 || burnedLeds.has(part.id)) return raw;
          const elec = ledElectrical(rgbSeriesOhms(editor.diagram, part.id, chanPin), vs, color);
          if (elec.overCurrent) {
            burnedLeds.add(part.id);
            return 0;
          }
          return raw * elec.lum;
        };
        const red = level('R', 'red', chan(s.red, bind?.r));
        const green = level('G', 'green', chan(s.green, bind?.g));
        const blue = level('B', 'blue', chan(s.blue, bind?.b));
        const burned = burnedLeds.has(part.id);
        el.burned = burned;
        el.ledRed = burned ? 0 : red;
        el.ledGreen = burned ? 0 : green;
        el.ledBlue = burned ? 0 : blue;
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
      case 'psu': {
        // Alim de laboratoire : LED « Courant limite » (rouge vif + halo) quand
        // le courant débité — approximation psuLoadAmps, résistances variables
        // au curseur — dépasse le courant max de l'inspecteur. Tension relue en
        // direct sur le bouton du dessin (el.volts).
        const volts = Number(el.volts ?? part.attrs?.voltage ?? 0) || 0;
        const maxAmps = Math.max(0.05, Number(part.attrs?.maxcurrent ?? 1) || 1);
        el.overAmps = psuLoadAmps(editor.diagram, part.id, volts, liveVariableOhms) > maxAmps;
        break;
      }
      case '7segment': {
        const digits = Math.max(1, Number(part.attrs?.digits ?? 1) || 1);
        const commonAnode = part.attrs?.common === 'anode';
        let vals: number[];
        if (digits <= 1) {
          // Un segment piloté en PWM (variateur de luminosité, bit-banging
          // MicroPython inclus) bascule trop vite/irrégulièrement pour que le
          // niveau instantané soit fiable : on se base sur le rapport cyclique
          // mesuré (moyenne stable) dès qu'une broche de segment pulse.
          const segPins = sevenSegTargets.get(part.id);
          const readSeg = (seg: string, instant: number): number => {
            const pin = segPins?.[seg];
            if (!pin || !engine!.pulseActive?.(pin)) return instant;
            const duty = engine!.readPwmDuty?.(pin);
            if (duty === undefined) return instant;
            const lit = commonAnode ? 1 - duty : duty;
            return lit >= 0.5 ? 1 : 0;
          };
          const instant = sevenSegmentState(editor.diagram, part.id, read);
          const next = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'].map((seg, i) => readSeg(seg, instant[i]));
          const now = performance.now();
          let stable = sevenSegStable.get(part.id);
          if (!stable) {
            stable = { shown: next, pending: next, pendingSince: now };
            sevenSegStable.set(part.id, stable);
          } else {
            if (next.some((v, i) => v !== stable!.pending[i])) {
              stable.pending = next; // nouvel état candidat : le chrono repart
              stable.pendingSince = now;
            } else if (
              now - stable.pendingSince >= SEVEN_SEG_SETTLE_MS &&
              next.some((v, i) => v !== stable!.shown[i])
            ) {
              stable.shown = next; // resté identique assez longtemps : publié
            }
          }
          vals = stable.shown.slice();
        } else {
          // Multiplexage : on échantillonne le chiffre actuellement sélectionné
          // (broche DIGn active) et on mémorise ses segments ; les autres gardent
          // leur dernière valeur connue → l'affichage complet reste stable.
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
          vals = latch.slice();
        }
        // Résistance série par broche de segment (même physique que la LED) :
        // un segment allumé en sur-courant grille tout l'afficheur (flamme) ;
        // résistance trop forte → segment assombri (valeur fractionnaire,
        // rendue par color-mix dans le fork) voire éteint.
        if (!burnedLeds.has(part.id)) {
          const vs = boardFamily(board) === 'rp2040' ? 3.3 : 5;
          const lumBySeg = new Map<string, number>();
          for (let i = 0; i < vals.length; i++) {
            if (!vals[i]) continue;
            const segPin = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'][i % 8];
            let lum = lumBySeg.get(segPin);
            if (lum === undefined) {
              const elec = ledElectrical(
                sevenSegSeriesOhms(editor.diagram, part.id, segPin, commonAnode), vs, 'red'
              );
              if (elec.overCurrent) {
                burnedLeds.add(part.id);
                break;
              }
              lum = elec.lum;
              lumBySeg.set(segPin, lum);
            }
            vals[i] = vals[i] * lum;
          }
        }
        const seg7Burned = burnedLeds.has(part.id);
        el.burned = seg7Burned;
        el.values = seg7Burned ? vals.map(() => 0) : vals;
        break;
      }
      case 'led-bar': {
        const vals = ledBarState(editor.diagram, part.id, read);
        // Même physique que la LED simple, LED par LED de la barre : une seule
        // en sur-courant grille toute la barre.
        if (!burnedLeds.has(part.id)) {
          const vs = boardFamily(board) === 'rp2040' ? 3.3 : 5;
          for (let i = 0; i < vals.length; i++) {
            if (!vals[i]) continue;
            const elec = ledElectrical(
              ledBarSeriesOhms(editor.diagram, part.id, i), vs, part.attrs?.color ?? 'red'
            );
            if (elec.overCurrent) {
              burnedLeds.add(part.id);
              break;
            }
            vals[i] = vals[i] * elec.lum;
          }
        }
        const barBurned = burnedLeds.has(part.id);
        el.burned = barBurned;
        el.values = barBurned ? vals.map(() => 0) : vals;
        break;
      }
      case 'servo': {
        // Angle réel d'après la largeur d'impulsion mesurée, interpolée entre
        // les impulsions 0°/180° du composant (défaut 500-2500 µs, datasheet
        // SG90 ; réglables dans l'inspecteur — lib Servo Arduino : 544-2400).
        // Repli sur 0/90° si la mesure n'est pas disponible (broche non encore
        // pilotée, moteur sans mesure d'impulsion).
        const pin = servoTargets.get(part.id);
        if (!pin) break;
        const us = engine.readPulseUs?.(pin) ?? 0;
        if (us > 0) {
          const pmin = Number(part.attrs?.pulsemin) || 500;
          const pmax = Number(part.attrs?.pulsemax) || 2500;
          const span = pmax > pmin ? pmax - pmin : 2000;
          el.angle = Math.max(0, Math.min(180, ((us - pmin) / span) * 180));
        } else {
          el.angle = engine.readDigital(pin) ? 90 : 0;
        }
        break;
      }
      case 'i2c-lcd': {
        // Texte décodé affiché sur le LCD. En I²C : Lcd1602Device (bus décodé) ;
        // en parallèle (pins=full) : readLcdParallel (RS/E/données décodés par le
        // moteur). Composant perso (kablix-custom-part) → setLcd superpose le texte
        // sur le dessin. Élément kablix-lcd1602 → on alimente directement son
        // écran natif (text).
        const parallel = (part.attrs?.pins ?? 'i2c') === 'full';
        const dev = i2cDevices.get(part.id);
        const lines = parallel
          ? engine.readLcdParallel?.(part.id) ?? null
          : dev instanceof Lcd1602Device
            ? dev.text
            : null;
        if (lines) {
          // `bind(el)` : méthode extraite sans son `this` (même piège que setPixel).
          const setLcd = (
            el.setLcd as
              | ((lines: string[], rect: { x: number; y: number; w: number; h: number }) => void)
              | undefined
          )?.bind(el);
          if (setLcd) {
            setLcd(lines, lcdScreenRect(part, def.custom?.svg));
          } else {
            (el as unknown as { text?: string }).text = lines.join('\n');
          }
        }
        break;
      }
      case 'i2c-oled': {
        // Tampon GDDRAM décodé → image de l'écran OLED (blanc sur noir). Composant
        // unique I²C/SPI (attrs.pins, cf. catalog.mts) : en mode spi le périphérique
        // simulé est dans spiOledDevices, pas i2cDevices.
        const dev = part.attrs?.pins === 'spi' ? spiOledDevices.get(part.id) : i2cDevices.get(part.id);
        if (dev instanceof Ssd1306Device) {
          renderOled(el as unknown as { imageData?: ImageData; redraw?: () => void }, dev);
        }
        break;
      }
      case 'spi-oled': {
        // Écran OLED SPI : tampon décodé du bus SPI → image.
        const dev = spiOledDevices.get(part.id);
        if (dev) {
          renderOled(el as unknown as { imageData?: ImageData; redraw?: () => void }, dev);
        }
        break;
      }
      case 'spi-tft': {
        // Écran TFT couleur ILI9341 : image RGBA → canvas de l'élément (dessin natif).
        const dev = spiTftDevices.get(part.id);
        if (dev) {
          renderTft(el as unknown as { canvas?: HTMLCanvasElement | null }, dev);
        }
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
    } catch (err) {
      console.error('refreshVisuals', part.type, err);
    }
  }
  // Seconde passe : les sorties PCA9685 priment sur l'état « hors-net » des cibles.
  applyPca9685();
}

/**
 * Durée d'appui minimale (ms). Un clic très bref émet press puis release dans la
 * même frame : le balayage du firmware (clavier, anti-rebond d'un BP) peut le
 * manquer. On prolonge donc tout appui à au moins cette durée.
 */
const MIN_PRESS_MS = 150;

/**
 * Enrobe une paire enfoncer/relâcher pour garantir `MIN_PRESS_MS` : un relâcher
 * trop précoce est différé. Un nouvel appui annule le relâcher en attente.
 */
function minHoldPress(
  onDown: () => void,
  onUp: () => void
): { press: () => void; release: () => void; cancel: () => void } {
  let downAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  return {
    press: () => {
      clear();
      downAt = performance.now();
      onDown();
    },
    release: () => {
      const wait = Math.max(0, MIN_PRESS_MS - (performance.now() - downAt));
      if (wait === 0) {
        onUp();
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        onUp();
      }, wait);
    },
    cancel: clear,
  };
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
  // LED RGB : les canaux sont aussi surveillés pour mesurer le rapport cyclique
  // (PWM) — sinon la LED clignoterait au rythme de l'échantillonnage.
  const rgbLeds = rgbLedBindings(editor.diagram);
  rgbLedTargets = new Map(rgbLeds.map((b) => [b.partId, { r: b.r, g: b.g, b: b.b }]));
  const sevenSegs = sevenSegmentBindings(editor.diagram);
  sevenSegTargets = new Map(sevenSegs.map((b) => [b.partId, b.segments]));
  engine.setPulseMonitors?.([
    ...servoBindings(editor.diagram).map((b) => b.mcuPin),
    ...buzzers.map((b) => b.mcuPin),
    ...rgbLeds.flatMap((b) => [b.r, b.g, b.b].filter((p): p is string => p !== null)),
    ...sevenSegs.flatMap((b) => Object.values(b.segments).filter((p): p is string => p !== null)),
  ]);

  // Capteurs ultrason : distance choisie EN SIMULATION par le curseur du
  // composant (borné par distancemin/distancemax de l'inspecteur). Chaque objet
  // sensor est muté en direct sur l'événement `input` du curseur — le moteur
  // relit `distanceCm` à chaque impulsion TRIG (même référence de tableau).
  const ultraSensors = ultrasonicBindings(editor.diagram).map((b) => {
    const part = editor.diagram.parts.find((p) => p.id === b.partId);
    const min = Number(part?.attrs?.distancemin ?? 2);
    const max = Number(part?.attrs?.distancemax ?? 400);
    const el = editor.elementOf(b.partId);
    // Distance de départ : valeur courante du composant, sinon milieu de la plage.
    const cur = el && Number.isFinite(Number(el.distance)) ? Number(el.distance) : (min + max) / 2;
    const sensor = { trig: b.trig, echo: b.echo, distanceCm: cur };
    if (el) {
      el.distance = cur; // synchronise le curseur avec la distance de départ
      const apply = () => {
        sensor.distanceCm = Number(el.distance ?? cur);
      };
      el.addEventListener('input', apply);
      inputRemovers.push(() => el.removeEventListener('input', apply));
    }
    return sensor;
  });
  engine.setUltrasonic?.(ultraSensors);

  // Claviers matriciels : une touche enfoncée relie sa ligne et sa colonne. On
  // suit les touches enfoncées via les événements de l'élément (button-press /
  // button-release) ; le moteur tire la colonne à LOW quand la ligne l'est.
  const keypads: KeypadConfig[] = [];
  for (const b of keypadBindings(editor.diagram)) {
    const el = editor.elementOf(b.partId);
    const pressed = new Set<string>();
    if (el) {
      // Maintien minimal par touche : un appui bref est prolongé pour être vu par
      // le balayage du firmware (sinon une touche pressée/relâchée dans la même
      // frame n'est jamais détectée).
      const downAt = new Map<string, number>();
      const releaseTimers = new Map<string, ReturnType<typeof setTimeout>>();
      // Verrouillage Ctrl+clic (comme le bouton poussoir) : la touche reste
      // enfoncée jusqu'au prochain clic normal. L'élément Wokwi du clavier ne gère
      // pas le Ctrl natif, on le reproduit ici. `ctrlAtPress` retient l'état Ctrl
      // au moment de l'appui (les événements de l'élément ne le portent pas).
      const locked = new Set<string>();
      const ctrlAtPress = new Map<string, boolean>();
      let ctrlHeld = false;
      const onPointerDown = (ev: PointerEvent): void => {
        ctrlHeld = ev.ctrlKey || ev.metaKey;
      };
      el.addEventListener('pointerdown', onPointerDown, true); // capture : avant le mousedown de l'élément
      // Affiche/retire le rendu « enfoncé » d'une touche verrouillée (par son texte).
      const setVisual = (keyText: string | undefined, on: boolean): void => {
        if (!keyText) return;
        const node = el.shadowRoot?.querySelector(`[data-key-name="${keyText.toUpperCase()}"]`);
        node?.classList.toggle('pressed', on);
      };
      const update = (e: Event, add: boolean): void => {
        const d = (e as CustomEvent).detail as { row?: number; column?: number; key?: string };
        if (typeof d?.row !== 'number' || typeof d?.column !== 'number') return;
        const key = `${d.row},${d.column}`;
        const tm = releaseTimers.get(key);
        if (tm) {
          clearTimeout(tm);
          releaseTimers.delete(key);
        }
        if (add) {
          ctrlAtPress.set(key, ctrlHeld);
          downAt.set(key, performance.now());
          pressed.add(key); // partagé par référence avec le moteur
          return;
        }
        // Relâchement.
        if (ctrlAtPress.get(key)) {
          // Cycle Ctrl+clic → bascule le verrou de la touche.
          if (locked.has(key)) {
            locked.delete(key);
            pressed.delete(key);
            setVisual(d.key, false);
          } else {
            locked.add(key);
            pressed.add(key);
            setVisual(d.key, true); // reste visuellement enfoncée
          }
          return;
        }
        if (locked.has(key)) {
          // Clic normal sur une touche verrouillée → la libère.
          locked.delete(key);
          pressed.delete(key);
          setVisual(d.key, false);
          return;
        }
        // Relâchement normal, avec maintien minimal.
        const wait = Math.max(0, MIN_PRESS_MS - (performance.now() - (downAt.get(key) ?? 0)));
        if (wait === 0) {
          pressed.delete(key);
        } else {
          releaseTimers.set(
            key,
            setTimeout(() => {
              pressed.delete(key);
              releaseTimers.delete(key);
            }, wait)
          );
        }
      };
      const onPress = (e: Event): void => update(e, true);
      const onRelease = (e: Event): void => update(e, false);
      el.addEventListener('button-press', onPress);
      el.addEventListener('button-release', onRelease);
      inputRemovers.push(() => {
        for (const tm of releaseTimers.values()) clearTimeout(tm);
        releaseTimers.clear();
        locked.clear();
        // Retire tout rendu « enfoncé » résiduel des touches verrouillées.
        el.shadowRoot?.querySelectorAll('.pressed').forEach((n) => n.classList.remove('pressed'));
        el.removeEventListener('pointerdown', onPointerDown, true);
        el.removeEventListener('button-press', onPress);
        el.removeEventListener('button-release', onRelease);
      });
    }
    keypads.push({ rows: b.rows, cols: b.cols, pressed });
  }
  engine.setKeypads?.(keypads);

  // Capteurs DHT22 (1-wire) : température/humidité réglées EN SIMULATION par les
  // deux curseurs du composant. On (re)pousse la liste au moteur à chaque
  // changement (`input`) pour un pilotage en direct.
  {
    const dhtBindings = dht22Bindings(editor.diagram);
    const dhtEls = dhtBindings.map((b) => {
      const el = editor.elementOf(b.partId);
      const part = editor.diagram.parts.find((p) => p.id === b.partId);
      if (el) {
        // Init depuis les attributs éventuels, sinon valeurs par défaut du composant.
        if (part?.attrs?.temperature) el.temperature = Number(part.attrs.temperature);
        if (part?.attrs?.humidity) el.humidity = Number(part.attrs.humidity);
      }
      return { pin: b.pin, el };
    });
    const pushDht = () =>
      engine?.setDht22?.(
        dhtEls.map(({ pin, el }) => ({
          pin,
          temperatureC: Number(el?.temperature ?? 22),
          humidity: Number(el?.humidity ?? 50),
        }))
      );
    pushDht();
    for (const { el } of dhtEls) {
      if (!el) continue;
      el.addEventListener('input', pushDht);
      inputRemovers.push(() => el.removeEventListener('input', pushDht));
    }
  }

  // Chaînes NeoPixel (WS2812) : broche DIN décodée par le moteur.
  const nps = neopixelBindings(editor.diagram);
  neopixelTargets = new Map(nps.map((b) => [b.partId, b.mcuPin]));
  engine.setNeopixels?.(nps.map((b) => ({ pin: b.mcuPin, count: b.count })));

  // Afficheurs LCD HD44780 en bus parallèle : RS/E/données décodés par le moteur.
  engine.setLcdParallel?.(
    lcdParallelBindings(editor.diagram).map((b) => ({
      id: b.partId,
      rs: b.rs,
      e: b.e,
      data: b.data,
      cols: b.cols,
      rows: b.rows,
    }))
  );

  for (const binding of buttonBindings(editor.diagram)) {
    const el = editor.elementOf(binding.partId);
    if (!el) continue;
    // L'entrée suit directement l'état enfoncé du bouton : appui = LOW, relâché
    // = HIGH (pull-up). Un clic simple est transitoire ; Ctrl+clic maintient le
    // bouton enfoncé (mode « sticky » natif de l'élément : aucun relâchement
    // n'est émis), ce qui permet de le laisser dans cet état pour déboguer.
    engine.setInput(binding.mcuPin, true); // au repos = pull-up (haut)
    // Appui prolongé d'au moins MIN_PRESS_MS : un clic bref reste vu par le firmware.
    const { press, release, cancel } = minHoldPress(
      () => engine?.setInput(binding.mcuPin, false),
      () => engine?.setInput(binding.mcuPin, true)
    );
    el.addEventListener('button-press', press);
    el.addEventListener('button-release', release);
    inputRemovers.push(() => {
      cancel();
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
      const { press, release, cancel } = minHoldPress(
        () => engine?.setInput(selPin, false),
        () => engine?.setInput(selPin, true)
      );
      el.addEventListener('button-press', press);
      el.addEventListener('button-release', release);
      inputRemovers.push(() => {
        cancel();
        el.removeEventListener('button-press', press);
        el.removeEventListener('button-release', release);
      });
    }
  }

  // Sources numériques :
  //   - inclinaison (tilt) : état piloté par le bouton de simulation (el.tilted),
  //     relu sur l'événement `input` ;
  //   - PIR : état = survol souris / Ctrl+clic (el.motion), relu à chaque frame ;
  //   - autres : état depuis l'attribut.
  motionTargets = [];
  for (const binding of digitalSourceBindings(editor.diagram)) {
    const part = editor.diagram.parts.find((p) => p.id === binding.partId);
    if (part?.type === 'tilt') {
      const el = editor.elementOf(binding.partId);
      const pin = binding.mcuPin;
      const apply = () => engine?.setInput(pin, Boolean(el?.tilted));
      apply();
      if (el) {
        el.addEventListener('input', apply);
        inputRemovers.push(() => el.removeEventListener('input', apply));
      }
    } else if (part?.type === 'pir') {
      const el = editor.elementOf(binding.partId);
      if (el) {
        engine.setInput(binding.mcuPin, Boolean(el.motion));
        motionTargets.push({ pin: binding.mcuPin, el, last: Boolean(el.motion) });
      }
    } else if (part && partDef(part.type).custom?.control?.type === 'switch') {
      // Composant personnalisé à interrupteur de simulation : état initial depuis
      // l'inspecteur, puis piloté en direct par l'interrupteur du composant.
      const el = editor.elementOf(binding.partId);
      const pin = binding.mcuPin;
      if (el) {
        el.switchOn = part.attrs?.state === '1';
        const apply = () => engine?.setInput(pin, Boolean(el.switchOn));
        apply();
        el.addEventListener('input', apply);
        inputRemovers.push(() => el.removeEventListener('input', apply));
      }
    } else {
      engine.setInput(binding.mcuPin, part?.attrs?.state === '1');
    }
  }
  pulseTargets = [];
  for (const binding of analogSourceBindings(editor.diagram)) {
    const part = editor.diagram.parts.find((p) => p.id === binding.partId);
    if (part?.type === 'heartbeat') {
      // Pouls : sortie dynamique (courbe cardiaque) générée dans la boucle de rendu.
      const el = editor.elementOf(binding.partId);
      if (el) {
        el.bpm = Number(part.attrs?.bpm ?? 72);
        pulseTargets.push({ pin: binding.mcuPin, el });
      }
      continue;
    }
    if (part?.type === 'ntc-temp') {
      // Température : tension NTC (analogLevel), pilotée par le curseur en direct.
      const el = editor.elementOf(binding.partId);
      const pin = binding.mcuPin;
      if (el) {
        el.temperature = Number(part.attrs?.temperature ?? 25);
        const apply = () => engine?.setAnalog(pin, Number(el.analogLevel ?? 0.5));
        apply();
        el.addEventListener('input', apply);
        inputRemovers.push(() => el.removeEventListener('input', apply));
      }
      continue;
    }
    const ctrl = part ? partDef(part.type).custom?.control : undefined;
    if (part && ctrl?.type === 'slider') {
      // Composant personnalisé à curseur de simulation : la caractéristique
      // (expression compilée une fois, variables = x + paramètres relus en
      // direct dans les attrs de l'inspecteur) donne la tension de sortie en
      // volts, normalisée par la tension de référence de la carte ; à défaut
      // d'expression, rampe linéaire min→max → 0→Vref.
      const el = editor.elementOf(binding.partId);
      const pin = binding.mcuPin;
      if (el) {
        const params = partDef(part.type).custom?.params ?? [];
        let fn: ReturnType<typeof compileExpr> | null = null;
        if (ctrl.expr) {
          try {
            fn = compileExpr(ctrl.expr, ['x', ...params.map((p) => p.name)]);
          } catch {
            fn = null; // expression invalide (ancien import) : repli linéaire
          }
        }
        const vref = boardFamily(board) === 'rp2040' ? 3.3 : 5;
        const apply = () => {
          const x = Number(el.controlValue ?? 0);
          let level: number;
          if (fn) {
            const vars: Record<string, number> = { x };
            for (const p of params) {
              vars[p.name] = Number(part.attrs?.[`${PARAM_ATTR_PREFIX}${p.name}`] ?? p.value);
            }
            level = Math.min(1, Math.max(0, fn(vars) / vref));
          } else {
            const min = ctrl.min ?? 0;
            const max = ctrl.max ?? 100;
            level = max > min ? Math.min(1, Math.max(0, (x - min) / (max - min))) : 0;
          }
          engine?.setAnalog(pin, level);
        };
        apply();
        el.addEventListener('input', apply);
        inputRemovers.push(() => el.removeEventListener('input', apply));
      }
      continue;
    }
    engine.setAnalog(binding.mcuPin, Number(part?.attrs?.value ?? 50) / 100);
  }

  // Capteurs à double sortie (flamme, gaz, son, lumière) : le curseur d'intensité
  // du composant pilote EN DIRECT AOUT (analogique, tension qui baisse quand
  // l'intensité monte) et DOUT (tout ou rien, actif quand intensité > sensibilité).
  for (const binding of aoDoSensorBindings(editor.diagram)) {
    const part = editor.diagram.parts.find((p) => p.id === binding.partId);
    const el = editor.elementOf(binding.partId);
    if (!el) continue;
    // Sensibilité (seuil) depuis l'inspecteur → propriété du composant.
    el.sensitivity = Number(part?.attrs?.sensitivity ?? 50);
    const { analogPin, digitalPin } = binding;
    const apply = () => {
      if (analogPin) engine?.setAnalog(analogPin, Number(el.analogLevel ?? 1));
      // DOUT actif-bas (modules KY) : détection → LOW.
      if (digitalPin) engine?.setInput(digitalPin, !el.detected);
    };
    apply();
    el.addEventListener('input', apply);
    inputRemovers.push(() => el.removeEventListener('input', apply));
  }

  // Résistances variables nues (LDR/CTN/CTP) : chaque entrée ADC reliée à leur
  // réseau résistif suit le pont diviseur réel, résistances adjointes comprises
  // (adcDividerLevels). La valeur courante vient du curseur du composant
  // (éclairement/température), relue à chaque mouvement ; les paramètres
  // (R1lx, γ, R25, B, tc…) viennent de l'inspecteur.
  const varResistors = editor.diagram.parts.filter((p) => VARIABLE_RESISTOR_TYPES.has(p.type));
  if (varResistors.length > 0) {
    const apply = () => {
      for (const b of adcDividerLevels(editor.diagram, liveVariableOhms)) {
        engine?.setAnalog(b.mcuPin, b.level);
      }
    };
    for (const part of varResistors) {
      const el = editor.elementOf(part.id);
      if (!el) continue;
      // Position de repos du curseur depuis l'inspecteur (comme la CTN capteur).
      if (part.type === 'ldr') el.lux = Number(part.attrs?.lux ?? 500);
      else el.temperature = Number(part.attrs?.temperature ?? 25);
      el.addEventListener('input', apply);
      inputRemovers.push(() => el.removeEventListener('input', apply));
    }
    apply();
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
    } else if (kind === 'i2c-oled' && (part.attrs?.pins ?? 'i2c') === 'i2c') {
      // pins=spi : câblé en SPI 4 fils, pas sur le bus I²C (traité plus bas, spiDeviceBindings).
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
  // `bind(el)` indispensable : la méthode extraite perdait son `this` → TypeError
  // silencieux (try/catch de refreshVisuals) → anneau/matrice jamais rafraîchis.
  const setPixel = (
    el.setPixel as ((a: number, b: number | Rgb, c?: Rgb) => void) | undefined
  )?.bind(el);
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
  if (pcaBindings.length === 0) return;
  // PCA9685 natif : sans alim de laboratoire ~5 V au courant suffisant sur le
  // bornier V+/GND.2, les SORTIES ne bougent pas (la puce répond toujours sur
  // I²C — VCC logique séparé, comme la vraie carte). Les anciens PCA importés
  // (composants personnalisés, sans bornier) restent toujours alimentés.
  const power = new Map(
    pca9685PowerState(editor.diagram, psuLiveVolts, liveVariableOhms).map((p) => [p.partId, p.ok])
  );
  for (const b of pcaBindings) {
    const dev = i2cDevices.get(b.partId);
    if (!(dev instanceof Pca9685Device)) continue;
    const powered = power.get(b.partId) ?? true;
    for (const c of b.channels) {
      const el = editor.elementOf(c.targetId);
      if (!el) continue;
      const duty = powered ? dev.channelDuty(c.ch) : 0;
      if (c.targetKind === 'servo') {
        // 50 Hz : impulsion = duty × 20 ms ; 1–2 ms → 0–180°.
        // Sans alimentation servo : pas d'impulsion → le bras ne bouge pas.
        if (powered) el.angle = Math.max(0, Math.min(180, (duty * 20000 - 1000) / 1000 * 180));
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
  // (les locales demanderaient l'analyse CFI DWARF). En MicroPython, pas de cette
  // restriction → en-tête omis.
  if (!runIsPython) {
    const hRow = debugVarsEl.insertRow();
    const hCell = hRow.insertCell();
    hCell.colSpan = 2;
    hCell.className = 'debug__cinfo';
    hCell.textContent = t('ℹ Only global variables are shown');
    hCell.title = t('In C/Arduino, declare a variable outside setup() and loop() (global) to inspect it here.');
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
  pauseBtn.title = paused ? t('Resume') : t('Pause - resume the simulation');
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
  // Le flux série passe par le traceur : les lignes de télémétrie Teleplot
  // (`>nom:valeur`) sont absorbées et tracées, le reste va à la console.
  engine.onSerial = (chunk) => {
    const rest = plotter.filterSerial(chunk);
    if (rest) appendSerial(rest);
  };
  engine.onDebugPause = renderDebugPause;
  // Sondes internes : toute tension posée sur une broche analogique (capteurs,
  // potentiomètres…) est tracée en volts — la Vref dépend de la famille de carte.
  {
    const vref = boardFamily(board) === 'rp2040' ? 3.3 : 5;
    const engineSetAnalog = engine.setAnalog.bind(engine);
    engine.setAnalog = (pin, fraction) => {
      engineSetAnalog(pin, fraction);
      plotter.probe(pin, Math.round(fraction * vref * 1000) / 1000);
    };
  }
  plotter.start(); // nouvelles courbes à chaque run (comme la console)
  // Pont réseau Pico W : le moteur publie les requêtes, l'hôte fait le vrai
  // fetch et renvoie la réponse (message 'netResponse').
  if (engine.onNetRequest !== undefined) {
    engine.onNetRequest = (req) => vscode.postMessage({ type: 'net', request: req });
  }
  engine.setSpeed(Number(speedSelect.value) || 1);
  engine.setBreakpoints?.(breakpoints);
  sevenSegLatch = new Map(); // nouveau run : les chiffres mémorisés repartent à zéro
  sevenSegStable = new Map();
  burnedLeds.clear(); // LED grillées « remplacées » à chaque nouveau lancement
  ledLumFactor.clear();
  buildI2cDevices();
  rebind();
  engine.start();
  startRenderLoop(); // rendu continu tant que le moteur tourne
  editor.setLocked(true); // schéma figé pendant la simulation
  showSimBanner(true); // bandeau permanent « Simulation en cours »
  useDebugAsInspector(true); // Variables à la place des Propriétés
  runBtn.disabled = true;
  stopBtn.disabled = false;
  const isPython = boardFamily(board) === 'rp2040' && picoProgram.kind === 'flash' && !!picoProgram.script;
  const isRepl = boardFamily(board) === 'rp2040' && picoProgram.kind === 'flash' && !picoProgram.script;
  runIsPython = isPython;
  setReplMode(isRepl);
  updateDebugButtons();
  setStatus(
    isPython
      ? t('Starting MicroPython… (a few seconds)')
      : isRepl
        ? t('REPL ready — type your commands in the console')
        : t('Running…')
  );
}

function stopRun(): void {
  buzzerAudio.stopAll(); // coupe les sons de buzzer
  for (const remove of inputRemovers) remove();
  inputRemovers = [];
  engine?.dispose();
  engine = null;
  setReplMode(false);
  plotter.stop(); // courbes figées mais conservées pour analyse
  stopRenderLoop(); // fin du rendu continu
  editor.setLocked(false); // édition du schéma de nouveau possible
  showSimBanner(false); // masque le bandeau de simulation
  // Arrêt (ou nouveau lancement, qui commence par un stopRun) : on repart d'un
  // état propre — console vidée et composants réinitialisés (LED éteintes,
  // afficheurs vides…). Idem au (re)chargement d'un programme Python.
  clearSerial();
  editor.resetVisuals();
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
  vscode.setState({ diagram: editor.serialize(), board, labelsMode } satisfies PersistedState);
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
  if (!hasCodeFile) blinkCodeFileBtn(); // aucun fichier choisi : avertissement clignotant
  setStatus(t('Compiling…'));
  vscode.postMessage({ type: 'compile', board, onlyIfChanged: programLoaded });
}

/**
 * Bouton REPL : démarre le firmware MicroPython seul (aucun script à
 * injecter) — le raw REPL n'est jamais engagé côté moteur, le moniteur série
 * devient un vrai REPL interactif où l'on tape directement des commandes.
 */
function requestRepl(): void {
  buzzerAudio.resume();
  setStatus(t('Starting REPL…'));
  vscode.postMessage({ type: 'startRepl', board });
}

// --- Barre d'outils -----------------------------------------------------------
runBtn.addEventListener('click', requestRun);
stopBtn.addEventListener('click', stopRun);
replBtn.addEventListener('click', requestRepl);
// Tout réinitialiser : arrête la simulation et remet les composants à zéro.
resetSimBtn.addEventListener('click', () => {
  stopRun(); // vide déjà la console et réinitialise les composants
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
clearBtn.addEventListener('click', clearSerial);
// Fermer le moniteur série (croix) / le rouvrir (icône écran de la barre).
closeSerialBtn.addEventListener('click', () => setSerialVisible(false));
toggleSerialBtn.addEventListener('click', () => setSerialVisible(!serialVisible));
loadBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'loadWorkspace', board });
});
exportBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'exportSvg', svg: editor.exportSvg() });
});
saveProjectBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'saveProject', diagram: editor.serialize(), board });
});
// Enregistrer sous : boîte de dialogue systématique côté hôte.
saveProjectAsBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'saveProjectAs', diagram: editor.serialize(), board });
});
// Ctrl+S / Cmd+S dans l'atelier : Enregistrer (même chemin que le bouton —
// écriture directe si un .projix est connu, boîte sinon). preventDefault pour
// que VS Code ne déclenche pas sa propre commande de sauvegarde d'éditeur.
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    vscode.postMessage({ type: 'saveProject', diagram: editor.serialize(), board });
  }
});
// Nouveau projet : vide le schéma (annulable Ctrl+Z) et oublie le .projix
// courant côté hôte (le prochain enregistrement demandera un nouveau nom).
newProjectBtn.addEventListener('click', () => {
  if (editor.isLocked()) return; // simulation en cours : pas d'édition
  editor.clear();
  vscode.postMessage({ type: 'newProject' });
  setStatus(t('New project'));
});
openProjectBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'openProject' });
});
// Ouvre la page d'aide (commande kablix.openHelp côté hôte).
helpBtn.addEventListener('click', () => {
  vscode.postMessage({ type: 'help' });
});
// Clic sur « Kablix vX » → dépôt GitHub.
document.getElementById('brand')?.addEventListener('click', () => {
  vscode.postMessage({ type: 'openRepo' });
});

// --- Préférences d'interface (noms visibles, tri de palette, derniers utilisés)
// Bouton « Noms » : menu à deux cases exclusives — « Tous les noms » /
// « Uniquement les composants sélectionnés » ; aucune cochée = aucun nom.
// Défaut : sélection seule (comportement historique).
let labelsMode: LabelsMode = 'selected';
let paletteState: PaletteState = { sort: 'category', recents: [], showRecents: true, collapsed: [] };
let paletteWidth = 0; // 0 = largeur par défaut (CSS)
let inspectorWidth = 0;

function applyShowLabels(): void {
  canvas.classList.toggle('canvas--show-labels', labelsMode === 'all');
  canvas.classList.toggle('canvas--labels-sel', labelsMode === 'selected');
  labelsBtn.classList.toggle('primary', labelsMode !== 'none');
}
applyShowLabels();

/** Héritage : l'ancien booléen showLabels devient un mode. */
function legacyLabelsMode(showLabels: boolean): LabelsMode {
  return showLabels ? 'all' : 'selected';
}

function applyPanelWidths(): void {
  if (paletteWidth) palette.style.flex = `0 0 ${paletteWidth}px`;
  if (inspectorWidth) inspector.style.flex = `0 0 ${inspectorWidth}px`;
}

function saveUiState(): void {
  vscode.postMessage({
    type: 'saveUiState',
    state: { ...paletteState, labelsMode, paletteWidth, inspectorWidth, serialVisible, plotterVisible: plotterUserPref },
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

// Menu du bouton « Noms » : deux cases EXCLUSIVES mais toutes deux décochables
// (aucune cochée = aucun nom affiché). Fermé par un clic ailleurs ou re-clic.
let labelsMenu: HTMLDivElement | null = null;
let labelsMenuOff: (() => void) | null = null;

function closeLabelsMenu(): void {
  labelsMenu?.remove();
  labelsMenu = null;
  labelsMenuOff?.();
  labelsMenuOff = null;
}

function openLabelsMenu(): void {
  const menu = document.createElement('div');
  menu.className = 'labels-menu';
  const mkRow = (label: string, mode: Exclude<LabelsMode, 'none'>): HTMLLabelElement => {
    const row = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = labelsMode === mode;
    box.addEventListener('change', () => {
      // Cocher l'une décoche l'autre ; décocher la case active → aucun nom.
      labelsMode = box.checked ? mode : 'none';
      for (const other of menu.querySelectorAll('input')) {
        (other as HTMLInputElement).checked = false;
      }
      box.checked = labelsMode === mode;
      applyShowLabels();
      saveUiState();
      persistState();
    });
    row.appendChild(box);
    row.appendChild(document.createTextNode(label));
    return row;
  };
  menu.appendChild(mkRow(t('All names'), 'all'));
  menu.appendChild(mkRow(t('Selected parts only'), 'selected'));
  document.body.appendChild(menu);
  // Sous le bouton, aligné à gauche (position fixe : la barre ne défile pas).
  const r = labelsBtn.getBoundingClientRect();
  menu.style.left = `${Math.round(r.left)}px`;
  menu.style.top = `${Math.round(r.bottom + 4)}px`;
  labelsMenu = menu;
  // Clic hors du menu : fermeture (posé après le clic courant).
  const onDown = (e: PointerEvent): void => {
    if (e.target instanceof Node && (menu.contains(e.target) || labelsBtn.contains(e.target))) return;
    closeLabelsMenu();
  };
  window.addEventListener('pointerdown', onDown);
  labelsMenuOff = () => window.removeEventListener('pointerdown', onDown);
}

labelsBtn.addEventListener('click', () => {
  if (labelsMenu) closeLabelsMenu();
  else openLabelsMenu();
});

editor.onPaletteStateChange = (state) => {
  paletteState = state;
  saveUiState();
};

// Persistance des composants personnalisés (stockés côté extension).
editor.onCustomPartsChange = (parts: CustomPartData[]) => {
  vscode.postMessage({ type: 'saveCustomParts', parts });
};
// Persistance des préréglages de modèles de simulation importés (.json).
editor.onSimModelsChange = (models) => {
  vscode.postMessage({ type: 'saveSimModels', models });
};
editor.onOpenExternal = (url: string) => {
  vscode.postMessage({ type: 'openExternal', url });
};
editor.onComponentHelp = (part: string) => {
  vscode.postMessage({ type: 'componentHelp', part });
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
  updateSerialTitle();
  vscode.postMessage({ type: 'board', board });
  programLoaded = false; // le programme compilé était lié à l'autre carte
  stopRun();
  persistState();
  setStatus(t('Board: {0}', boardLabel(board)));
};
boardSelect.addEventListener('change', () => {
  board = isBoardId(boardSelect.value) ? boardSelect.value : 'uno';
  updateSerialTitle();
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
// Un double-clic déclenche d'abord 2 événements « click » avant le « dblclick » :
// sans délai, le 1er click ouvrirait déjà la boîte de dialogue « choisir un
// fichier » avant que le double-clic ait pu être détecté. On retarde donc
// pickCodeFile le temps de la fenêtre de détection du double-clic (délai
// standard navigateur) et on l'annule si un dblclick survient entre-temps.
let codeFileClickTimer: ReturnType<typeof setTimeout> | null = null;
codeFileBtn.addEventListener('click', () => {
  if (codeFileClickTimer !== null) clearTimeout(codeFileClickTimer);
  codeFileClickTimer = setTimeout(() => {
    codeFileClickTimer = null;
    vscode.postMessage({ type: 'pickCodeFile' });
  }, 250);
});
// Double-clic : ouvre le fichier dans l'éditeur (volet de gauche) au lieu d'en
// choisir un autre.
codeFileBtn.addEventListener('dblclick', (e) => {
  e.preventDefault();
  if (codeFileClickTimer !== null) {
    clearTimeout(codeFileClickTimer);
    codeFileClickTimer = null;
  }
  vscode.postMessage({ type: 'openCodeFile' });
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
          updateSerialTitle();
          vscode.postMessage({ type: 'board', board });
        }
        if (restoredState.labelsMode === 'all' || restoredState.labelsMode === 'selected' || restoredState.labelsMode === 'none') {
          labelsMode = restoredState.labelsMode;
          applyShowLabels();
        } else if (typeof restoredState.showLabels === 'boolean') {
          labelsMode = legacyLabelsMode(restoredState.showLabels);
          applyShowLabels();
        }
      }
      restoredState = undefined;
      break;
    case 'simModels':
      // Préréglages de modèles de simulation importés (créateur de composants).
      editor.loadSimModels((msg.models as Parameters<typeof editor.loadSimModels>[0]) ?? []);
      break;
    case 'codeFile': {
      // Nom du fichier de code à exécuter / déboguer, envoyé par l'extension.
      // `missing` : le fichier référencé par le .projix est introuvable sur ce
      // poste — nom affiché mais chip en avertissement, aucun fichier actif.
      const name = typeof msg.name === 'string' ? msg.name : null;
      const missing = msg.missing === true;
      hasCodeFile = name !== null && !missing;
      codeFileBtn.textContent = name ? `📄 ${name}` : `📄 ${t('No file')}`;
      // Aucun fichier choisi (ou introuvable) : bouton en jaune sur rouge.
      codeFileBtn.classList.toggle('canvas-controls__file--nofile', !hasCodeFile);
      codeFileBtn.title = missing
        ? t('Code file {0} not found on this computer — click to choose the file to run', name ?? '')
        : name
          ? t('Code file: {0} — click to change, double-click to open', name)
          : t('Code file to run / debug — click to change, double-click to open');
      break;
    }
    case 'projectName': {
      // Nom du projet courant (sans chemin), affiché à côté du bouton d'aide.
      const name = typeof msg.name === 'string' ? msg.name : null;
      projectNameEl.textContent = name ? `— ${name}` : '';
      projectNameEl.title = name ? t('Current project: {0}', name) : t('Current project');
      break;
    }
    case 'requestSaveProject':
      // Demande de la commande : on renvoie le schéma pour l'enregistrement.
      vscode.postMessage({ type: 'saveProject', diagram: editor.serialize(), board });
      break;
    case 'projectSaved':
      // Confirmation d'enregistrement du .projix : message temporaire visible.
      flashStatus(t('Project saved'));
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
      // Recharge un projet .projix : coupe d'abord une simulation en cours (sinon
      // le nouveau schéma se recâble sur un moteur qui tourne encore pour l'ancien).
      if (engine) stopRun();
      // Composants perso, schéma puis carte.
      if (Array.isArray(msg.customParts)) {
        editor.loadCustomParts(msg.customParts as CustomPartData[]);
      }
      editor.loadDiagram(msg.diagram as Parameters<typeof editor.loadDiagram>[0]);
      if (isBoardId(msg.board)) {
        switchBoard(msg.board);
        boardSelect.value = msg.board;
      }
      // Ouverture d'un projet : recentre et ajuste la vue sur tout le schéma
      // (comme le bouton « recentrer »). Différé d'une frame : les corps des
      // composants n'ont leur taille réelle qu'après le rendu.
      requestAnimationFrame(() => editor.fitView());
      // Statut neutre après chargement (clé déjà traduite dans i18n).
      setStatus(t('Ready'));
      break;
    case 'uiState': {
      const state = (msg.state ?? {}) as Partial<PaletteState> & {
        showLabels?: boolean;
        labelsMode?: LabelsMode;
        paletteWidth?: number;
        inspectorWidth?: number;
      };
      if (state.labelsMode === 'all' || state.labelsMode === 'selected' || state.labelsMode === 'none') {
        labelsMode = state.labelsMode;
      } else if (typeof state.showLabels === 'boolean') {
        labelsMode = legacyLabelsMode(state.showLabels); // préférence d'avant v2026.7.108
      }
      applyShowLabels();
      if (typeof state.paletteWidth === 'number') paletteWidth = state.paletteWidth;
      if (typeof state.inspectorWidth === 'number') inspectorWidth = state.inspectorWidth;
      applyPanelWidths();
      // Visibilité du moniteur série (défaut : affiché) restaurée sans re-persister.
      if (typeof (state as { serialVisible?: boolean }).serialVisible === 'boolean') {
        setSerialVisible((state as { serialVisible?: boolean }).serialVisible!, false);
      }
      // Traceur : seule la PRÉFÉRENCE est restaurée — le panneau reste fermé au
      // chargement et s'ouvrira à la première donnée (sauf refus mémorisé).
      if (typeof (state as { plotterVisible?: boolean }).plotterVisible === 'boolean') {
        plotterUserPref = (state as { plotterVisible?: boolean }).plotterVisible;
      }
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
  updateSerialTitle();
  // L'hôte doit connaître la carte courante, et l'état persisté de la webview
  // aussi (sinon un déplacement d'onglet restaurait l'ancienne carte). Pas de
  // remise à zéro de programLoaded ici : ce chemin est aussi celui d'un
  // programme fraîchement reçu (ensureFamilyForPayload), et l'hôte recompile de
  // toute façon quand la carte de la dernière compilation diffère.
  vscode.postMessage({ type: 'board', board });
  stopRun();
  persistState();
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
updateSerialTitle(); // titre initial (Moniteur série / Console selon la carte)
setStatus(t('Ready'));
vscode.postMessage({ type: 'ready' });
