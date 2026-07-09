// Moteur de simulation Raspberry Pi Pico (RP2040) basé sur rp2040js.
// Deux modes de chargement :
//   - 'ram'   : image bare-metal copiée en SRAM (sortie du compilateur intégré) ;
//   - 'flash' : firmware UF2/ELF programmé en flash + bootrom B1 (pico-sdk,
//               MicroPython…), avec USB-CDC et UART0 reliés au moniteur série.
// En mode flash, un script MicroPython optionnel est injecté via le raw REPL
// (Ctrl-A … Ctrl-D) dès que l'USB est énuméré.
import { RP2040, Simulator, USBCDC, GPIOPinState, ConsoleLogger, LogLevel } from 'rp2040js';
import { bootromB1 } from './bootrom-b1.mjs';
import type {
  Breakpoint,
  DebugPauseState,
  Dht22Sensor,
  FlashSegment,
  KeypadConfig,
  LcdParallelConfig,
  NetRequest,
  NetResponse,
  SimEngine,
  UltrasonicSensor,
} from './types.mjs';
import { selectSpiDevice, Hd44780, type I2cDevice, type SpiDevice } from './i2c-devices.mjs';
import { Ws2812Decoder } from './ws2812.mjs';
import { buildDht22Schedule, DHT22_START_LOW_US, type DhtTransition } from './dht22.mjs';

const RAM_START = 0x20000000;
const FLASH_START = 0x10000000;

export type PicoProgram =
  | { kind: 'ram'; image: Uint8Array }
  | { kind: 'flash'; segments: FlashSegment[]; script?: string };

function gpioIndex(name: string): number | null {
  const m = /^(?:GP)?(\d+)$/.exec(name);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n < 30 ? n : null;
}

// Canal ADC d'une broche analogique (GP26..GP28 -> 0..2).
function adcChannel(name: string): number | null {
  const i = gpioIndex(name);
  return i !== null && i >= 26 && i <= 29 ? i - 26 : null;
}

// Durée d'un cycle à 125 MHz (nanosecondes simulées).
const CYCLE_NANOS = 1e9 / 125_000_000;

/**
 * Simulator rp2040js au cadencement optimisé. La boucle d'origine appelle
 * `clock.tick()` et re-teste l'arrêt à CHAQUE instruction, puis rend la main
 * par `setTimeout(0)` (clampé à ~4 ms par Chrome sur les timers imbriqués).
 * Ici : lots d'instructions bornés par la prochaine alarme (les échéances
 * restent exactes — le lot s'arrête pile dessus), `tick` groupé par lot, et
 * yield par MessageChannel (macrotâche sans clampage). Mesuré : ≈ +16 % de
 * débit en node, davantage en webview. Le profil restant est ~50 % dans
 * `executeInstruction` (interpréteur ARM) — plafond de rp2040js.
 */
class KablixSimulator extends Simulator {
  /** Génération de planification : invalide les yields MessageChannel en vol. */
  private gen = 0;
  private readonly port: MessagePort;
  // Cadencement temps réel : ancre temps réel ↔ temps simulé. Sans elle, les
  // périodes où le cœur dort (WFE + saut d'alarme) s'écouleraient quasi
  // instantanément — un time.sleep(0.5) semblerait durer 0 s. Inversement le
  // code calculatoire reste sous le temps réel (plafond de l'interpréteur) :
  // un retard irrattrapable ré-ancre sans dette, sinon les sleep suivants
  // seraient escamotés pour « rattraper » le retard accumulé.
  private paceWall = 0;
  private paceSim = 0;
  /** Actions à échéance en cycles CPU simulés (ex. ECHO ultrason) — cf. PicoEngine. */
  onTick: (() => void) | null = null;
  /** Échéance (temps simulé, ns) de la plus proche action programmée par `onTick`, ou null. */
  nextScheduledNanos: number | null = null;

  constructor() {
    super();
    const ch = new MessageChannel();
    this.port = ch.port1;
    ch.port2.onmessage = (e: MessageEvent) => {
      if (e.data === this.gen && !this.stopped) this.execute();
    };
  }

  override stop(): void {
    super.stop();
    this.gen++; // un yield déjà posté ne relancera pas la boucle
  }

  override execute(): void {
    const { rp2040, clock } = this;
    this.executeTimer = null;
    this.stopped = false;
    const deadline = Date.now() + 16; // budget réel par tranche (fluidité UI)
    let idle = false;
    let napMs = 0; // simulation en avance sur le réel : durée à laisser passer
    while (!this.stopped) {
      const now = Date.now();
      if (now >= deadline) break;
      const aheadMs = (clock.nanos - this.paceSim) / 1e6 - (now - this.paceWall);
      if (aheadMs > 8) {
        napMs = Math.min(aheadMs - 4, 40);
        break;
      }
      if (aheadMs < -50) {
        this.paceWall = now;
        this.paceSim = clock.nanos;
      }
      if (rp2040.core.waiting) {
        let n = clock.nanosToNextAlarm;
        if (this.nextScheduledNanos !== null) {
          const toScheduled = Math.max(0, this.nextScheduledNanos - clock.nanos);
          n = n > 0 ? Math.min(n, toScheduled) : toScheduled;
        }
        if (n <= 0) {
          if (this.nextScheduledNanos !== null) {
            // Échéance programmée déjà atteinte : la traiter avant de ré-attendre.
            this.onTick?.();
            continue;
          }
          // WFE sans alarme : seul un événement externe (USB, setInput…)
          // peut réveiller le cœur — on repasse en sondage doux.
          idle = true;
          break;
        }
        // Le compteur de cycles suit le saut (AVANT le tick : les fronts GPIO
        // déclenchés par les alarmes — PWM servo… — sont horodatés en cycles).
        const jumpCycles = n / CYCLE_NANOS;
        rp2040.core.cycles += jumpCycles;
        // PIO patché (KABLIX) : plus de setTimeout auto-cadencé, avancer
        // manuellement pendant les sauts WFE sinon un state machine actif
        // (ex. machine.bitstream d'un NeoPixel) se figerait pendant tout
        // time.sleep() — le firmware attend justement la fin du bitstream.
        rp2040.pio[0].advance(jumpCycles);
        rp2040.pio[1].advance(jumpCycles);
        clock.tick(n);
        this.onTick?.();
      } else {
        // Lot d'instructions jusqu'à la prochaine alarme (≤ 1 ms simulée), borné
        // aussi par la prochaine échéance programmée (ECHO ultrason) pour ne
        // jamais sauter par-dessus une fenêtre de quelques µs. Une instruction
        // en cours de lot (ex. front descendant TRIG) peut programmer une
        // nouvelle échéance PLUS PROCHE que le budget figé au départ : on
        // recalcule donc le budget restant à chaque instruction plutôt que de
        // le figer une fois pour toutes.
        const toAlarm = clock.nanosToNextAlarm;
        const baseBudget = toAlarm > 0 ? Math.min(toAlarm, 1e6) : 1e6;
        let nanos = 0;
        while (!rp2040.core.waiting && !this.stopped) {
          let budget = baseBudget;
          if (this.nextScheduledNanos !== null) {
            budget = Math.min(budget, Math.max(0, this.nextScheduledNanos - (clock.nanos + nanos)));
          }
          if (nanos >= budget) break;
          const instrCycles = rp2040.core.executeInstruction();
          rp2040.pio[0].advance(instrCycles);
          rp2040.pio[1].advance(instrCycles);
          nanos += instrCycles * CYCLE_NANOS;
        }
        clock.tick(nanos);
        this.onTick?.();
      }
    }
    if (this.stopped) return;
    if (idle || napMs > 0) {
      this.executeTimer = setTimeout(() => this.execute(), idle ? 1 : napMs);
    } else {
      this.port.postMessage(++this.gen);
    }
  }
}

/** États successifs de l'injection d'un script via le raw REPL MicroPython. */
type ReplPhase =
  | 'idle'         // pas de script à injecter
  | 'wait-raw'     // Ctrl-A envoyé, on attend l'invite du raw REPL
  | 'paste-hdr'    // \x05A\x01 envoyé, on attend « R\x01 » + taille de fenêtre
  | 'paste-stream' // envoi du script sous contrôle de flux (raw-paste)
  | 'paste-ack'    // tout envoyé + \x04, on attend l'accusé \x04 du firmware
  | 'wait-ok'      // mode dégradé sans raw-paste : on attend « OK »
  | 'stdout'       // le script s'exécute, sortie standard relayée
  | 'stderr'       // après le premier \x04 : sortie d'erreur relayée
  | 'done';        // exécution finie, repassé en REPL interactif

export class PicoEngine implements SimEngine {
  onUpdate: (() => void) | null = null;
  onSerial: ((chunk: string) => void) | null = null;
  onDebugPause: ((state: DebugPauseState) => void) | null = null;
  onNetRequest: ((req: NetRequest) => void) | null = null;

  /** Pas à pas : défini uniquement en mode script MicroPython (cf. constructeur). */
  step?: () => void;

  private isPaused = false;
  private disposed = false;
  private sim: KablixSimulator;
  private mcu: RP2040;
  private cdc: USBCDC | null = null;
  private script: string | null = null;
  private replPhase: ReplPhase = 'idle';
  private replBuffer = '';
  // Contrôle de flux raw-paste : le firmware accorde une fenêtre d'octets et
  // la ré-augmente (\x01) au fur et à mesure qu'il consomme le script.
  private scriptBytes: Uint8Array = new Uint8Array(0);
  private sendPos = 0;
  private pasteWindow = 0;
  private pasteIncrement = 0;
  private pasteHdr: number[] = [];
  /** Vrai si la pause courante a été obtenue par arrêt du simulateur (hors script). */
  private pausedByStop = false;
  /**
   * Tampon de détection des séquences « \x1b<tag><payload>\n » émises par les
   * préambules injectés : tag « KX » = état de débogage, « NT » = requête réseau
   * (Pico W). Reconstituées avant d'être retirées du flux du moniteur série.
   */
  private escBuf = '';
  /** Points d'arrêt (ligne + condition), retenus pour (re)transmission au script __kx. */
  private breakpoints: Breakpoint[] = [];
  // Mesure de largeur d'impulsion (servo) : broches GPIO surveillées + état d'arête.
  private pulsePins: Array<{ name: string; index: number }> = [];
  // winStart/winHigh/winEdges : fenêtre d'intégration du rapport cyclique
  // (readPwmDuty) ; lastDuty = dernière mesure, conservée tant que la fenêtre
  // ne couvre pas une période PWM complète.
  private pulseState = new Map<
    string,
    {
      high: boolean; rise: number; lastUs: number; lastEdge: number;
      winStart: number; winHigh: number; winEdges: number; lastDuty: number;
    }
  >();
  // Chaînes NeoPixel : décodeur WS2812 par broche DIN.
  private neopixels: Array<{ name: string; index: number; dec: Ws2812Decoder; last: boolean }> = [];
  // Afficheurs LCD parallèles : décodeur HD44780 par composant (index GPIO).
  private lcdParallel: Array<{
    id: string;
    core: Hd44780;
    rs: number;
    e: number;
    data: number[];
    fourBit: boolean;
    lastE: boolean;
  }> = [];
  // Claviers matriciels : touches enfoncées → colonnes tirées à LOW.
  private keypads: KeypadConfig[] = [];
  private applyingKeypads = false;
  private keypadColLevel = new Map<string, boolean>();
  // Capteurs ultrason (HC-SR04) : impulsion TRIG (mesurée comme un pulseMonitor)
  // -> ECHO programmé en TEMPS SIMULÉ (nanosecondes horloge RP2040), vérifié à
  // chaque avance de `KablixSimulator.execute()` via `sim.onTick`. Un setTimeout
  // réel serait faux : le simulateur peut avancer de dizaines de ms simulées
  // pendant qu'un timer JS de 0,2 ms met plusieurs ms réelles à se déclencher
  // (résolution des timers Node/navigateur) — l'ECHO arrivait après la fenêtre
  // d'attente du firmware (pulseIn/boucle bornée).
  private ultrasonic: UltrasonicSensor[] = [];
  private scheduled: Array<{ nanos: number; name: string; value: boolean }> = [];
  // Capteurs DHT22 : même principe que l'ECHO ultrason (signal de départ détecté
  // en broche, réponse programmée en temps simulé). La broche est au repos HAUT
  // (pull-up) ; le MCU la tire BAS ≥ 500 µs pour démarrer une mesure.
  private dht22: Array<{
    pin: string; index: number; tempC: number; humidity: number;
    wasLow: boolean; lowStartNanos: number; busyUntilNanos: number;
  }> = [];

  constructor(program: PicoProgram) {
    this.sim = new KablixSimulator();
    this.sim.onTick = () => this.fireScheduled();
    this.mcu = this.sim.rp2040;
    this.mcu.logger = new ConsoleLogger(LogLevel.Error);

    if (program.kind === 'ram') {
      this.mcu.sram.set(program.image, 0); // image chargée à 0x20000000
      this.mcu.core.VTOR = RAM_START;
      this.mcu.core.reset();
    } else {
      // Bootrom B1 requis : les firmwares pico-sdk/MicroPython appellent ses
      // fonctions ROM (boot2, routines flottantes, memcpy…).
      this.mcu.loadBootrom(bootromB1);
      for (const seg of program.segments) {
        const offset = seg.addr - FLASH_START;
        if (offset < 0 || offset + seg.data.length > this.mcu.flash.length) continue;
        this.mcu.flash.set(seg.data, offset);
      }
      this.script = program.script ?? null;
      // Le pas à pas n'existe qu'en mode script MicroPython instrumenté.
      if (this.script) this.step = () => this.doStep();

      this.cdc = new USBCDC(this.mcu.usbCtrl);
      this.cdc.onSerialData = (buffer) => this.onCdcData(buffer);
      this.cdc.onDeviceConnected = () => this.onCdcConnected();

      // Anti-tempête USB : quand le firmware arme le endpoint OUT du CDC sans
      // qu'aucun octet n'attende côté hôte, rp2040js répond « transfert vide »
      // au bout de 10 µs et TinyUSB réarme aussitôt — une IRQ toutes les
      // ~25 µs simulées qui avorte chaque WFE. time.sleep() devenait une
      // boucle chaude (~4× le temps réel). On répond à la cadence d'un vrai
      // hôte full-speed (trame de 1 ms) : le firmware dort vraiment entre deux.
      const usb = this.mcu.usbCtrl;
      const cdcEndpointRead = usb.onEndpointRead;
      const cdcInternals = this.cdc as unknown as { outEndpoint: number };
      const emptyOut = new Uint8Array(0);
      usb.onEndpointRead = (endpoint, byteCount) => {
        if (endpoint === cdcInternals.outEndpoint && this.cdc!.txFIFO.itemCount === 0) {
          usb.endpointReadDone(endpoint, emptyOut, 1000);
        } else {
          cdcEndpointRead?.(endpoint, byteCount);
        }
      };

      // Démarrage identique au bootrom réel : exécution de boot2 en début de flash.
      this.mcu.core.PC = FLASH_START;
    }

    for (const pin of this.mcu.gpio) {
      pin.addListener(() => {
        this.samplePulses();
        this.sampleNeopixels();
        this.sampleLcdParallel();
        this.sampleDht22();
        this.applyKeypads();
        this.onUpdate?.();
      });
    }
    // UART0 relié au moniteur série (programmes C bare-metal / pico-sdk).
    // Décodage UTF-8 incrémental (caractères accentués émis octet par octet).
    const uartDecoder = new TextDecoder('utf-8');
    this.mcu.uart[0].onByte = (value) => {
      const text = uartDecoder.decode(Uint8Array.of(value), { stream: true });
      if (text) this.onSerial?.(text);
    };
  }

  readDigital(name: string): boolean {
    const i = gpioIndex(name);
    if (i === null) return false;
    const pin = this.mcu.gpio[i];
    // En sortie : le niveau piloté par le cœur (High). En entrée : c'est le
    // signal injecté par un composant (setInput → inputValue) qui fait foi —
    // exactement ce que lit le firmware via le registre SIO. (rp2040js ne
    // « remonte » pas la pull-up dans inputValue ; c'est sim.mts qui pose le
    // niveau de repos haut pour les boutons en pull-up.)
    if (pin.value === GPIOPinState.High) return true;
    if (pin.value === GPIOPinState.Low) return false;
    return pin.inputValue;
  }

  setInput(name: string, value: boolean): void {
    const i = gpioIndex(name);
    if (i === null) return;
    this.mcu.gpio[i].setInputValue(value);
  }

  setKeypads(keypads: KeypadConfig[]): void {
    this.keypads = keypads;
    this.keypadColLevel.clear();
    // Colonnes au repos = HAUT (pull-up).
    for (const kp of keypads) {
      for (const col of kp.cols) if (col) this.setInput(col, true);
    }
  }

  /** Vrai si la broche est PILOTÉE à LOW (sortie basse), pas seulement flottante. */
  private pinDrivenLow(name: string): boolean {
    const i = gpioIndex(name);
    if (i === null) return false;
    return this.mcu.gpio[i].value === GPIOPinState.Low;
  }

  /**
   * Recalcule le niveau des colonnes : une colonne est tirée à LOW si une touche
   * enfoncée la relie à une ligne actuellement pilotée à LOW (sortie basse). Les
   * lignes en entrée haute impédance sont ignorées (pas de touche fantôme).
   * Garde-fou de ré-entrance (setInput redéclenche l'écouteur de broche).
   */
  private applyKeypads(): void {
    if (this.keypads.length === 0 || this.applyingKeypads) return;
    this.applyingKeypads = true;
    try {
      for (const kp of this.keypads) {
        for (let c = 0; c < kp.cols.length; c++) {
          const col = kp.cols[c];
          if (!col) continue;
          let pulled = false;
          for (let r = 0; r < kp.rows.length; r++) {
            const row = kp.rows[r];
            if (row && kp.pressed.has(`${r},${c}`) && this.pinDrivenLow(row)) {
              pulled = true;
              break;
            }
          }
          const level = !pulled;
          if (this.keypadColLevel.get(col) !== level) {
            this.keypadColLevel.set(col, level);
            this.setInput(col, level);
          }
        }
      }
    } finally {
      this.applyingKeypads = false;
    }
  }

  /**
   * Relie des esclaves I²C aux deux contrôleurs matériels (i2c0/i2c1) : le maître
   * route vers l'appareil dont l'adresse correspond (machine.I2C côté MicroPython).
   */
  setI2cDevices(devices: I2cDevice[]): void {
    // Renseigne la rustine de scan (cf. compiler.ts I2C_SCAN_SHIM) avec les
    // adresses réelles : `bus.scan()` les renvoie sans sonder le matériel (le
    // sondage d'adresses absentes fige l'émulation I²C de rp2040js). Injecté dans
    // le script AVANT sa transmission au REPL (paste). Sans esclave → liste vide.
    if (this.script && this.script.includes('_KX_I2C_ADDRS = None')) {
      const addrs = devices.map((d) => '0x' + d.address.toString(16));
      this.script = this.script.replace('_KX_I2C_ADDRS = None', `_KX_I2C_ADDRS = [${addrs.join(', ')}]`);
    }
    for (const ctrl of this.mcu.i2c) {
      let current: I2cDevice | null = null;
      ctrl.onStart = (repeated: boolean) => {
        for (const d of devices) d.onStart?.(repeated);
        ctrl.completeStart();
      };
      ctrl.onConnect = (address: number) => {
        current = devices.find((d) => d.address === address) ?? null;
        ctrl.completeConnect(current !== null); // ACK seulement si l'adresse existe
      };
      ctrl.onWriteByte = (value: number) => {
        ctrl.completeWrite(current ? current.write(value) : false);
      };
      ctrl.onReadByte = () => {
        ctrl.completeRead(current ? current.read() : 0xff);
      };
      ctrl.onStop = () => {
        current?.onStop?.();
        current = null;
        ctrl.completeStop();
      };
    }
  }

  setPulseMonitors(names: string[]): void {
    this.pulsePins = [];
    for (const name of names) {
      const i = gpioIndex(name);
      if (i === null) continue;
      this.pulsePins.push({ name, index: i });
      if (!this.pulseState.has(name)) {
        this.pulseState.set(name, {
          high: false, rise: 0, lastUs: 0, lastEdge: 0,
          winStart: this.mcu.core.cycles, winHigh: 0, winEdges: 0, lastDuty: 0,
        });
      }
    }
  }

  setDht22(sensors: Dht22Sensor[]): void {
    this.dht22 = [];
    for (const s of sensors) {
      const i = gpioIndex(s.pin);
      if (i === null) continue;
      this.dht22.push({
        pin: s.pin, index: i, tempC: s.temperatureC, humidity: s.humidity,
        wasLow: false, lowStartNanos: 0, busyUntilNanos: 0,
      });
      // Ligne de données au repos = HAUT (pull-up) ; le MCU la tire BAS pour démarrer.
      this.setInput(s.pin, true);
    }
  }

  /**
   * Détecte le signal de départ du DHT22 (ligne tenue BASSE ≥ ~500 µs puis
   * relâchée) et programme la réponse (accusé + 40 bits) en temps simulé —
   * même principe que `maybeFireEcho` pour l'ultrason.
   */
  private sampleDht22(): void {
    if (this.dht22.length === 0) return;
    const cyclesPerUs = (this.mcu.clkSys || 125_000_000) / 1_000_000;
    const nanosPerCycle = 1e9 / (this.mcu.clkSys || 125_000_000);
    const nowNanos = this.sim.clock.nanos;
    for (const d of this.dht22) {
      const low = this.mcu.gpio[d.index].value === GPIOPinState.Low;
      if (low && !d.wasLow) {
        d.wasLow = true;
        d.lowStartNanos = nowNanos;
      } else if (!low && d.wasLow) {
        d.wasLow = false;
        const lowUs = (nowNanos - d.lowStartNanos) / 1000;
        if (lowUs >= DHT22_START_LOW_US && nowNanos >= d.busyUntilNanos) {
          const startNanos = nowNanos + 30_000; // ~30 µs après le relâchement
          const startCycles = Math.round(startNanos / nanosPerCycle);
          const sched: DhtTransition[] = buildDht22Schedule(d.tempC, d.humidity, startCycles, cyclesPerUs);
          for (const ev of sched) {
            this.scheduled.push({ nanos: ev.cycle * nanosPerCycle, name: d.pin, value: ev.value });
          }
          const last = sched[sched.length - 1];
          d.busyUntilNanos = last ? last.cycle * nanosPerCycle : nowNanos;
        }
      }
    }
    this.updateNextScheduled();
  }

  setUltrasonic(sensors: UltrasonicSensor[]): void {
    this.scheduled = [];
    this.ultrasonic = sensors;
    // Surveille les broches TRIG (comme un pulseMonitor de plus).
    for (const s of sensors) {
      const i = gpioIndex(s.trig);
      if (i === null) continue;
      if (!this.pulsePins.some((p) => p.name === s.trig)) {
        this.pulsePins.push({ name: s.trig, index: i });
      }
      if (!this.pulseState.has(s.trig)) {
        this.pulseState.set(s.trig, {
          high: false, rise: 0, lastUs: 0, lastEdge: 0,
          winStart: this.mcu.core.cycles, winHigh: 0, winEdges: 0, lastDuty: 0,
        });
      }
    }
  }

  /** Sur une impulsion TRIG valide (≥ 8 µs), programme l'impulsion ECHO correspondante. */
  private maybeFireEcho(trigName: string, widthUs: number): void {
    if (widthUs < 8) return;
    const cyclesPerUs = (this.mcu.clkSys || 125_000_000) / 1_000_000;
    const nanosPerCycle = 1e9 / (this.mcu.clkSys || 125_000_000);
    const nowNanos = this.sim.clock.nanos;
    for (const s of this.ultrasonic) {
      if (s.trig !== trigName) continue;
      const cm = Math.max(2, Math.min(400, s.distanceCm || 0)); // plage HC-SR04 : 2–400 cm
      const startNanos = nowNanos + 200 * cyclesPerUs * nanosPerCycle; // ~200 µs de latence capteur
      const widthNanos = cm * 58 * cyclesPerUs * nanosPerCycle; // 58 µs/cm (aller-retour)
      this.scheduled.push({ nanos: startNanos, name: s.echo, value: true });
      this.scheduled.push({ nanos: startNanos + widthNanos, name: s.echo, value: false });
    }
    this.updateNextScheduled();
  }

  /** Applique les actions d'entrée programmées arrivées à échéance (temps simulé). */
  private fireScheduled(): void {
    if (this.scheduled.length === 0) return;
    const now = this.sim.clock.nanos;
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      if (now >= this.scheduled[i].nanos) {
        const a = this.scheduled[i];
        this.setInput(a.name, a.value);
        this.scheduled.splice(i, 1);
      }
    }
    this.updateNextScheduled();
  }

  /** Tient `sim.nextScheduledNanos` à jour (borne le lot d'instructions suivant). */
  private updateNextScheduled(): void {
    this.sim.nextScheduledNanos =
      this.scheduled.length === 0 ? null : Math.min(...this.scheduled.map((a) => a.nanos));
  }

  setSpiDevices(devices: SpiDevice[]): void {
    for (const ctrl of this.mcu.spi) {
      ctrl.onTransmit = (mosi: number) => {
        const dev = selectSpiDevice(devices, (p) => this.readDigital(p));
        if (!dev) {
          ctrl.completeTransmit(0xff);
          return;
        }
        const dc = dev.dcPin ? this.readDigital(dev.dcPin) : false;
        ctrl.completeTransmit(dev.transfer(mosi, dc));
      };
    }
  }

  setNeopixels(strips: Array<{ pin: string; count: number }>): void {
    this.neopixels = [];
    const cyclesPerUs = (this.mcu.clkSys || 125_000_000) / 1_000_000;
    for (const s of strips) {
      const i = gpioIndex(s.pin);
      if (i === null) continue;
      this.neopixels.push({ name: s.pin, index: i, dec: new Ws2812Decoder(s.count, cyclesPerUs), last: false });
    }
  }

  readNeopixel(pin: string): Array<{ r: number; g: number; b: number }> {
    const n = this.neopixels.find((np) => np.name === pin);
    if (!n) return [];
    n.dec.flush(); // classe le dernier bit (la trame est terminée à la lecture)
    return n.dec.colors;
  }

  private sampleNeopixels(): void {
    if (this.neopixels.length === 0) return;
    const now = this.mcu.core.cycles;
    for (const n of this.neopixels) {
      const level = this.mcu.gpio[n.index].value === GPIOPinState.High;
      if (level !== n.last) {
        n.dec.edge(now, level);
        n.last = level;
      }
    }
  }

  setLcdParallel(displays: LcdParallelConfig[]): void {
    this.lcdParallel = [];
    for (const d of displays) {
      const rs = gpioIndex(d.rs);
      const e = gpioIndex(d.e);
      const data = d.data.map((p) => gpioIndex(p));
      if (rs === null || e === null || data.some((i) => i === null)) continue;
      this.lcdParallel.push({
        id: d.id,
        core: new Hd44780(d.cols, d.rows),
        rs,
        e,
        data: data as number[],
        fourBit: data.length === 4,
        lastE: false,
      });
    }
  }

  readLcdParallel(id: string): string[] {
    return this.lcdParallel.find((l) => l.id === id)?.core.text ?? [];
  }

  /** Décode les HD44780 parallèles sur le front descendant de E (RS + données). */
  private sampleLcdParallel(): void {
    if (this.lcdParallel.length === 0) return;
    for (const l of this.lcdParallel) {
      const e = this.mcu.gpio[l.e].value === GPIOPinState.High;
      if (l.lastE && !e) {
        const rs = this.mcu.gpio[l.rs].value === GPIOPinState.High;
        let bits = 0;
        for (let i = 0; i < l.data.length; i++) {
          if (this.mcu.gpio[l.data[i]].value === GPIOPinState.High) bits |= 1 << i;
        }
        if (l.fourBit) l.core.writeNibble(bits, rs);
        else l.core.writeByte(bits, rs);
      }
      l.lastE = e;
    }
  }

  readPulseUs(name: string): number {
    return this.pulseState.get(name)?.lastUs ?? 0;
  }

  /** Vrai si la broche a basculé récemment (< 60 ms simulées) = signal carré actif (tone/PWM). */
  pulseActive(name: string): boolean {
    const st = this.pulseState.get(name);
    if (!st) return false;
    const cyclesPerUs = (this.mcu.clkSys || 125_000_000) / 1_000_000;
    return this.mcu.core.cycles - st.lastEdge < 60_000 * cyclesPerUs;
  }

  /** Rapport cyclique (0..1) mesuré sur la fenêtre écoulée depuis la dernière mesure. */
  readPwmDuty(name: string): number {
    const st = this.pulseState.get(name);
    if (!st) return this.readDigital(name) ? 1 : 0;
    const cyclesPerUs = (this.mcu.clkSys || 125_000_000) / 1_000_000;
    const now = this.mcu.core.cycles;
    const total = now - st.winStart;
    // Fenêtre trop courte (pas une période PWM complète) : mesurer donnerait 0
    // ou 1 selon la phase → on garde la dernière valeur et on laisse la fenêtre
    // s'allonger (plafond 100 ms simulées pour ne pas rester figé).
    if (st.winEdges < 2 && total < 100_000 * cyclesPerUs) return st.lastDuty;
    let high = st.winHigh;
    if (st.high) high += now - Math.max(st.rise, st.winStart);
    st.winStart = now;
    st.winHigh = 0;
    st.winEdges = 0;
    st.lastDuty = total > 0 ? Math.max(0, Math.min(1, high / total)) : (st.high ? 1 : 0);
    return st.lastDuty;
  }

  /** Mesure la durée de l'état haut sur les broches surveillées (servo). */
  private samplePulses(): void {
    if (this.pulsePins.length === 0) return;
    const cyclesPerUs = (this.mcu.clkSys || 125_000_000) / 1_000_000;
    const now = this.mcu.core.cycles;
    for (const pp of this.pulsePins) {
      const high = this.mcu.gpio[pp.index].value === GPIOPinState.High;
      const st = this.pulseState.get(pp.name);
      if (!st) continue;
      if (high && !st.high) {
        st.high = true;
        st.rise = now;
        st.lastEdge = now; // front montant : activité
        st.winEdges++; // fronts montants de la fenêtre (readPwmDuty)
      } else if (!high && st.high) {
        st.high = false;
        st.lastEdge = now; // front descendant
        st.lastUs = (now - st.rise) / cyclesPerUs;
        // Cumul du temps haut dans la fenêtre courante (rapport cyclique PWM).
        st.winHigh += now - Math.max(st.rise, st.winStart);
        if (this.ultrasonic.length > 0) this.maybeFireEcho(pp.name, st.lastUs); // impulsion TRIG -> ECHO
      }
    }
  }

  setAnalog(name: string, fraction: number): void {
    const ch = adcChannel(name);
    if (ch === null) return;
    // rp2040js attend la valeur brute 12 bits du convertisseur.
    this.mcu.adc.channelValues[ch] = Math.round(Math.max(0, Math.min(1, fraction)) * 0xfff);
  }

  writeSerial(text: string): void {
    // MicroPython duplique son REPL sur UART0 (GP0/GP1) par défaut, en plus du
    // CDC USB : feeder aussi l'UART0 y déclenche un second REPL qui répond à
    // chaque frappe, doublant l'écho reçu par `onSerial` (deux origines pour
    // le même texte). Quand le CDC existe (firmware flash : MicroPython), il
    // est le seul canal du REPL interactif — l'UART0 ne reçoit que la sortie
    // des programmes qui l'utilisent, jamais nos frappes en entrée. Sans CDC
    // (programme C bare-metal en RAM), l'UART0 reste le seul canal série.
    for (const byte of new TextEncoder().encode(text)) {
      if (this.cdc) this.cdc.sendSerialByte(byte);
      else this.mcu.uart[0].feedByte(byte);
    }
  }

  start(): void {
    if (!this.sim.executing) this.sim.execute();
  }

  stop(): void {
    this.sim.stop();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.scheduled = [];
  }

  get paused(): boolean {
    return this.isPaused;
  }

  /** Vrai quand le script MicroPython instrumenté est en cours d'exécution. */
  private get scriptRunning(): boolean {
    return this.script !== null && this.replPhase === 'stdout';
  }

  pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    if (this.scriptRunning) {
      // Pause coopérative : \x05 (ENQ) sera traité au prochain appel __kx du
      // script instrumenté. Le firmware doit continuer à tourner pour lire
      // stdin — surtout pas de sim.stop() ici.
      this.cdc?.sendSerialByte(0x05);
    } else {
      // Programme C bare-metal (ou script pas encore lancé) : gel du simulateur.
      this.pausedByStop = true;
      this.sim.stop();
      this.onDebugPause?.({ variables: [] });
      this.onUpdate?.();
    }
  }

  resume(): void {
    if (!this.isPaused || this.disposed) return;
    this.isPaused = false;
    if (this.pausedByStop) {
      this.pausedByStop = false;
      this.sim.execute();
    } else {
      // \x07 (BEL) : __kx désactive le mode pas à pas et rend la main au script.
      this.cdc?.sendSerialByte(0x07);
    }
  }

  /** Un pas de débogage MicroPython (exposé via `step` en mode script). */
  private doStep(): void {
    if (this.disposed || !this.scriptRunning || this.pausedByStop) return;
    if (!this.isPaused) {
      // Première pause : équivalent d'une demande de pause, l'état arrivera
      // au prochain __kx.
      this.isPaused = true;
      this.cdc?.sendSerialByte(0x05);
    } else {
      // \x06 (ACK) : exécute une ligne puis publie le nouvel état.
      this.cdc?.sendSerialByte(0x06);
    }
  }

  setSpeed(_fraction: number): void {
    // rp2040js ne propose pas de régulation fine ; le ralenti n'est pas
    // disponible sur le Pico (pause/reprise et pas à pas restent possibles).
  }

  /**
   * Points d'arrêt MicroPython : la liste est retenue puis transmise au script
   * instrumenté via stdin (« \x10 {json} \n », ligne → condition ou null). Le
   * préambule __kx s'arrête à ces lignes même hors pas à pas, et ne suspend sur
   * une ligne conditionnelle que si l'expression Python est vraie. Si le script
   * n'est pas encore lancé, la liste sera envoyée dès qu'il atteint sa phase
   * d'exécution (cf. enterStdout).
   */
  setBreakpoints(breakpoints: Breakpoint[]): void {
    this.breakpoints = breakpoints.map((b) => ({ ...b }));
    if (this.scriptRunning) this.sendBreakpoints();
  }

  /** Envoie la liste courante des points d'arrêt au script (stdin du REPL). */
  private sendBreakpoints(): void {
    if (!this.cdc) return;
    // Objet JSON { "ligne": condition|null } : robuste aux conditions contenant
    // des virgules ; l'encodage JSON échappe tout caractère de contrôle, donc le
    // '\n' final reste un terminateur sûr.
    const map: Record<string, string | null> = {};
    for (const b of this.breakpoints) map[String(b.line)] = b.condition ?? null;
    const cmd = '\x10' + JSON.stringify(map) + '\n';
    for (const ch of cmd) this.cdc.sendSerialByte(ch.charCodeAt(0));
  }

  /**
   * Le script instrumenté entre en exécution : on lui transmet les points
   * d'arrêt déjà posés (ils n'ont pas pu l'être avant le démarrage) et, si une
   * pause avait été demandée entre-temps, on la réémet (\x05).
   */
  private enterStdout(): void {
    this.replPhase = 'stdout';
    if (this.breakpoints.length > 0) this.sendBreakpoints();
    if (this.isPaused && !this.pausedByStop) this.cdc?.sendSerialByte(0x05);
  }

  // --- USB-CDC : console MicroPython + injection raw REPL ---------------------
  private onCdcConnected(): void {
    if (!this.cdc) return;
    if (this.script) {
      // Ctrl-C ×2 : interrompt un éventuel main.py, puis Ctrl-A : raw REPL.
      this.replPhase = 'wait-raw';
      this.cdc.sendSerialByte(3);
      this.cdc.sendSerialByte(3);
      this.cdc.sendSerialByte(1);
    } else {
      // Affiche simplement l'invite REPL dans le moniteur.
      this.cdc.sendSerialByte(13);
      this.cdc.sendSerialByte(10);
    }
  }

  private onCdcData(buffer: Uint8Array): void {
    const text = Array.from(buffer, (b) => String.fromCharCode(b)).join('');
    if (this.replPhase === 'idle' || this.replPhase === 'done') {
      this.emitSerial(text);
      return;
    }
    for (const ch of text) this.handleReplChar(ch);
  }

  // --- Filtrage des séquences « \x1b<tag>{json}\n » ---------------------------
  // Les octets arrivent par paquets arbitraires : un petit tampon reconstitue
  // la séquence avant de décider de sa destination (panneau Variables, hôte
  // réseau) ; tout ce qui n'est pas une séquence connue retourne au moniteur.
  private static readonly ESC_TAGS = ['KX', 'NT'];

  private emitSerial(text: string): void {
    for (const ch of text) this.emitSerialChar(ch);
  }

  private emitSerialChar(ch: string): void {
    if (this.escBuf.length === 0) {
      if (ch === '\x1b') {
        this.escBuf = ch; // début possible d'une séquence
        return;
      }
      this.onSerial?.(ch);
      return;
    }
    this.escBuf += ch;
    const partialTag = this.escBuf.slice(1); // ce qui suit l'ESC
    if (this.escBuf.length < 3) {
      // Pas encore le tag complet : on poursuit tant qu'il peut amorcer un tag connu.
      if (!PicoEngine.ESC_TAGS.some((t) => t.startsWith(partialTag))) this.flushEscBuf();
      return;
    }
    const tag = this.escBuf.slice(1, 3);
    if (!PicoEngine.ESC_TAGS.includes(tag)) {
      this.flushEscBuf();
      return;
    }
    if (ch === '\n') {
      // Séquence complète : jamais affichée, dirigée selon le tag.
      const payload = this.escBuf.slice(3).replace(/\r$/, '');
      this.escBuf = '';
      if (tag === 'KX') this.handleKxLine(payload);
      else this.handleNetLine(payload);
      return;
    }
    if (this.escBuf.length > 1_048_576) this.flushEscBuf(); // garde-fou (corps réseau volumineux)
  }

  /** Restitue au moniteur un tampon qui n'était finalement pas une séquence connue. */
  private flushEscBuf(): void {
    const buf = this.escBuf;
    this.escBuf = '';
    this.onSerial?.(buf.slice(0, -1));
    // Le dernier caractère peut redémarrer une séquence : on le retraite.
    this.emitSerialChar(buf[buf.length - 1]);
  }

  /** Décode une requête réseau émise par le script et la relaie à l'hôte. */
  private handleNetLine(json: string): void {
    if (!this.onNetRequest) return;
    try {
      this.onNetRequest(JSON.parse(json) as NetRequest);
    } catch {
      // Requête malformée : ignorée (le script restera bloqué jusqu'au timeout hôte).
    }
  }

  /** Réinjecte la réponse réseau de l'hôte dans stdin du script (« \x1bNR{json}\n »). */
  sendNetResponse(response: NetResponse): void {
    if (!this.cdc) return;
    const cmd = '\x1bNR' + JSON.stringify(response) + '\n';
    for (const ch of cmd) this.cdc.sendSerialByte(ch.charCodeAt(0));
  }

  /** Décode un état de pause publié par __kx et le relaie au panneau Variables. */
  private handleKxLine(json: string): void {
    try {
      const data = JSON.parse(json) as { l?: number; v?: Record<string, string> };
      // Pause effective confirmée par le script (mode pas à pas actif).
      this.isPaused = true;
      this.pausedByStop = false;
      this.onDebugPause?.({
        line: typeof data.l === 'number' ? data.l : undefined,
        variables: Object.entries(data.v ?? {}).map(([name, value]) => ({
          name,
          value: String(value),
        })),
      });
      this.onUpdate?.();
    } catch {
      // Séquence malformée : ignorée (jamais relayée au moniteur).
    }
  }

  /** Petit automate qui suit le protocole raw REPL caractère par caractère. */
  private handleReplChar(ch: string): void {
    const byte = ch.charCodeAt(0);
    switch (this.replPhase) {
      case 'wait-raw':
        this.replBuffer += ch;
        // Invite du raw REPL : « raw REPL; CTRL-B to exit\r\n> »
        if (this.replBuffer.includes('raw REPL; CTRL-B to exit') && ch === '>') {
          this.replBuffer = '';
          // Demande le mode raw-paste (\x05A\x01) : son contrôle de flux évite
          // de déborder le tampon d'entrée avec un script long (préambule de
          // débogage compris), quel que soit le rythme de la simulation.
          this.replPhase = 'paste-hdr';
          this.pasteHdr = [];
          this.cdc?.sendSerialByte(0x05);
          this.cdc?.sendSerialByte(0x41);
          this.cdc?.sendSerialByte(0x01);
        }
        break;
      case 'paste-hdr':
        // Réponse attendue : 'R' 0x01 puis fenêtre initiale sur 2 octets (LE).
        this.pasteHdr.push(byte);
        if (this.pasteHdr.length === 2 && (this.pasteHdr[0] !== 0x52 || this.pasteHdr[1] !== 0x01)) {
          // Firmware sans raw-paste : repli sur l'envoi direct historique.
          this.replPhase = 'wait-ok';
          this.sendScript();
        } else if (this.pasteHdr.length === 4) {
          this.pasteIncrement = this.pasteHdr[2] | (this.pasteHdr[3] << 8);
          this.pasteWindow = this.pasteIncrement;
          this.sendPos = 0;
          this.scriptBytes = new TextEncoder().encode(this.script ?? '');
          this.replPhase = 'paste-stream';
          this.sendPasteChunk();
        }
        break;
      case 'paste-stream':
        if (byte === 0x01) {
          // Le firmware a consommé une fenêtre : il en accorde une nouvelle.
          this.pasteWindow += this.pasteIncrement;
          this.sendPasteChunk();
        } else if (byte === 0x04) {
          // Abandon côté firmware : on clôt proprement et on suit la sortie.
          this.cdc?.sendSerialByte(0x04);
          this.enterStdout();
        }
        break;
      case 'paste-ack':
        // Accusé de fin de données : la compilation puis l'exécution démarrent.
        if (byte === 0x04) this.enterStdout();
        break;
      case 'wait-ok':
        this.replBuffer += ch;
        if (this.replBuffer.endsWith('OK')) {
          this.replBuffer = '';
          this.enterStdout();
        }
        break;
      case 'stdout':
        if (ch === '\x04') this.replPhase = 'stderr';
        else this.emitSerial(ch);
        break;
      case 'stderr':
        if (ch === '\x04') {
          // Fin d'exécution : on repasse en REPL interactif (Ctrl-B).
          this.replPhase = 'done';
          this.cdc?.sendSerialByte(2);
          // Une pause coopérative ne peut plus aboutir : état remis au repos.
          if (this.isPaused && !this.pausedByStop) this.isPaused = false;
        } else {
          this.emitSerial(ch);
        }
        break;
      default:
        this.emitSerial(ch);
    }
  }

  /** Envoie le script dans la limite de la fenêtre accordée par le firmware. */
  private sendPasteChunk(): void {
    if (!this.cdc) return;
    while (this.pasteWindow > 0 && this.sendPos < this.scriptBytes.length) {
      this.cdc.sendSerialByte(this.scriptBytes[this.sendPos++]);
      this.pasteWindow--;
    }
    if (this.sendPos >= this.scriptBytes.length && this.replPhase === 'paste-stream') {
      this.cdc.sendSerialByte(0x04); // fin des données
      this.replPhase = 'paste-ack';
    }
  }

  /** Envoi direct (mode dégradé, firmwares sans raw-paste) : scripts courts. */
  private sendScript(): void {
    if (!this.cdc || !this.script) return;
    for (const byte of new TextEncoder().encode(this.script)) {
      this.cdc.sendSerialByte(byte);
    }
    this.cdc.sendSerialByte(4); // Ctrl-D : exécute
  }
}
