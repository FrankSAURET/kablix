/**
 * Point d'entrée du fil de simulation (Web Worker).
 *
 * Ce fichier est compilé en bundle séparé (`dist/webview-worker.js`, cf.
 * esbuild.js) et exécuté hors du fil principal. Il instancie le MÊME moteur que
 * la page utilisait jusqu'ici — `avr.mts` et `pico.mts` n'ont pas été touchés :
 * ils ne lisent ni `document` ni `window`, seulement `performance.now()` et
 * `setTimeout`, tous deux disponibles dans un worker.
 *
 * Le worker ne signale PAS chaque front GPIO à la page (ce serait des dizaines de
 * milliers de messages par seconde) : il publie un instantané complet des broches
 * toutes les `SNAPSHOT_PERIOD_MS`, et la page y répond ses lectures synchrones.
 */

import { AvrEngine } from './avr.mjs';
import { PicoEngine, type PicoProgram } from './pico.mjs';
import { evalAnalogWave, type AnalogWave } from './analog-waves.mjs';
import { createBusDevices, type BusDevices } from './i2c-devices.mjs';
import { sampleSevenSeg, type SevenSegMuxSpec } from './sevenseg.mjs';
import type { AvrDebugInfo, SimEngine } from './types.mjs';
import {
  DRIVE_NAMES,
  SCREEN_PERIOD_MS,
  SNAPSHOT_PERIOD_MS,
  emptySnapshot,
  type FromWorker,
  type PinSnapshot,
  type ScreenUpdate,
  type ToWorker,
} from './worker-protocol.mjs';

/**
 * Le contexte global d'un worker, décrit à la main : le projet compile avec la
 * bibliothèque DOM (la webview), qui ne connaît pas `DedicatedWorkerGlobalScope`.
 * Ajouter `WebWorker` aux `lib` du tsconfig ferait entrer en conflit ses centaines
 * de définitions avec celles du DOM pour tout le reste du code.
 */
interface WorkerScope {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

const ctx = self as unknown as WorkerScope;

let engine: SimEngine | null = null;
/** Broches publiées, dans l'ordre convenu à l'initialisation. */
let pins: string[] = [];
let snap: PinSnapshot = emptySnapshot(0);
let publishTimer: ReturnType<typeof setInterval> | null = null;
/** Rubans NeoPixel déclarés : leurs broches sont relevées à chaque instantané. */
let neopixelPins: string[] = [];
/** Écrans LCD déclarés : leurs identifiants sont relus à chaque instantané. */
let lcdIds: string[] = [];
/**
 * Claviers déclarés. Le moteur relit leur `pressed` PAR RÉFÉRENCE à chaque
 * balayage : les ensembles sont donc créés ici une fois pour toutes, et le message
 * `keypadPressed` les remplit sur place — les remplacer casserait la référence que
 * le moteur détient.
 */
let keypads: Array<{ rows: Array<string | null>; cols: Array<string | null>; pressed: Set<string> }> = [];
/**
 * Formes d'onde analogiques par broche. L'échantillonneur posé sur le moteur lit
 * cette table PAR NOM plutôt que de capturer l'onde : le message suivant la
 * remplace sans qu'il faille reposer un échantillonneur.
 */
const waves = new Map<string, AnalogWave>();

/** Fraction de VREF d'une broche à onde, à l'instant exact de la conversion. */
function sampleWave(pin: string): number {
  const w = waves.get(pin);
  if (!w) return 0;
  return evalAnalogWave(w, engine?.simulatedMs?.() ?? 0, performance.now());
}

/** Installe / retire les échantillonneurs pour que la liste reçue fasse foi. */
function applyWaves(list: AnalogWave[]): void {
  const next = new Set(list.map((w) => w.pin));
  for (const pin of waves.keys()) {
    if (!next.has(pin)) engine?.setAnalogSampler?.(pin, null);
  }
  for (const w of list) {
    if (!waves.has(w.pin)) engine?.setAnalogSampler?.(w.pin, () => sampleWave(w.pin));
    waves.set(w.pin, w);
  }
  for (const pin of [...waves.keys()]) if (!next.has(pin)) waves.delete(pin);
}

/**
 * Afficheurs 7 segments multiplexés décrits par la page. Leur latch est le seul
 * état visible qui exige la cadence du MCU : chaque chiffre n'est éclairé que
 * ~2 ms, donc échantillonné à 4 ms depuis la page on en raterait la plupart.
 */
let sevenSeg: SevenSegMuxSpec[] = [];
const sevenSegLatch = new Map<string, number[]>();
/** Dernier latch publié, à plat : un affichage figé ne repart pas à chaque instantané. */
const lastSevenSeg = new Map<string, string>();

/** Relève le latch des afficheurs multiplexés — appelée à CHAQUE front GPIO. */
function sampleLatches(): void {
  if (!engine) return;
  sampleSevenSeg(sevenSeg, sevenSegLatch, (pin) => engine!.readDigital(pin));
}

/**
 * Branche (ou débranche) l'échantillonnage haute fréquence. Sans afficheur
 * multiplexé au schéma, `onUpdate` reste nul : le moteur n'appelle alors rien du
 * tout à chaque front, ce qui est le cas de la quasi-totalité des schémas.
 */
function applySevenSeg(list: SevenSegMuxSpec[]): void {
  sevenSeg = list;
  sevenSegLatch.clear();
  lastSevenSeg.clear();
  if (engine) engine.onUpdate = list.length > 0 ? sampleLatches : null;
}

/** Périphériques de bus fabriqués ici et branchés au moteur (cf. `setBusDevices`). */
let bus: BusDevices | null = null;
/** Dernier état publié de chaque écran : sert à ne publier que ce qui a bougé. */
const lastLcd = new Map<string, string>();
const lastPca = new Map<string, string>();
const lastOledRev = new Map<string, number>();
let screenTimer: ReturnType<typeof setInterval> | null = null;

function send(msg: FromWorker, transfer?: Transferable[]): void {
  ctx.postMessage(msg, transfer ?? []);
}

/**
 * Publie l'état visible des périphériques de bus, et lui seul : un afficheur dont
 * le texte n'a pas changé, un OLED dont la révision est la même et un TFT sans
 * zone repeinte ne coûtent rien. Le message n'est envoyé que s'il porte quelque
 * chose — le cas ordinaire est qu'il ne porte rien.
 */
function publishScreens(): void {
  if (!bus) return;
  const up: ScreenUpdate = { lcd: {}, pca: {}, oled: {}, tft: {} };
  const transfer: Transferable[] = [];
  let any = false;
  for (const [id, dev] of bus.lcd) {
    const flat = dev.text.join('\n');
    if (flat === lastLcd.get(id)) continue;
    lastLcd.set(id, flat);
    up.lcd[id] = [...dev.text];
    any = true;
  }
  for (const [id, dev] of bus.pca) {
    const d = dev.duties();
    const flat = d.join(',');
    if (flat === lastPca.get(id)) continue;
    lastPca.set(id, flat);
    up.pca[id] = d;
    transfer.push(d.buffer);
    any = true;
  }
  for (const [id, dev] of bus.oled) {
    if (dev.rev === lastOledRev.get(id)) continue;
    lastOledRev.set(id, dev.rev);
    const copy = dev.buffer.slice(); // le tampon reste au moteur : on transfère la copie
    up.oled[id] = copy;
    transfer.push(copy.buffer);
    any = true;
  }
  for (const [id, dev] of bus.tft) {
    const region = dev.takeDirty();
    if (!region) continue;
    up.tft[id] = region;
    transfer.push(region.data.buffer);
    any = true;
  }
  if (any) send({ t: 'screens', screens: up }, transfer);
}

/**
 * Univers DMX512 : publiés hors instantané, et seulement quand un canal a bougé.
 * 513 octets toutes les 4 ms pour une lampe qui ne change qu'à la trame seraient
 * du gaspillage ; le moteur tient le drapeau, on ne fait que le relever.
 */
function publishDmx(): void {
  const source = engine as unknown as { takeDmxChanges?: () => Array<{ pin: string; data: Uint8Array }> };
  for (const { pin, data } of source?.takeDmxChanges?.() ?? []) {
    const copy = data.slice(); // l'univers reste au moteur : on transfère la copie
    send({ t: 'dmx', pin, data: copy }, [copy.buffer]);
  }
}

function startScreens(): void {
  if (screenTimer !== null || !bus) return;
  screenTimer = setInterval(publishScreens, SCREEN_PERIOD_MS);
}

function stopScreens(): void {
  if (screenTimer === null) return;
  clearInterval(screenTimer);
  screenTimer = null;
  publishScreens(); // dernier état : l'écran doit rester tel qu'à l'arrêt
}

/** Code d'instantané pour ce que le MCU impose sur une broche. */
function driveCode(name: string): number {
  const d = engine?.readPinDrive?.(name) ?? 'hiz';
  const i = DRIVE_NAMES.indexOf(d as (typeof DRIVE_NAMES)[number]);
  return i < 0 ? 0 : i;
}

/**
 * Relève l'état de toutes les broches et l'envoie à la page. Les vues typées sont
 * réallouées à chaque publication : elles sont TRANSFÉRÉES (le buffer change de
 * fil, sans copie), donc celles de l'envoi précédent ne nous appartiennent plus.
 */
function publish(): void {
  if (!engine) return;
  const n = pins.length;
  const out = emptySnapshot(n);
  out.seq = snap.seq + 1;
  for (let i = 0; i < n; i++) {
    const p = pins[i];
    out.digital[i] = engine.readDigital(p) ? 1 : 0;
    out.drive[i] = driveCode(p);
    out.pulseUs[i] = engine.readPulseUs?.(p) ?? 0;
    out.pwmDuty[i] = engine.readPwmDuty?.(p) ?? 0;
    out.pulseActive[i] = engine.pulseActive?.(p) ? 1 : 0;
  }
  for (const p of neopixelPins) {
    // Empaqueté en 0xRRGGBB : un entier par LED plutôt qu'un objet à trois champs,
    // sinon un ruban de 256 LED sérialise 256 objets à chaque instantané.
    out.neopixel[p] = (engine.readNeopixel?.(p) ?? []).map(
      (c) => (c.r << 16) | (c.g << 8) | c.b
    );
  }
  for (const id of lcdIds) out.lcd[id] = engine.readLcdParallel?.(id) ?? [];
  // Le latch a déjà été relevé front par front : ici on ne fait que publier ce qui
  // a bougé. Un afficheur qui montre le même nombre ne coûte aucun octet.
  for (const [id, latch] of sevenSegLatch) {
    const flat = latch.join('');
    if (flat === lastSevenSeg.get(id)) continue;
    lastSevenSeg.set(id, flat);
    out.sevenSeg[id] = Uint8Array.from(latch);
  }
  out.simulatedMs = engine.simulatedMs?.() ?? 0;
  out.busyMs = engine.busyMs?.() ?? 0;
  out.lagMs = engine.lagMs?.() ?? 0;
  out.paused = engine.paused;
  snap = out;
  send({ t: 'snapshot', snap: out }, [
    out.digital.buffer,
    out.drive.buffer,
    out.pulseUs.buffer,
    out.pwmDuty.buffer,
    out.pulseActive.buffer,
    ...Object.values(out.sevenSeg).map((v) => v.buffer),
  ]);
  publishDmx();
}

function startPublishing(): void {
  if (publishTimer !== null) return;
  publishTimer = setInterval(publish, SNAPSHOT_PERIOD_MS);
}

function stopPublishing(): void {
  if (publishTimer === null) return;
  clearInterval(publishTimer);
  publishTimer = null;
  publish(); // dernier état : la page doit voir les broches telles qu'à l'arrêt
}

function init(msg: Extract<ToWorker, { t: 'init' }>): void {
  pins = msg.pins;
  snap = emptySnapshot(pins.length);
  if (msg.board === 'pico' || msg.board === 'pico2') {
    // `pico.mts` ne lit ni `document` ni `window` : il tourne tel quel ici. Ses
    // trois rappels propres au MicroPython deviennent des messages — la page en
    // fait le texte du bandeau et le pont réseau, tous deux hors du worker.
    const pico = new PicoEngine(msg.program as PicoProgram, msg.board === 'pico2' ? 'rp2350' : 'rp2040');
    pico.onRunning = () => send({ t: 'scriptStarted' });
    pico.onDebugRestart = (phase) => send({ t: 'debugRestart', phase });
    pico.onNetRequest = (req) => send({ t: 'netRequest', req });
    engine = pico;
  } else {
    const family = msg.board === 'mega' ? 'avr2560' : 'avr328';
    engine = new AvrEngine(
      msg.program as Uint16Array,
      (msg.debugInfo as AvrDebugInfo | null) ?? null,
      family
    );
  }
  // `onUpdate` reste local au worker : la page n'en a pas besoin, elle lit
  // l'instantané. Le brancher à un postMessage coûterait un message par front.
  // Seul le latch des 7 segments s'y accroche, et seulement si le schéma en porte.
  engine.onUpdate = sevenSeg.length > 0 ? sampleLatches : null;
  engine.onSerial = (chunk) => send({ t: 'serial', chunk });
  engine.onDebugPause = (state) => {
    publish(); // l'écran doit montrer les broches DE L'ARRÊT, pas de la frame d'avant
    send({ t: 'debugPause', state });
  };
  send({ t: 'ready' });
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    switch (msg.t) {
      // Contrôle de vie, posé par la page à un worker jetable AVANT toute
      // simulation : répondre suffit à prouver que le bundle a démarré.
      case 'ping':
        send({ t: 'pong' });
        return;
      case 'init':
        init(msg);
        return;
      case 'start':
        engine?.start();
        startPublishing();
        startScreens();
        return;
      case 'stop':
        engine?.stop();
        stopPublishing();
        stopScreens();
        return;
      case 'pause':
        engine?.pause();
        publish();
        return;
      case 'resume':
        engine?.resume();
        return;
      case 'step':
        engine?.step?.();
        return;
      case 'setSpeed':
        engine?.setSpeed(msg.fraction);
        return;
      case 'setBreakpoints':
        engine?.setBreakpoints?.(msg.breakpoints as never);
        return;
      case 'setInput':
        engine?.setInput(msg.pin, msg.high);
        return;
      case 'setAnalog':
        engine?.setAnalog(msg.pin, msg.fraction);
        return;
      case 'setAnalogWaves':
        applyWaves(msg.waves);
        return;
      case 'writeSerial':
        engine?.writeSerial(msg.text);
        return;
      case 'setPulseMonitors':
        engine?.setPulseMonitors?.(msg.pins);
        return;
      case 'setUltrasonic':
        engine?.setUltrasonic?.(msg.sensors as never);
        return;
      case 'setDht22':
        engine?.setDht22?.(msg.sensors as never);
        return;
      case 'setKeypads': {
        const cfgs = msg.keypads as Array<{ rows: Array<string | null>; cols: Array<string | null> }>;
        keypads = cfgs.map((k) => ({ rows: k.rows, cols: k.cols, pressed: new Set<string>() }));
        engine?.setKeypads?.(keypads);
        return;
      }
      case 'keypadPressed': {
        // Les ensembles sont VIDÉS PUIS REMPLIS, jamais remplacés : le moteur en
        // tient la référence depuis `setKeypads`.
        for (const k of keypads) k.pressed.clear();
        for (const entry of msg.pressed) {
          const cut = entry.indexOf(':');
          const which = Number(entry.slice(0, cut));
          keypads[which]?.pressed.add(entry.slice(cut + 1));
        }
        engine?.syncKeypads?.();
        return;
      }
      case 'setNeopixels': {
        const strips = msg.strips as Array<{ pin: string; count: number }>;
        neopixelPins = strips.map((s) => s.pin);
        engine?.setNeopixels?.(strips);
        return;
      }
      case 'setLcdParallel': {
        const screens = msg.screens as Array<{ id: string }>;
        lcdIds = screens.map((s) => s.id);
        engine?.setLcdParallel?.(screens as never);
        return;
      }
      case 'setSevenSeg':
        applySevenSeg(msg.displays);
        return;
      case 'setDmx':
        engine?.setDmx?.(msg.pins);
        return;
      case 'setBusDevices': {
        // Les périphériques sont FABRIQUÉS ici à partir de leur description : ce
        // sont eux qui décodent les trames, au rythme du bus, sans un message.
        bus = createBusDevices(msg.specs);
        lastLcd.clear();
        lastPca.clear();
        lastOledRev.clear();
        engine?.setI2cDevices?.(bus.i2c);
        engine?.setSpiDevices?.(bus.spi);
        if (publishTimer !== null) startScreens(); // périphériques posés en pleine simulation
        return;
      }
      case 'netResponse':
        engine?.sendNetResponse?.(msg.response as never);
        return;
      case 'dispose':
        stopPublishing();
        stopScreens();
        bus = null;
        engine?.dispose();
        engine = null;
        return;
      default:
        return;
    }
  } catch (err) {
    // Une exception du moteur ne doit pas laisser la page attendre un instantané
    // qui ne viendra plus : elle repasse en mode dégradé (moteur sur son fil).
    stopPublishing();
    stopScreens();
    send({ t: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
