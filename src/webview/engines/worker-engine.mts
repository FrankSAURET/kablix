/**
 * Façade `SimEngine` d'un moteur qui tourne dans un Web Worker.
 *
 * Vue de `sim.mts`, cette classe est un moteur ordinaire : mêmes méthodes, mêmes
 * lectures SYNCHRONES. En dessous, les ordres partent en `postMessage` et les
 * lectures répondent depuis le dernier instantané reçu (cf. `worker-protocol.mts`)
 * — jamais en attendant le worker, ce qui rendrait `readDigital` asynchrone et
 * obligerait à réécrire les 28 points d'appel de `sim.mts`.
 *
 * Deux états ne traversent pas la frontière et sont traités ici, côté page :
 * l'échantillonneur analogique (une fonction) et les touches enfoncées (un `Set`
 * partagé par référence). Ils sont relevés à la cadence de l'instantané et poussés
 * au worker — cf. les commentaires de `pump()`.
 */

import type { AnalogWave } from './analog-waves.mjs';
import type { BusDeviceSpec, BusDevices, I2cDevice, SpiDevice } from './i2c-devices.mjs';
import type { PicoProgram } from './pico.mjs';
import type { SevenSegMuxSpec } from './sevenseg.mjs';
import type {
  Breakpoint,
  DebugPauseState,
  Dht22Sensor,
  KeypadConfig,
  LcdParallelConfig,
  NetRequest,
  NetResponse,
  SimEngine,
  UltrasonicSensor,
} from './types.mjs';
import {
  DRIVE_NAMES,
  SNAPSHOT_PERIOD_MS,
  emptySnapshot,
  type FromWorker,
  type PinSnapshot,
  type ScreenUpdate,
  type ToWorker,
  type WorkerBoard,
} from './worker-protocol.mjs';

/**
 * Broches publiées dans l'instantané. `readDigital` peut porter sur n'importe
 * laquelle : on les relève TOUTES plutôt que de deviner celles qui sont câblées —
 * 20 broches pour une Uno, 70 pour une Mega, soit quelques centaines d'octets par
 * publication.
 */
function boardPins(board: WorkerBoard): string[] {
  // RP2040 / RP2350 : GP0..GP29 (les entrées analogiques GP26..GP28 en font
  // partie, et la LED embarquée d'un Pico W est redirigée sur GP25 par la
  // rustine `machine`).
  if (board === 'pico' || board === 'pico2') {
    const pins: string[] = [];
    for (let i = 0; i < 30; i++) pins.push(`GP${i}`);
    return pins;
  }
  const digital = board === 'mega' ? 54 : 14;
  const analog = board === 'mega' ? 16 : 6;
  const pins: string[] = [];
  for (let i = 0; i < digital; i++) pins.push(String(i));
  for (let i = 0; i < analog; i++) pins.push(`A${i}`);
  return pins;
}

/**
 * Clone le programme pour l'envoi : l'ORIGINAL reste à la page (relancer la
 * simulation le relit), et la copie part par transfert — un firmware MicroPython
 * pèse près d'un mégaoctet, le recopier à chaque lancement se verrait.
 */
function cloneProgram(
  program: Uint16Array | PicoProgram
): { program: Uint16Array | PicoProgram; transfer: Transferable[] } {
  if (program instanceof Uint16Array) {
    const copy = program.slice();
    return { program: copy, transfer: [copy.buffer] };
  }
  if (program.kind === 'ram') {
    const image = program.image.slice();
    return { program: { ...program, image }, transfer: [image.buffer] };
  }
  const segments = program.segments.map((s) => ({ addr: s.addr, data: s.data.slice() }));
  return {
    program: { ...program, segments },
    transfer: segments.map((s) => s.data.buffer),
  };
}

/**
 * URL blob du bundle du worker, préparée à l'avance. Un `new Worker(uri)` direct
 * sur l'URI de la webview est refusé (origine `vscode-webview://` différente de
 * celle de la page) ; le blob, lui, appartient à la page — d'où `worker-src blob:`
 * dans la CSP.
 */
let blobUrl: string | null = null;

/**
 * Le bundle a été récupéré ET a répondu au ping. Tant que ce n'est pas prouvé, la
 * simulation reste sur le fil principal : mieux vaut une page moins fluide qu'une
 * simulation muette.
 */
let workerProven = false;

/** Délai laissé au worker jetable pour répondre au ping, au chargement. */
const PROBE_TIMEOUT_MS = 3000;

/**
 * Monte un worker JETABLE et attend son `pong`. Récupérer le bundle ne suffit
 * pas : `fetch` ne rejette PAS sur un 404 — il rend le corps de la page d'erreur,
 * dont on faisait un blob, dont on faisait un worker qui mourait à la première
 * ligne. Sans `onerror` (absent jusqu'ici) la page n'en savait rien, croyait tenir
 * un moteur, et la simulation restait figée à 0 ms (v2026.8.55, bundle absent du
 * .vsix). Le ping ferme cette porte : on ne se fie qu'à un worker qui a répondu.
 */
function probeWorker(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch {
      resolve(false);
      return;
    }
    let fini = false;
    const finir = (ok: boolean): void => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      worker.terminate();
      resolve(ok);
    };
    const minuteur = setTimeout(() => finir(false), PROBE_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<FromWorker>) => finir(e.data?.t === 'pong');
    worker.onerror = () => finir(false);
    worker.postMessage({ t: 'ping' } satisfies ToWorker);
  });
}

/**
 * Récupère le bundle du worker et vérifie qu'il DÉMARRE. Appelé au chargement de
 * la page, PAS au démarrage de la simulation : `startRun()` est synchrone et le
 * reste du code compte sur un moteur disponible dans la foulée. Un `fetch` de
 * fichier local plus un aller-retour de message prennent quelques millisecondes,
 * bien avant le premier clic sur « Compiler ».
 */
export async function preloadWorker(url: string): Promise<void> {
  if (blobUrl) return;
  try {
    const reponse = await fetch(url);
    // Un bundle absent ne fait pas rejeter `fetch` : il rend un 404 (et parfois
    // une page d'erreur en 200). Du HTML pris pour du JavaScript donne un worker
    // mort-né — on refuse tout ce qui ne ressemble pas à un script.
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const source = await reponse.text();
    if (source.length < 1024 || /^\s*</.test(source)) throw new Error('ce n’est pas un bundle');
    blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    workerProven = await probeWorker(blobUrl);
    if (!workerProven) throw new Error('le worker ne démarre pas');
  } catch (err) {
    // Bundle absent ou inutilisable : la simulation retombe sur le fil principal,
    // exactement comme si le réglage était décoché. Dit une fois, dans la console
    // de la webview — c'est un repli, pas une erreur pour l'utilisateur.
    console.warn('[kablix] fil de simulation indisponible, repli sur le fil principal :', err);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    workerProven = false;
  }
}

/** Vrai si un moteur peut être monté dans un worker tout de suite. */
export function workerReady(): boolean {
  return blobUrl !== null && workerProven;
}

export class WorkerEngine implements SimEngine {
  onUpdate: (() => void) | null = null;
  onSerial: ((chunk: string) => void) | null = null;
  onDebugPause: ((state: DebugPauseState) => void) | null = null;
  /** MicroPython : le script de l'élève démarre pour de bon. */
  onRunning: (() => void) | null = null;
  /** MicroPython : bascule vers le script instrumenté ('start' puis 'end'). */
  onDebugRestart: ((phase: 'start' | 'end') => void) | null = null;
  /** Pico W : requête HTTP à faire faire par l'hôte. */
  onNetRequest: ((req: NetRequest) => void) | null = null;
  /**
   * Le fil de simulation est mort en cours de route. La page doit relancer sur le
   * fil principal : une simulation muette est pire qu'une page moins fluide.
   */
  onFailure: (() => void) | null = null;
  /**
   * Pas à pas. Posé à la CRÉATION et non à la réception du premier instantané :
   * `sim.mts` grise son bouton (`!engine.step`) dès le lancement. Un Pico sans
   * script MicroPython n'en a pas — comme `pico.mts`, qui ne définit `step` que
   * dans ce cas.
   */
  step?: () => void;

  private worker: Worker;
  private pins: string[];
  /** Position de chaque broche dans les vues typées de l'instantané. */
  private index = new Map<string, number>();
  private snap: PinSnapshot;
  /**
   * Miroir local de l'état de pause. `sim.mts` lit `engine.paused` DANS LA FOULÉE
   * de `pause()` (pour griser les boutons) : attendre l'instantané ferait clignoter
   * la barre d'outils.
   */
  private pausedMirror = false;
  private disposed = false;
  /** Échantillonneurs analogiques posés par la page, par broche. */
  private samplers = new Map<string, () => number>();
  /** Claviers déclarés : leurs `Set` sont relus ici, la référence ne traverse pas. */
  private keypads: KeypadConfig[] = [];
  /**
   * Jumeaux des périphériques de bus, côté page. Ce sont les objets que
   * l'affichage lit (texte du LCD, image de l'OLED…) ; ils ne décodent rien, on y
   * recopie l'état publié par le worker.
   */
  private mirrors: BusDevices | null = null;
  /**
   * Latch des afficheurs 7 segments, tenu à jour d'instantané en instantané. Le
   * worker ne publie que ce qui change : sans mémoire ici, un afficheur immobile
   * s'éteindrait dès l'instantané suivant.
   */
  private latches = new Map<string, number[]>();
  /** Univers DMX512 par broche TX, publiés hors instantané (cf. `dmx`). */
  private dmx = new Map<string, Uint8Array>();
  /** Dernière liste de touches envoyée, pour n'écrire que sur changement. */
  private lastPressed = '';
  private pumpTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(worker: Worker, board: WorkerBoard, stepable: boolean) {
    this.worker = worker;
    this.pins = boardPins(board);
    this.pins.forEach((p, i) => this.index.set(p, i));
    this.snap = emptySnapshot(this.pins.length);
    if (stepable) this.step = () => this.post({ t: 'step' });
    worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
    // Un worker qui meurt le fait EN SILENCE si personne n'écoute : c'est ce qui
    // laissait la simulation figée à 0 ms. On coupe le fil pour de bon (les
    // lancements suivants repartent sur le fil principal) et on prévient la page.
    worker.onerror = (e: ErrorEvent | Event) => {
      workerProven = false;
      console.error(
        '[kablix] fil de simulation interrompu :',
        (e as ErrorEvent).message ?? e.type
      );
      this.onFailure?.();
    };
  }

  /**
   * Monte un moteur dans un worker. Rend `null` si le bundle n'a pas été préchargé
   * ou si le worker refuse de démarrer : l'appelant retombe alors sur le moteur du
   * fil principal, plutôt que de laisser la simulation muette.
   */
  static create(
    board: WorkerBoard,
    program: Uint16Array | PicoProgram,
    debugInfo: unknown
  ): WorkerEngine | null {
    if (!blobUrl) return null;
    let worker: Worker;
    try {
      worker = new Worker(blobUrl);
    } catch {
      return null;
    }
    // Le pas à pas AVR est toujours là ; côté Pico il n'existe qu'en mode script
    // MicroPython (une image bare-metal n'a pas de lignes à suivre).
    const stepable =
      program instanceof Uint16Array || (program.kind === 'flash' && !!program.script);
    const engine = new WorkerEngine(worker, board, stepable);
    const { program: copy, transfer } = cloneProgram(program);
    engine.post({ t: 'init', board, program: copy, debugInfo, pins: engine.pins }, transfer);
    return engine;
  }

  private post(msg: ToWorker, transfer?: Transferable[]): void {
    if (this.disposed) return;
    this.worker.postMessage(msg, transfer ?? []);
  }

  private receive(msg: FromWorker): void {
    switch (msg.t) {
      case 'snapshot':
        // Un instantané plus ancien que celui déjà en main (messages réordonnés
        // sous charge) ferait reculer l'affichage : on le jette.
        if (msg.snap.seq < this.snap.seq) return;
        this.snap = msg.snap;
        // Le latch n'est publié que lorsqu'il CHANGE : ce qui n'est pas dans
        // l'instantané garde sa valeur, sinon un afficheur figé s'éteindrait.
        for (const [id, v] of Object.entries(msg.snap.sevenSeg)) {
          this.latches.set(id, Array.from(v));
        }
        this.pausedMirror = msg.snap.paused;
        this.onUpdate?.();
        return;
      case 'screens':
        this.applyScreens(msg.screens);
        return;
      case 'serial':
        this.onSerial?.(msg.chunk);
        return;
      case 'dmx':
        // Publié seulement quand un canal change : ce qui n'arrive pas garde sa
        // valeur (une lampe immobile ne doit pas s'éteindre entre deux trames).
        this.dmx.set(msg.pin, msg.data);
        return;
      case 'debugPause':
        this.pausedMirror = true;
        this.onDebugPause?.(msg.state as DebugPauseState);
        return;
      case 'scriptStarted':
        this.onRunning?.();
        return;
      case 'debugRestart':
        this.onDebugRestart?.(msg.phase);
        return;
      case 'netRequest':
        this.onNetRequest?.(msg.req as NetRequest);
        return;
      case 'error':
        console.error('[kablix] moteur worker :', msg.message);
        return;
      default:
        return;
    }
  }

  /**
   * Recopie l'état publié des écrans dans les jumeaux de la page. Le message ne
   * porte que ce qui a changé : ce qui n'y figure pas garde sa valeur, sans être
   * réécrit. L'affichage relit ces objets à chaque frame, comme si le moteur
   * tournait ici.
   */
  private applyScreens(up: ScreenUpdate): void {
    const m = this.mirrors;
    if (!m) return;
    for (const [id, lines] of Object.entries(up.lcd)) m.lcd.get(id)?.applyText(lines);
    for (const [id, duties] of Object.entries(up.pca)) m.pca.get(id)?.applyDuties(duties);
    for (const [id, buf] of Object.entries(up.oled)) m.oled.get(id)?.applyBuffer(buf);
    for (const [id, r] of Object.entries(up.tft)) {
      m.tft.get(id)?.applyRegion(r.x, r.y, r.w, r.h, r.data);
    }
  }

  /**
   * Relève, à la cadence de l'instantané, les états que le worker ne peut pas lire
   * lui-même :
   *  - les TOUCHES enfoncées, jusqu'ici un `Set` partagé par référence avec l'UI ;
   *  - un éventuel ÉCHANTILLONNEUR analogique posé en fonction. Les deux sources
   *    calculées du simulateur (charge d'un condensateur, capteur de pouls) passent
   *    désormais par `setAnalogWaves` et sont évaluées DANS le worker à l'instant
   *    exact de la conversion ; ce relevé périodique ne reste que comme repli pour
   *    une fonction qu'on ne saurait pas décrire.
   */
  private pump(): void {
    for (const [pin, sample] of this.samplers) {
      this.post({ t: 'setAnalog', pin, fraction: Math.max(0, Math.min(1, sample())) });
    }
    if (this.keypads.length > 0) {
      const pressed: string[] = [];
      this.keypads.forEach((k, i) => k.pressed.forEach((key) => pressed.push(`${i}:${key}`)));
      const flat = pressed.join('|');
      if (flat !== this.lastPressed) {
        this.lastPressed = flat;
        this.post({ t: 'keypadPressed', pressed });
      }
    }
  }

  private startPump(): void {
    if (this.pumpTimer !== null) return;
    this.pumpTimer = setInterval(() => this.pump(), SNAPSHOT_PERIOD_MS);
  }

  private stopPump(): void {
    if (this.pumpTimer === null) return;
    clearInterval(this.pumpTimer);
    this.pumpTimer = null;
  }

  // --- Pilotage ---------------------------------------------------------------

  start(): void {
    this.post({ t: 'start' });
    this.startPump();
  }

  stop(): void {
    this.post({ t: 'stop' });
    this.stopPump();
  }

  dispose(): void {
    this.stopPump();
    this.post({ t: 'dispose' });
    this.disposed = true;
    this.worker.terminate();
  }

  pause(): void {
    this.pausedMirror = true;
    this.post({ t: 'pause' });
  }

  resume(): void {
    this.pausedMirror = false;
    this.post({ t: 'resume' });
  }

  setSpeed(fraction: number): void {
    this.post({ t: 'setSpeed', fraction });
  }

  setBreakpoints(breakpoints: Breakpoint[]): void {
    this.post({ t: 'setBreakpoints', breakpoints });
  }

  get paused(): boolean {
    return this.pausedMirror;
  }

  // --- Lectures (depuis le dernier instantané) --------------------------------

  /**
   * Position d'une broche dans l'instantané. Le RP2040 se nomme des deux façons
   * dans le reste du code (`GP12` côté schéma, `12` côté moteur, cf. `gpioIndex`
   * de `pico.mts`) : les deux écritures désignent ici la même broche.
   */
  private slot(name: string): number {
    const i = this.index.get(name);
    if (i !== undefined) return i;
    const alt = name.startsWith('GP') ? name.slice(2) : `GP${name}`;
    return this.index.get(alt) ?? -1;
  }

  readDigital(name: string): boolean {
    const i = this.slot(name);
    return i >= 0 && this.snap.digital[i] === 1;
  }

  readPinDrive(name: string): 'high' | 'low' | 'pullup' | 'pulldown' | 'hiz' {
    const i = this.slot(name);
    return i < 0 ? 'hiz' : DRIVE_NAMES[this.snap.drive[i]] ?? 'hiz';
  }

  readPulseUs(name: string): number {
    const i = this.slot(name);
    return i < 0 ? 0 : this.snap.pulseUs[i];
  }

  readPwmDuty(name: string): number {
    const i = this.slot(name);
    return i < 0 ? 0 : this.snap.pwmDuty[i];
  }

  pulseActive(name: string): boolean {
    const i = this.slot(name);
    return i >= 0 && this.snap.pulseActive[i] === 1;
  }

  /**
   * Couleurs de la chaîne WS2812, composantes de 0 à 1 — MÊME ÉCHELLE que les
   * moteurs qui tournent dans la page (`AvrEngine`, `PicoEngine`) : c'est celle
   * qu'attendent les éléments NeoPixel. L'instantané, lui, les transporte en
   * octets empaquetés (0xRRGGBB) pour ne pas sérialiser trois champs par LED.
   */
  readNeopixel(pin: string): Array<{ r: number; g: number; b: number }> {
    return (this.snap.neopixel[pin] ?? []).map((c) => ({
      r: ((c >> 16) & 0xff) / 255,
      g: ((c >> 8) & 0xff) / 255,
      b: (c & 0xff) / 255,
    }));
  }

  readLcdParallel(id: string): string[] {
    return this.snap.lcd[id] ?? [];
  }

  simulatedMs(): number {
    return this.snap.simulatedMs;
  }

  /** Heure du worker à la relève : c'est elle qui date `simulatedMs()`. */
  wallClockMs(): number {
    return this.snap.wallMs;
  }

  busyMs(): number {
    return this.snap.busyMs;
  }

  lagMs(): number {
    return this.snap.lagMs;
  }

  // --- Entrées ----------------------------------------------------------------

  setInput(name: string, high: boolean): void {
    this.post({ t: 'setInput', pin: name, high });
  }

  setAnalog(name: string, fraction: number): void {
    this.post({ t: 'setAnalog', pin: name, fraction });
  }

  setAnalogSampler(name: string, sample: (() => number) | null): void {
    if (sample) this.samplers.set(name, sample);
    else this.samplers.delete(name);
  }

  setAnalogWaves(waves: AnalogWave[]): void {
    this.post({ t: 'setAnalogWaves', waves });
  }

  /**
   * Périphériques de bus : la DESCRIPTION part au worker, qui fabrique les vrais et
   * les branche au moteur ; les objets reçus ici restent à la page et servent de
   * jumeaux pour l'affichage (cf. `applyScreens`). L'objet lui-même ne peut pas
   * traverser — ses méthodes sont appelées au milieu d'une trame, à la cadence du
   * bus, ce qu'aucun message n'égalerait.
   */
  setBusDevices(specs: BusDeviceSpec[], mirrors: BusDevices): void {
    this.mirrors = mirrors;
    this.post({ t: 'setBusDevices', specs });
  }

  /**
   * Ancien chemin, non emprunté : `sim.mts` passe par `setBusDevices` dès que le
   * moteur l'expose. Ces deux méthodes restent comme garde-fous — un objet posé ici
   * ne verrait jamais le bus, autant que ça se voie dans la console plutôt que de
   * simuler EN SILENCE avec un écran mort.
   */
  setI2cDevices(devices: I2cDevice[]): void {
    if (devices.length > 0) console.error('[kablix] worker : périphériques I²C non décrits');
  }

  setSpiDevices(devices: SpiDevice[]): void {
    if (devices.length > 0) console.error('[kablix] worker : périphériques SPI non décrits');
  }

  writeSerial(text: string): void {
    this.post({ t: 'writeSerial', text });
  }

  /** Réponse du pont réseau (Pico W) : l'hôte a fait le fetch, le script attend. */
  sendNetResponse(response: NetResponse): void {
    this.post({ t: 'netResponse', response });
  }

  setPulseMonitors(names: string[]): void {
    this.post({ t: 'setPulseMonitors', pins: names });
  }

  emitPulses(pin: string, edges: Array<{ afterUs: number; level: boolean }>): void {
    this.post({ t: 'emitPulses', pin, edges });
  }

  setUltrasonic(sensors: UltrasonicSensor[]): void {
    this.post({ t: 'setUltrasonic', sensors });
  }

  setKeypads(keypads: KeypadConfig[]): void {
    this.keypads = keypads;
    this.lastPressed = '';
    // Les `Set` sont retirés : ils ne se sérialisent pas et le worker les reçoit
    // à plat par `keypadPressed`.
    this.post({
      t: 'setKeypads',
      keypads: keypads.map((k) => ({ rows: k.rows, cols: k.cols })),
    });
    this.pump();
  }

  syncKeypads(): void {
    this.pump();
  }

  setDht22(sensors: Dht22Sensor[]): void {
    this.post({ t: 'setDht22', sensors });
  }

  setNeopixels(strips: Array<{ pin: string; count: number }>): void {
    this.post({ t: 'setNeopixels', strips });
  }

  setLcdParallel(displays: LcdParallelConfig[]): void {
    this.post({ t: 'setLcdParallel', screens: displays });
  }

  /**
   * Afficheurs 7 segments multiplexés : la description part au worker, qui relève
   * leur latch à CHAQUE front GPIO. Vu d'ici, `onUpdate` ne tombe qu'à chaque
   * instantané (4 ms) alors qu'un chiffre n'est éclairé que ~2 ms — échantillonner
   * depuis la page raterait la moitié des chiffres.
   */
  setSevenSeg(displays: SevenSegMuxSpec[]): void {
    this.post({ t: 'setSevenSeg', displays });
  }

  /** Latch publié par le worker (tableau vide tant qu'il n'a rien envoyé). */
  readSevenSegLatch(partId: string): number[] {
    return this.latches.get(partId) ?? [];
  }

  /** Lignes DMX512 à décoder dans le worker (cf. SimEngine.setDmx). */
  setDmx(pins: string[]): void {
    if (pins.length === 0 && this.dmx.size === 0) return;
    if (pins.length === 0) this.dmx.clear();
    this.post({ t: 'setDmx', pins });
  }

  /** Dernier univers DMX512 publié par le worker pour cette broche. */
  readDmx(pin: string): Uint8Array | null {
    return this.dmx.get(pin) ?? null;
  }
}
