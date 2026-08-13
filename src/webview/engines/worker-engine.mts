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

import type {
  Breakpoint,
  DebugPauseState,
  Dht22Sensor,
  KeypadConfig,
  LcdParallelConfig,
  SimEngine,
  UltrasonicSensor,
} from './types.mjs';
import {
  DRIVE_NAMES,
  SNAPSHOT_PERIOD_MS,
  emptySnapshot,
  type FromWorker,
  type PinSnapshot,
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
  const digital = board === 'mega' ? 54 : 14;
  const analog = board === 'mega' ? 16 : 6;
  const pins: string[] = [];
  for (let i = 0; i < digital; i++) pins.push(String(i));
  for (let i = 0; i < analog; i++) pins.push(`A${i}`);
  return pins;
}

/**
 * URL blob du bundle du worker, préparée à l'avance. Un `new Worker(uri)` direct
 * sur l'URI de la webview est refusé (origine `vscode-webview://` différente de
 * celle de la page) ; le blob, lui, appartient à la page — d'où `worker-src blob:`
 * dans la CSP.
 */
let blobUrl: string | null = null;

/**
 * Récupère le bundle du worker. Appelé au chargement de la page, PAS au démarrage
 * de la simulation : `startRun()` est synchrone et le reste du code compte sur un
 * moteur disponible dans la foulée. Un `fetch` de fichier local prend quelques
 * millisecondes, bien avant le premier clic sur « Compiler ».
 */
export async function preloadWorker(url: string): Promise<void> {
  if (blobUrl) return;
  try {
    const source = await fetch(url).then((r) => r.text());
    blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  } catch {
    blobUrl = null; // bundle absent : la simulation retombera sur le fil principal
  }
}

/** Vrai si un moteur peut être monté dans un worker tout de suite. */
export function workerReady(): boolean {
  return blobUrl !== null;
}

export class WorkerEngine implements SimEngine {
  onUpdate: (() => void) | null = null;
  onSerial: ((chunk: string) => void) | null = null;
  onDebugPause: ((state: DebugPauseState) => void) | null = null;

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
  /** Dernière liste de touches envoyée, pour n'écrire que sur changement. */
  private lastPressed = '';
  private pumpTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(worker: Worker, board: WorkerBoard) {
    this.worker = worker;
    this.pins = boardPins(board);
    this.pins.forEach((p, i) => this.index.set(p, i));
    this.snap = emptySnapshot(this.pins.length);
    worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
  }

  /**
   * Monte un moteur dans un worker. Rend `null` si le bundle n'a pas été préchargé
   * ou si le worker refuse de démarrer : l'appelant retombe alors sur le moteur du
   * fil principal, plutôt que de laisser la simulation muette.
   */
  static create(
    board: WorkerBoard,
    program: Uint16Array,
    debugInfo: unknown
  ): WorkerEngine | null {
    if (!blobUrl) return null;
    let worker: Worker;
    try {
      worker = new Worker(blobUrl);
    } catch {
      return null;
    }
    const engine = new WorkerEngine(worker, board);
    // Copie TRANSFÉRÉE : le flash change de fil sans être dupliqué en mémoire, et
    // l'original reste à la page (une recompilation le relit).
    const copy = program.slice();
    engine.post({ t: 'init', board, program: copy, debugInfo, pins: engine.pins }, [copy.buffer]);
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
        this.pausedMirror = msg.snap.paused;
        this.onUpdate?.();
        return;
      case 'serial':
        this.onSerial?.(msg.chunk);
        return;
      case 'debugPause':
        this.pausedMirror = true;
        this.onDebugPause?.(msg.state as DebugPauseState);
        return;
      case 'error':
        console.error('[kablix] moteur worker :', msg.message);
        return;
      default:
        return;
    }
  }

  /**
   * Relève, à la cadence de l'instantané, les deux états que le worker ne peut pas
   * lire lui-même :
   *  - les ÉCHANTILLONNEURS analogiques, des fonctions de la page (forme d'onde du
   *    pouls, charge d'un condensateur). Le moteur les appelait au moment exact de
   *    la lecture ADC, en temps simulé ; ici ils sont relevés toutes les 4 ms de
   *    temps réel, soit quatre fois plus finement que l'affichage mais moins bien
   *    qu'avant. La forme d'onde déménagera dans le worker au lot suivant.
   *  - les TOUCHES enfoncées, jusqu'ici un `Set` partagé par référence avec l'UI.
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

  step(): void {
    this.post({ t: 'step' });
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

  private slot(name: string): number {
    return this.index.get(name) ?? -1;
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

  readNeopixel(pin: string): Array<{ r: number; g: number; b: number }> {
    return (this.snap.neopixel[pin] ?? []).map((c) => ({
      r: (c >> 16) & 0xff,
      g: (c >> 8) & 0xff,
      b: c & 0xff,
    }));
  }

  readLcdParallel(id: string): string[] {
    return this.snap.lcd[id] ?? [];
  }

  simulatedMs(): number {
    return this.snap.simulatedMs;
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

  writeSerial(text: string): void {
    this.post({ t: 'writeSerial', text });
  }

  setPulseMonitors(names: string[]): void {
    this.post({ t: 'setPulseMonitors', pins: names });
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
}
