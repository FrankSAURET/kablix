// Moteur de simulation Raspberry Pi Pico : RP2040 (Pico, Pico W) ou RP2350
// (Pico 2, Pico 2 W). La puce elle-même vient de `rp-chip.mts`, qui masque les
// différences entre les deux bibliothèques d'émulation — tout ce qui suit est
// commun aux deux familles.
// Deux modes de chargement :
//   - 'ram'   : image bare-metal copiée en SRAM (sortie du compilateur intégré) ;
//   - 'flash' : firmware UF2/ELF programmé en flash + bootrom B1 (pico-sdk,
//               MicroPython…), avec USB-CDC et UART0 reliés au moniteur série.
// En mode flash, un script MicroPython optionnel est injecté via le raw REPL
// (Ctrl-A … Ctrl-D) dès que l'USB est énuméré.
import { ConsoleLogger, LogLevel } from 'rp2040js';
import {
  creerChip,
  GPIOPinState,
  type PicoCdc,
  type PicoChip,
  type PicoClock,
  type PicoFamily,
  type PicoCore,
  type PicoMcu,
} from './rp-chip.mjs';
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
import { SCOPE_LOG_MAX } from './types.mjs';
import { selectSpiDevice, Hd44780, type I2cDevice, type SpiDevice } from './i2c-devices.mjs';
import { Ws2812Decoder } from './ws2812.mjs';
import { DmxDecoder } from './dmx.mjs';
import { buildDht22Schedule, DHT22_START_LOW_US, type DhtModel, type DhtTransition } from './dht22.mjs';
import { DEFAULT_AIR_TEMP_C, echoUsPerCm } from './ultrasonic.mjs';

export type PicoProgram =
  | { kind: 'ram'; image: Uint8Array }
  | {
      kind: 'flash';
      segments: FlashSegment[];
      /** Script MicroPython tel quel : c'est lui qui tourne tant qu'on ne débogue pas. */
      script?: string;
      /**
       * Même script, instrumenté pour le pas à pas (`__kx`). Fourni : le moteur
       * démarre sur le script rapide et ne bascule sur celui-ci qu'au premier
       * point d'arrêt / pas à pas. Absent : `script` est supposé déjà instrumenté
       * (tests, appelants historiques) et sert aux deux usages.
       */
      scriptDebug?: string;
    };

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

// Rejeu silencieux (bascule vers le script instrumenté, cf. switchToDebug).
const REPLAY_TICK_MS = 1500; //     période de surveillance (relance du Ctrl-C)
const REPLAY_KICKS = 4; //          nombre de Ctrl-C avant d'abandonner l'interruption douce
const REPLAY_MAX_MS = 20_000; //    au-delà, le moniteur reprend la parole
const REPLAY_SPEED = 100; //        allocation de temps simulé pendant le rejeu (plein régime)
const REPLAY_BUF_MAX = 200_000; //  sortie retenue : seule la fin est restituée

// Cadencement : rattrapage borné (cf. scripts/vitesse-pico.md, piste #5).
// Avance (temps simulé, ms) à partir de laquelle on rend la main au navigateur.
const AHEAD_NAP_MS = 8;
// Retard (temps simulé, ms) à partir duquel le pacing repart de l'instant courant.
// Le manque n'est plus perdu pour autant : il passe en DETTE, remboursée plus tard.
const DEBT_STEP_MS = 50;
// Dette maximale conservée. Au-delà, la machine ne suit pas durablement : mieux
// vaut assumer le retard que faire courir la simulation pendant des minutes. Un
// écart PLUS GRAND QUE ÇA d'un seul coup n'est pas un manque de puissance mais un
// gel de la page (onglet caché, veille, ouverture d'une modale) : rien à rattraper.
const MAX_DEBT_MS = 2000;
// Régime maximal pendant le remboursement : 1,25 = la simulation avance au plus
// 25 % plus vite que le temps réel. Rembourser d'un coup se VERRAIT — un
// time.sleep() écourté, une LED qui clignote deux fois trop vite.
const CATCHUP = 1.25;

/**
 * Boucle de simulation au cadencement optimisé. Celle de rp2040js appelle
 * `clock.tick()` et re-teste l'arrêt à CHAQUE instruction, puis rend la main
 * par `setTimeout(0)` (clampé à ~4 ms par Chrome sur les timers imbriqués).
 * Ici : lots d'instructions bornés par la prochaine alarme (les échéances
 * restent exactes — le lot s'arrête pile dessus) et yield par MessageChannel
 * (macrotâche sans clampage). Mesuré : ≈ +16 % de débit en node, davantage en
 * webview. Le profil restant est ~50 % dans `executeInstruction` (interpréteur
 * ARM) — plafond de l'émulation.
 *
 * L'exécution proprement dite est déléguée à la puce (cf. rp-chip.mts) : un
 * appel par LOT, pas un par instruction.
 */
class KablixSimulator {
  /** La puce simulée — RP2040 ou RP2350 selon la carte. */
  readonly chip: PicoChip;
  readonly clock: PicoClock;
  /** Vrai tant que la boucle ne tourne pas (lu par la puce pendant un lot). */
  stopped = true;
  executeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Génération de planification : invalide les yields MessageChannel en vol. */
  private gen = 0;
  private readonly port: MessagePort;
  // Cadencement temps réel : ancre temps réel ↔ temps simulé. Sans elle, les
  // périodes où le cœur dort (WFE + saut d'alarme) s'écouleraient quasi
  // instantanément — un time.sleep(0.5) semblerait durer 0 s. Inversement le
  // code calculatoire reste sous le temps réel (plafond de l'interpréteur) : le
  // retard est mis en DETTE et remboursé pendant les accalmies (cf. debtMs).
  private paceWall = 0;
  private paceSim = 0;
  /**
   * Temps simulé (ms) que le moteur DOIT à l'horloge du programme. Le pacing
   * repart de l'instant courant dès 50 ms de retard, sinon les sleep suivants
   * seraient escamotés d'un coup pour rattraper ; mais le manque était jusqu'ici
   * effacé, et une horloge Pico retardait d'autant, définitivement. Il est
   * désormais noté ici puis rendu à raison de CATCHUP pendant les siestes — une
   * minute reste une minute tant que la charge MOYENNE passe.
   */
  private debtMs = 0;
  /**
   * Facteur de vitesse demandé (menu 🐌…🦅). Il agit sur l'ALLOCATION de temps
   * simulé : à 0,1 le cœur n'a droit qu'à 0,1 ms simulée par ms réelle, donc il
   * dort entre deux tranches. Au-dessus de 1× c'est une simple autorisation :
   * l'interpréteur MicroPython plafonne de toute façon autour du temps réel, et
   * le retard irrattrapable ré-ancre sans dette — pas d'emballement.
   */
  speed = 1;
  /** Actions à échéance en cycles CPU simulés (ex. ECHO ultrason) — cf. PicoEngine. */
  onTick: (() => void) | null = null;
  /** Échéance (temps simulé, ns) de la plus proche action programmée par `onTick`, ou null. */
  nextScheduledNanos: number | null = null;
  /** Borne du lot en cours (ns simulées) — pour savoir si une échéance posée en plein lot arrive avant sa fin. */
  finLotNanos = Infinity;
  /** cf. `Arret.coupeLot` : demande à la boucle chaude de rendre la main sans finir le lot. */
  coupeLot = false;
  /** Temps réel cumulé passé DANS la boucle (ms) — diagnostic, cf. SimEngine.busyMs. */
  busyAccum = 0;

  constructor(famille: PicoFamily) {
    this.chip = creerChip(famille, this);
    this.clock = this.chip.clock;
    this.chip.surBreak(() => this.stop()); // BKPT : arrêt du simulateur
    const ch = new MessageChannel();
    this.port = ch.port1;
    ch.port2.onmessage = (e: MessageEvent) => {
      if (e.data === this.gen && !this.stopped) this.execute();
    };
  }

  get executing(): boolean {
    return !this.stopped;
  }

  stop(): void {
    this.stopped = true;
    if (this.executeTimer != null) {
      clearTimeout(this.executeTimer);
      this.executeTimer = null;
    }
    this.gen++; // un yield déjà posté ne relancera pas la boucle
  }

  /** Repart d'ici sans dette (changement de vitesse : l'ancre d'avant ne vaut plus). */
  reanchor(): void {
    this.paceWall = Date.now();
    this.paceSim = this.clock.nanos;
    this.debtMs = 0;
  }

  /** Retard cumulé non encore remboursé (ms simulées) — diagnostic, cf. SimEngine.lagMs. */
  get lag(): number {
    return this.debtMs;
  }

  execute(): void {
    const { chip, clock } = this;
    this.executeTimer = null;
    this.stopped = false;
    const busyStart = performance.now();
    const deadline = Date.now() + 16; // budget réel par tranche (fluidité UI)
    let idle = false;
    let napMs = 0; // simulation en avance sur le réel : durée à laisser passer
    while (!this.stopped) {
      const now = Date.now();
      if (now >= deadline) break;
      const aheadMs = (clock.nanos - this.paceSim) / 1e6 - (now - this.paceWall) * this.speed;
      if (aheadMs > AHEAD_NAP_MS) {
        // `aheadMs` est en temps SIMULÉ : la sieste correspondante en temps réel
        // dure d'autant plus longtemps que le ralenti est fort (÷ speed).
        napMs = Math.min((aheadMs - 4) / this.speed, 40);
        if (this.debtMs > 0) {
          // Accalmie (le programme dort) : c'est le SEUL moment où du temps est
          // disponible pour rembourser — quand il calcule, l'interpréteur est
          // déjà au plafond. On ne raccourcit PAS la sieste : sur Windows un
          // setTimeout de quelques ms dérive déjà de plus que ce qu'on lui
          // retrancherait (mesuré : remboursement nul). On décale l'ancre, ce
          // qui remet le moteur « en retard » : au réveil il comble tout seul,
          // et vite, puisque le temps endormi s'obtient par sauts d'alarme —
          // gratuits. Le montant injecté par sieste plafonne le régime à CATCHUP.
          const repay = Math.min(this.debtMs, napMs * (1 - 1 / CATCHUP) * this.speed);
          this.debtMs -= repay;
          this.paceSim += repay * 1e6;
        }
        break;
      }
      if (aheadMs < -DEBT_STEP_MS) {
        const late = -aheadMs;
        this.debtMs = late > MAX_DEBT_MS ? 0 : Math.min(this.debtMs + late, MAX_DEBT_MS);
        this.paceWall = now;
        this.paceSim = clock.nanos;
      }
      if (chip.dort()) {
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
        chip.sauter(n);
        this.onTick?.();
      } else {
        // Lot d'instructions ≤ 1 ms simulée, borné par la prochaine échéance
        // programmée (ECHO ultrason…) : au-delà, le pacing et les actions
        // programmées ont besoin de reprendre la main.
        const fin = Math.min(clock.nanos + 1e6, this.nextScheduledNanos ?? Infinity);
        this.finLotNanos = fin;
        chip.executerLot(fin);
        this.onTick?.();
      }
    }
    this.busyAccum += performance.now() - busyStart;
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
  onRunning: (() => void) | null = null;
  onNetRequest: ((req: NetRequest) => void) | null = null;
  /**
   * Bascule vers le script instrumenté (cf. switchToDebug) : 'start' quand le
   * programme est relancé en mode débogage, 'end' quand le rejeu silencieux
   * s'achève (point d'arrêt atteint, fin du programme ou délai dépassé). Sert au
   * message affiché dans le moniteur — le texte traduit est du ressort de l'UI.
   */
  onDebugRestart: ((phase: 'start' | 'end') => void) | null = null;

  /** Pas à pas : défini uniquement en mode script MicroPython (cf. constructeur). */
  step?: () => void;

  private isPaused = false;
  private disposed = false;
  private sim: KablixSimulator;
  private mcu: PicoMcu;
  /**
   * Le cœur 0 — celui qui exécute le programme de l'utilisateur. Il vient de la
   * puce (`PicoChip.core`) et non de `mcu.core` : le RP2350 en a DEUX, et son
   * `core` est un tableau. Le compteur de cycles qu'on lit ici cadence tout ce
   * qui se mesure en cycles (temps écoulé, périodes PWM, durées DHT/ultrason).
   */
  private core: PicoCore;
  /** Décodeurs DMX512 par broche TX déclarée (cf. setDmx) — vide en temps normal. */
  private dmxByPin = new Map<string, DmxDecoder>();
  /** Décodeur DMX de chaque UART matériel, indexé 0/1. */
  private dmxByUart: Array<DmxDecoder | null> = [];
  /** Canaux ADC dont la tension est CALCULÉE à la conversion (cf. setAnalogSampler). */
  private analogSamplers = new Map<number, () => number>();
  private cdc: PicoCdc | null = null;
  /** Script actuellement injecté (brut au départ, instrumenté après bascule). */
  private script: string | null = null;
  /** Variante instrumentée, gardée sous le coude jusqu'au premier point d'arrêt. */
  private debugSource: string | null = null;
  /** Vrai quand le script injecté est la variante instrumentée (débogage possible). */
  private instrumented = false;
  /** Bascule demandée : le script brut a reçu Ctrl-C, on réinjecte dès qu'il rend la main. */
  private pendingDebug = false;
  /** Rejeu silencieux : la sortie du redémarrage est retenue au lieu d'être affichée. */
  private silentReplay = false;
  private replayBuf = '';
  private replayTimer: ReturnType<typeof setTimeout> | null = null;
  private replayKicks = 0;
  private replayDeadline = 0;
  /** Vitesse demandée par l'utilisateur, restaurée après le rejeu (qui tourne à fond). */
  private speedFraction = 1;
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
  // Rapport cyclique (readPwmDuty) : intégré sur des PÉRIODES COMPLÈTES, d'un
  // front montant au suivant — cf. le même mécanisme dans avr.mts. Mesurer sur
  // une fenêtre quelconque laissait une période tronquée à chaque bout, et la
  // luminosité affichée oscillait de quelques pour cent d'une image à l'autre.
  private pulseState = new Map<
    string,
    {
      high: boolean; rise: number; lastUs: number; lastEdge: number;
      perStart: number; curHigh: number; accHigh: number; accTotal: number;
      lastPeriod: number; lastRead: number; lastDuty: number;
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
  private keypadPinLevel = new Map<string, boolean>();
  private spiDevices: SpiDevice[] = [];
  private spiSelected = new Map<SpiDevice, boolean>();
  // Capteurs ultrason (HC-SR04) : impulsion TRIG (mesurée comme un pulseMonitor)
  // -> ECHO programmé en TEMPS SIMULÉ (nanosecondes horloge RP2040), vérifié à
  // chaque avance de `KablixSimulator.execute()` via `sim.onTick`. Un setTimeout
  // réel serait faux : le simulateur peut avancer de dizaines de ms simulées
  // pendant qu'un timer JS de 0,2 ms met plusieurs ms réelles à se déclencher
  // (résolution des timers Node/navigateur) — l'ECHO arrivait après la fenêtre
  // d'attente du firmware (pulseIn/boucle bornée).
  private ultrasonic: UltrasonicSensor[] = [];
  // `suite` : les fronts qui suivent celui-ci, dates en RELATIF (ns apres son
  // application reelle). Cf. fireScheduled — les dater en absolu amputait
  // l'impulsion du retard du premier front.
  private scheduled: Array<{
    nanos: number; name: string; value: boolean;
    suite?: Array<{ apres: number; value: boolean }>;
    // Instant reel d'application de la TETE de la trame : toute la suite s'y
    // rapporte, front apres front, sans jamais recompter le retard des lots.
    base?: number;
  }> = [];
  // Capteurs DHT22 : même principe que l'ECHO ultrason (signal de départ détecté
  // en broche, réponse programmée en temps simulé). La broche est au repos HAUT
  // (pull-up) ; le MCU la tire BAS ≥ 500 µs pour démarrer une mesure.
  private dht22: Array<{
    pin: string; index: number; tempC: number; humidity: number; model: DhtModel;
    wasLow: boolean; lowStartNanos: number; busyUntilNanos: number;
  }> = [];

  constructor(program: PicoProgram, famille: PicoFamily = 'rp2040') {
    this.sim = new KablixSimulator(famille);
    this.sim.onTick = () => this.fireScheduled();
    this.mcu = this.sim.chip.mcu;
    this.core = this.sim.chip.core;
    this.mcu.logger = new ConsoleLogger(LogLevel.Error);
    this.sim.chip.patcherRelectureSortie();
    // Échantillonnage à l'instant EXACT de la conversion (cf. setAnalogSampler) :
    // la tension du canal est recalculée juste avant la lecture par défaut.
    {
      const defaultRead = this.mcu.adc.onADCRead;
      this.mcu.adc.onADCRead = (channel: number): void => {
        const sample = this.analogSamplers.get(channel);
        if (sample) this.mcu.adc.channelValues[channel] = Math.round(Math.max(0, Math.min(1, sample())) * 0xfff);
        defaultRead(channel);
      };
    }

    if (program.kind === 'ram') {
      this.sim.chip.chargerRam(program.image);
    } else {
      this.sim.chip.chargerFlash(program.segments);
      this.script = program.script ?? null;
      this.debugSource = program.scriptDebug ?? null;
      // Sans variante instrumentée fournie, le script reçu EST la version de
      // débogage (appelants historiques et tests) : pas de bascule à prévoir.
      this.instrumented = this.debugSource === null;
      // Le pas à pas n'existe qu'en mode script MicroPython.
      if (this.script) this.step = () => this.doStep();

      this.cdc = this.sim.chip.creerCdc({
        onData: (buffer) => this.onCdcData(buffer),
        onConnected: () => this.onCdcConnected(),
      });

      this.sim.chip.demarrer();
    }

    for (const pin of this.mcu.gpio) {
      pin.addListener(() => {
        this.samplePulses();
        this.sampleNeopixels();
        this.sampleLcdParallel();
        this.sampleDht22();
        this.sampleSpiSelect();
        this.applyKeypads();
        this.onUpdate?.();
      });
    }
    // UART0 relié au moniteur série (programmes C bare-metal / pico-sdk).
    // Décodage UTF-8 incrémental (caractères accentués émis octet par octet).
    const uartDecoder = new TextDecoder('utf-8');
    this.mcu.uart[0].onByte = (value) => {
      // Ligne DMX512 sur GP0 (cf. setDmx) : l'octet part au décodeur et S'ARRÊTE
      // LÀ. Une trame DMX, ce sont 513 octets binaires : les relayer noierait le
      // moniteur série sous des caractères de contrôle. `dmxByUart` est vide en
      // temps normal, le moniteur reprend son cours.
      if (this.dmxByUart[0]) {
        this.dmxByUart[0].feed(value, this.simulatedMs() * 1000);
        return;
      }
      const text = uartDecoder.decode(Uint8Array.of(value), { stream: true });
      if (text) this.onSerial?.(text);
    };
    // UART1 : pas de moniteur (le REPL n'y passe pas), branché seulement si une
    // ligne DMX y est déclarée.
    if (this.mcu.uart[1]) {
      this.mcu.uart[1].onByte = (value) => {
        this.dmxByUart[1]?.feed(value, this.simulatedMs() * 1000);
      };
    }
  }

  /**
   * Broches TX qui portent une ligne DMX512 (cf. SimEngine.setDmx). GP0 et GP4
   * sont les TX des deux UART matériels tels que le shield Grove les câble.
   */
  setDmx(pins: string[]): void {
    const TX: Record<string, number | undefined> = { GP0: 0, GP12: 0, GP16: 0, GP4: 1, GP8: 1, GP20: 1 };
    const garde = new Map<string, DmxDecoder>();
    this.dmxByUart = [];
    for (const pin of pins) {
      const uart = TX[pin];
      if (uart === undefined) continue; // broche sans UART matériel : rien à décoder
      const dec = this.dmxByPin.get(pin) ?? new DmxDecoder();
      garde.set(pin, dec);
      this.dmxByUart[uart] = dec;
    }
    this.dmxByPin = garde;
  }

  /** Univers DMX512 décodé sur une broche TX (cf. SimEngine.readDmx). */
  readDmx(pin: string): Uint8Array | null {
    return this.dmxByPin.get(pin)?.universe ?? null;
  }

  /** Univers DMX qui ont changé depuis le dernier relevé (publication worker). */
  takeDmxChanges(): Array<{ pin: string; data: Uint8Array }> {
    const out: Array<{ pin: string; data: Uint8Array }> = [];
    for (const [pin, dec] of this.dmxByPin) {
      const data = dec.takeChanged();
      if (data) out.push({ pin, data });
    }
    return out;
  }

  /**
   * Temps simulé depuis le démarrage, en ms — l'horloge de la PUCE, celle qui
   * commande tout le reste : alarmes, minuteries, SysTick, et le cadencement
   * qui tient la simulation à l'heure réelle.
   *
   * Elle se lisait avant sur le compteur de cycles du cœur (`cycles ÷ clkSys`).
   * Ce compteur avance à côté : le cœur ajoute des cycles que la boucle ne
   * retique pas — mesuré ~6 % de trop sur Pico 1. Le cadencement tenant, lui,
   * l'horloge de la puce à l'heure, le pourcentage affiché se stabilisait
   * au-dessus de 100 % (116 % relevé sur ili9341-pico) et le chronomètre
   * comptait une minute trop courte, alors que rien ne ramait.
   */
  simulatedMs(): number {
    return this.sim.chip.clock.nanos / 1e6;
  }

  /** Temps réel cumulé passé dans la boucle du moteur (ms) — voir SimEngine.busyMs. */
  busyMs(): number {
    return this.sim.busyAccum;
  }

  /** Retard simulé encore dû à l'horloge du programme (ms) — voir SimEngine.lagMs. */
  lagMs(): number {
    return this.sim.lag;
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

  /** Ce que le cœur impose sur la broche (voir SimEngine.readPinDrive). */
  readPinDrive(name: string): 'high' | 'low' | 'pullup' | 'pulldown' | 'hiz' {
    const i = gpioIndex(name);
    if (i === null) return 'hiz';
    switch (this.mcu.gpio[i].value) {
      case GPIOPinState.High:
        return 'high';
      case GPIOPinState.Low:
        return 'low';
      case GPIOPinState.InputPullUp:
        return 'pullup';
      case GPIOPinState.InputPullDown:
        return 'pulldown';
      default:
        return 'hiz'; // Input / InputBusKeeper : rien d'imposé au réseau extérieur
    }
  }

  setInput(name: string, value: boolean): void {
    const i = gpioIndex(name);
    if (i === null) return;
    this.mcu.gpio[i].setInputValue(value);
  }

  setKeypads(keypads: KeypadConfig[]): void {
    this.keypads = keypads;
    this.keypadPinLevel.clear();
    // Lignes ET colonnes au repos = HAUT (pull-up) : le code peut balayer dans un
    // sens comme dans l'autre, les deux côtés doivent partir au repos.
    for (const kp of keypads) {
      for (const row of kp.rows) if (row) this.setInput(row, true);
      for (const col of kp.cols) if (col) this.setInput(col, true);
    }
  }

  /**
   * Réévalue les contacts du clavier hors front GPIO : appelée quand l'utilisateur
   * appuie/relâche une touche. Sans elle, une touche enfoncée alors que sa ligne
   * est déjà basse (cas courant en pas à pas, où plus rien ne bouge entre deux
   * pas) n'était vue qu'au balayage suivant — jamais en pas à pas.
   */
  syncKeypads(): void {
    this.applyKeypads();
  }

  /** Vrai si la broche est PILOTÉE à LOW (sortie basse), pas seulement flottante. */
  private pinDrivenLow(name: string): boolean {
    const i = gpioIndex(name);
    if (i === null) return false;
    return this.mcu.gpio[i].value === GPIOPinState.Low;
  }

  /**
   * Recalcule le niveau des broches du clavier. Une touche enfoncée est un contact
   * entre sa ligne et sa colonne : le balayage marche dans les DEUX sens (ligne
   * pilotée BASSE et lecture des colonnes, ou l'inverse comme la bibliothèque
   * Keypad d'Arduino). On tire donc le côté non piloté vers le côté piloté à LOW.
   * Les broches en haute impédance sont ignorées (pas de touche fantôme).
   * Garde-fou de ré-entrance (setInput redéclenche l'écouteur de broche).
   */
  private applyKeypads(): void {
    if (this.keypads.length === 0 || this.applyingKeypads) return;
    this.applyingKeypads = true;
    try {
      for (const kp of this.keypads) {
        const low = new Set<string>(); // broches tirées à LOW par un contact
        for (const key of kp.pressed) {
          const [r, c] = key.split(',').map(Number);
          const row = kp.rows[r];
          const col = kp.cols[c];
          if (!row || !col) continue;
          if (this.pinDrivenLow(row)) low.add(col);
          if (this.pinDrivenLow(col)) low.add(row);
        }
        for (const name of [...kp.rows, ...kp.cols]) {
          if (!name) continue;
          const level = !low.has(name);
          if (this.keypadPinLevel.get(name) !== level) {
            this.keypadPinLevel.set(name, level);
            this.setInput(name, level);
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
        // General Call (0x00) : dirigé vers le 1er device qui l'accepte (SWRST
        // du PCA9685). Un NAK sur 0x00 perturberait le bus rp2040js simulé (EIO
        // sur la transaction suivante), même quand le pilote encadre le reset.
        if (address === 0) {
          current = devices.find((d) => d.generalCall) ?? null;
          current?.setGeneralCall?.(true);
        } else {
          current = devices.find((d) => d.address === address) ?? null;
          current?.setGeneralCall?.(false);
        }
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

  // Sonde d'oscilloscope (cf. avr.mts) : chaque bascule datée au cycle près,
  // à plat dans un journal que la page vide à chaque image.
  private scopePins = new Set<string>();
  private scopeLog = new Map<string, number[]>();

  setPulseMonitors(names: string[]): void {
    this.pulsePins = [];
    for (const name of names) {
      const i = gpioIndex(name);
      if (i === null) continue;
      this.pulsePins.push({ name, index: i });
      if (!this.pulseState.has(name)) {
        this.pulseState.set(name, {
          high: false, rise: 0, lastUs: 0, lastEdge: 0,
          perStart: -1, curHigh: 0, accHigh: 0, accTotal: 0,
          lastPeriod: 0, lastRead: this.core.cycles, lastDuty: 0,
        });
      }
    }
  }

  setDht22(sensors: Dht22Sensor[]): void {
    const before = this.dht22;
    this.dht22 = [];
    for (const s of sensors) {
      const i = gpioIndex(s.pin);
      if (i === null) continue;
      // Curseur bougé pendant une lecture : mise à jour du moniteur existant. Le
      // recréer coupait la trame en cours (état de détection perdu + ligne
      // reforcée à HAUT) et la lecture ratait — cf. avr.mts, même correctif (v205).
      const prev = before.find((d) => d.pin === s.pin);
      if (prev) {
        prev.tempC = s.temperatureC;
        prev.humidity = s.humidity;
        prev.model = s.model ?? 'dht22';
        this.dht22.push(prev);
        continue;
      }
      this.dht22.push({
        pin: s.pin, index: i, tempC: s.temperatureC, humidity: s.humidity,
        model: s.model ?? 'dht22',
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
          const sched: DhtTransition[] = buildDht22Schedule(d.tempC, d.humidity, startCycles, cyclesPerUs, d.model);
          // Tout le train de bits pend au PREMIER front : ses durees sont ce que
          // le firmware decode, et elles ne doivent pas dependre du retard
          // avec lequel la reponse demarre.
          const [tete, ...reste] = sched;
          if (tete) {
            this.scheduled.push({
              nanos: tete.cycle * nanosPerCycle,
              name: d.pin,
              value: tete.value,
              suite: reste.map((ev) => ({ apres: (ev.cycle - tete.cycle) * nanosPerCycle, value: ev.value })),
            });
          }
          const last = sched[sched.length - 1];
          d.busyUntilNanos = last ? last.cycle * nanosPerCycle : nowNanos;
        }
      }
    }
    this.updateNextScheduled();
  }

  /**
   * Suite de fronts sur une broche (trame série d'une carte RFID…) : seul le
   * premier entre dans la file, les autres suivent — et `updateNextScheduled`
   * empêche le moteur de sauter par-dessus l'échéance.
   */
  emitPulses(pin: string, edges: Array<{ afterUs: number; level: boolean }>): void {
    if (edges.length === 0) return;
    const NANOS_PAR_US = 1000;
    const [premier, ...reste] = edges;
    // Les fronts d'une trame arrivent en ecarts d'un front au suivant ; la file,
    // elle, date tout depuis la tete (comme le DHT et l'ultrason). Le cumul se
    // fait donc ici, une fois pour toutes.
    let cumul = 0;
    this.scheduled.push({
      nanos: this.sim.clock.nanos + Math.max(0, premier.afterUs) * NANOS_PAR_US,
      name: pin,
      value: premier.level,
      suite: reste.map((e) => {
        cumul += Math.max(0, e.afterUs) * NANOS_PAR_US;
        return { apres: cumul, value: e.level };
      }),
    });
    this.updateNextScheduled();
  }

  setUltrasonic(sensors: UltrasonicSensor[]): void {
    // La page rappelle cette méthode à CHAQUE coup de curseur : quand le moteur
    // tourne sur son propre fil, les capteurs lui arrivent par recopie, donc la
    // distance mutée dans la page ne le rejoint jamais autrement (elle restait
    // figée sur la valeur de départ, 20 cm). On ne jette donc que les échos des
    // capteurs qui DISPARAISSENT : vider tout couperait l'écho en cours à chaque
    // mouvement du curseur, et `scheduled` porte aussi les trames DHT22.
    const restent = new Set(sensors.map((s) => s.echo));
    const partis = new Set(this.ultrasonic.map((s) => s.echo).filter((e) => !restent.has(e)));
    if (partis.size > 0) {
      this.scheduled = this.scheduled.filter((a) => !partis.has(a.name));
      this.updateNextScheduled(); // la prochaine échéance vient peut-être de partir
    }
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
          perStart: -1, curHigh: 0, accHigh: 0, accTotal: 0,
          lastPeriod: 0, lastRead: this.core.cycles, lastDuty: 0,
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
      // Durée d'écho = distance × µs/cm, ce dernier VARIANT AVEC LA TEMPÉRATURE
      // (vitesse du son). 20 °C → 58,24 µs/cm, la constante des exemples Arduino.
      const usPerCm = echoUsPerCm(s.temperatureC ?? DEFAULT_AIR_TEMP_C);
      const widthNanos = cm * usPerCm * cyclesPerUs * nanosPerCycle;
      // Le front descendant est date depuis le montant REEL, pas depuis
      // `startNanos` : c'est la LARGEUR qui porte la distance.
      this.scheduled.push({
        nanos: startNanos, name: s.echo, value: true,
        suite: [{ apres: widthNanos, value: false }],
      });
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
        // Un lot d'instructions ne s'interrompt pas au milieu : quand une
        // echeance est posee PENDANT un lot (fin d'impulsion TRIG detectee par
        // un ecouteur GPIO), la borne `nextScheduledNanos` n'est prise en compte
        // qu'au lot suivant et le front part avec jusqu'a ~1 ms de retard.
        // Les fronts suivants, eux, tombaient pile : l'impulsion perdait ce
        // retard sur sa largeur (echo HC-SR04 lu 5,2 ms au lieu de 5,8, et
        // sautant de 300 us d'un tir a l'autre). D'ou le report en relatif.
        // Un seul front attend a la fois : une trame serie en compte des
        // centaines, et les empiler tous les ferait relire apres CHAQUE
        // instruction. L'instant de depart voyage avec la suite (`base`), si
        // bien que les dates restent celles de la tete : sans lui, le retard
        // d'un lot s'ajouterait a chaque front et la trame s'etirerait.
        const suite = a.suite;
        if (suite && suite.length > 0) {
          const base = a.base ?? now;
          const [prochain, ...reste] = suite;
          this.scheduled.push({
            nanos: base + prochain.apres, name: a.name, value: prochain.value, suite: reste, base,
          });
        }
      }
    }
    this.updateNextScheduled();
  }

  /** Tient `sim.nextScheduledNanos` à jour (borne le lot d'instructions suivant). */
  private updateNextScheduled(): void {
    const prochaine =
      this.scheduled.length === 0 ? null : Math.min(...this.scheduled.map((a) => a.nanos));
    this.sim.nextScheduledNanos = prochaine;
    // Posée en plein lot et due AVANT sa fin : le lot doit s'arrêter là, sinon
    // le front sortirait avec le retard restant (jusqu'à 1 ms). C'est ce qui
    // faisait échouer les DHT : le capteur répond 30 µs après le relâchement de
    // la ligne, et le firmware n'attend l'accusé de réception que 100 µs.
    if (prochaine !== null && prochaine < this.sim.finLotNanos) this.sim.coupeLot = true;
  }

  setSpiDevices(devices: SpiDevice[]): void {
    this.spiDevices = devices;
    this.spiSelected.clear();
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

  /**
   * Surveille les broches CS pour prévenir les périphériques qui le demandent
   * (`onSelect`) — la carte SD s'en sert pour repartir d'une trame propre.
   */
  private sampleSpiSelect(): void {
    for (const dev of this.spiDevices) {
      if (!dev.onSelect || !dev.csPin) continue;
      const on = !this.readDigital(dev.csPin); // CS actif bas
      if (this.spiSelected.get(dev) === on) continue;
      this.spiSelected.set(dev, on);
      dev.onSelect(on);
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
    const now = this.core.cycles;
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

  setScopeProbes(names: string[]): void {
    this.scopePins = new Set(names);
    for (const name of this.scopeLog.keys()) {
      if (!this.scopePins.has(name)) this.scopeLog.delete(name);
    }
  }

  drainScopeEdges(): Record<string, number[]> {
    if (this.scopeLog.size === 0) return {};
    const out: Record<string, number[]> = {};
    for (const [name, log] of this.scopeLog) {
      if (log.length > 0) out[name] = log.splice(0, log.length);
    }
    return out;
  }

  /** Note une bascule de broche sondée, datée en ms simulées. */
  private noteScopeEdge(name: string, high: boolean): void {
    let log = this.scopeLog.get(name);
    if (!log) {
      log = [];
      this.scopeLog.set(name, log);
    }
    log.push(this.simulatedMs(), high ? 1 : 0);
    if (log.length > SCOPE_LOG_MAX) log.splice(0, log.length - SCOPE_LOG_MAX);
  }

  /**
   * Vrai si la broche OSCILLE : au moins une période complète mesurée, et un
   * front il y a moins de 60 ms simulées (cf. avr.mts). Un front isolé —
   * `digitalWrite` — ne fait pas un signal carré.
   */
  pulseActive(name: string): boolean {
    const st = this.pulseState.get(name);
    if (!st || st.lastPeriod === 0) return false;
    const cyclesPerUs = (this.mcu.clkSys || 125_000_000) / 1_000_000;
    return this.core.cycles - st.lastEdge < 60_000 * cyclesPerUs;
  }

  /**
   * Rapport cyclique (0..1) des périodes PWM COMPLÈTES écoulées depuis la
   * dernière lecture (cf. avr.mts). Sortie figée — plus de front pendant deux
   * périodes, ou 100 ms sans qu'aucune période n'ait été mesurée : on retombe
   * sur le niveau de la broche.
   */
  readPwmDuty(name: string): number {
    const st = this.pulseState.get(name);
    if (!st) return this.readDigital(name) ? 1 : 0;
    const cyclesPerUs = (this.mcu.clkSys || 125_000_000) / 1_000_000;
    const now = this.core.cycles;
    // Sortie figée : l'état présent prime sur le cumul du régime précédent (cf. avr.mts).
    const fige =
      st.lastPeriod > 0
        ? now - st.lastEdge > 2 * st.lastPeriod
        : now - st.lastRead > 100_000 * cyclesPerUs;
    if (fige) {
      st.accHigh = 0;
      st.accTotal = 0;
      st.perStart = -1;
      st.curHigh = 0;
      st.lastPeriod = 0;
      st.lastRead = now;
      st.lastDuty = st.high ? 1 : 0;
      return st.lastDuty;
    }
    if (st.accTotal > 0) {
      st.lastDuty = Math.max(0, Math.min(1, st.accHigh / st.accTotal));
      st.accHigh = 0;
      st.accTotal = 0;
      st.lastRead = now;
    }
    return st.lastDuty;
  }

  /** Mesure la durée de l'état haut sur les broches surveillées (servo). */
  private samplePulses(): void {
    if (this.pulsePins.length === 0) return;
    const cyclesPerUs = (this.mcu.clkSys || 125_000_000) / 1_000_000;
    const now = this.core.cycles;
    for (const pp of this.pulsePins) {
      const high = this.mcu.gpio[pp.index].value === GPIOPinState.High;
      const st = this.pulseState.get(pp.name);
      if (!st) continue;
      // Oscilloscope : la bascule est notée avant tout le reste (cf. avr.mts).
      if (high !== st.high && this.scopePins.has(pp.name)) {
        this.noteScopeEdge(pp.name, high);
      }
      if (high && !st.high) {
        st.high = true;
        st.rise = now;
        st.lastEdge = now; // front montant : activité
        // Front montant = période PWM close (readPwmDuty) et début de la suivante.
        if (st.perStart >= 0) {
          // Période dont la durée n'a rien à voir avec la précédente = changement
          // de régime (cf. avr.mts) : elle est sautée, pas moyennée.
          const per = now - st.perStart;
          if (st.lastPeriod === 0 || (per <= 2 * st.lastPeriod && per * 2 >= st.lastPeriod)) {
            st.accTotal += per;
            st.accHigh += st.curHigh;
          }
          st.lastPeriod = per;
        }
        st.perStart = now;
        st.curHigh = 0;
      } else if (!high && st.high) {
        st.high = false;
        st.lastEdge = now; // front descendant
        st.lastUs = (now - st.rise) / cyclesPerUs;
        st.curHigh += now - st.rise; // temps haut de la période en cours
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

  /** cf. SimEngine.setAnalogSampler — la tension est relue à l'instant exact de la conversion. */
  setAnalogSampler(name: string, sample: (() => number) | null): void {
    const ch = adcChannel(name);
    if (ch === null) return;
    if (sample) this.analogSamplers.set(ch, sample);
    else this.analogSamplers.delete(ch);
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
    // Un script serveur (socket.listen) a fait ouvrir un vrai port à l'hôte.
    // Le script meurt ici sans pouvoir refermer quoi que ce soit : c'est au
    // moteur de le dire, sinon le port survit à la simulation.
    this.onNetRequest?.({ id: 0, op: 'unlisten' });
    if (this.replayTimer !== null) {
      clearTimeout(this.replayTimer);
      this.replayTimer = null;
    }
    this.silentReplay = false;
    this.scheduled = [];
  }

  get paused(): boolean {
    return this.isPaused;
  }

  /** Vrai quand le script MicroPython instrumenté est en cours d'exécution. */
  private get scriptRunning(): boolean {
    return (
      this.script !== null && this.replPhase === 'stdout' && this.instrumented && !this.pendingDebug
    );
  }

  /** Vrai quand le script rapide tourne et qu'une variante instrumentée existe. */
  private get canSwitchToDebug(): boolean {
    return this.debugSource !== null && !this.instrumented && !this.pendingDebug && !this.disposed;
  }

  pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    // Pause pendant un redémarrage silencieux : le rejeu n'a plus lieu d'être
    // (le simulateur va être gelé), la sortie retenue revient au moniteur.
    // L'état « en pause » est posé AVANT, pour que la fin du rejeu ne réaffiche
    // pas « En cours… » sur un programme qu'on est en train d'arrêter.
    this.endSilentReplay();
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
      // Le temps passé en pause n'est pas une dette du moteur : on repart d'ici,
      // sinon le rattrapage borné s'acharnerait à combler une attente voulue.
      this.sim.reanchor();
      this.sim.execute();
    } else {
      // \x07 (BEL) : __kx désactive le mode pas à pas et rend la main au script.
      this.cdc?.sendSerialByte(0x07);
    }
  }

  /** Un pas de débogage MicroPython (exposé via `step` en mode script). */
  private doStep(): void {
    if (this.disposed) return;
    if (this.canSwitchToDebug && this.replPhase === 'stdout') {
      // Le script rapide tourne : il faut la version instrumentée pour avancer
      // ligne à ligne. On relance en débogage, arrêt sur la première ligne.
      this.isPaused = true;
      this.switchToDebug();
      return;
    }
    if (!this.scriptRunning || this.pausedByStop) return;
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

  /**
   * Le Pico n'avait AUCUN ralenti : le menu 🐢 ne faisait rien du tout côté
   * rp2040js. Le cadencement temps réel du simulateur (ancre temps mur ↔ temps
   * simulé) tient déjà la comptabilité — il suffit de doser l'allocation. Le
   * réglage est mémorisé : un rejeu silencieux tourne à fond et le restaure.
   */
  setSpeed(fraction: number): void {
    this.speedFraction = Math.max(0.001, Math.min(100, fraction));
    if (this.silentReplay) return;
    this.sim.speed = this.speedFraction;
    this.sim.reanchor(); // le facteur change : l'ancre repart d'ici
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
    else if (this.breakpoints.length > 0 && this.canSwitchToDebug && this.replPhase === 'stdout') {
      // Point d'arrêt posé pendant que le script rapide tourne : on relance en
      // version instrumentée, en silence, jusqu'à ce point d'arrêt.
      this.switchToDebug();
    }
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
   * Le script entre en exécution : s'il est instrumenté, on lui transmet les
   * points d'arrêt déjà posés (ils n'ont pas pu l'être avant le démarrage) et,
   * si une pause avait été demandée entre-temps, on la réémet (\x05).
   */
  private enterStdout(): void {
    this.replPhase = 'stdout';
    // Ce que le script rapide a lâché en s'interrompant (KeyboardInterrupt) ne
    // fait pas partie du rejeu : on repart d'un tampon vide.
    if (this.silentReplay) this.replayBuf = '';
    if (this.instrumented) {
      if (this.breakpoints.length > 0) this.sendBreakpoints();
      if (this.isPaused && !this.pausedByStop) this.cdc?.sendSerialByte(0x05);
    } else if (this.breakpoints.length > 0 && this.canSwitchToDebug) {
      // Point d'arrêt posé pendant le démarrage du firmware : bascule aussitôt.
      this.switchToDebug();
      return;
    }
    // Le script tourne : c'est la fin du « Démarrage MicroPython… ». Pendant un
    // rejeu silencieux, ce signal attend la fin du rejeu (il arme la mesure de
    // vitesse, qui n'aurait aucun sens sur un programme lancé à fond).
    if (!this.silentReplay) {
      // Point zéro du programme de l'élève. Le boot du firmware est du calcul
      // pur : l'émulateur y accumule forcément du retard, mais ce retard-là
      // n'appartient à aucune horloge — le rattraper ferait courir les premières
      // secondes du script.
      this.sim.reanchor();
      this.onRunning?.();
    }
  }

  // --- Bascule vers le script instrumenté -------------------------------------
  /** Le script à injecter devient la version instrumentée. */
  private useDebugScript(): void {
    if (this.debugSource === null) return;
    this.script = this.debugSource;
    this.instrumented = true;
  }

  /**
   * Relance le programme en version instrumentée sans redémarrer le firmware :
   * Ctrl-C pour reprendre la main sur le script rapide, puis réinjection par le
   * raw REPL. Le redémarrage est SILENCIEUX — sortie série retenue et simulateur
   * lancé à fond — jusqu'au point d'arrêt : l'élève retrouve son programme là où
   * il l'attend, sans revoir défiler tout ce qui précède.
   */
  private switchToDebug(): void {
    if (!this.canSwitchToDebug || !this.cdc) return;
    this.useDebugScript();
    this.pendingDebug = true;
    this.silentReplay = true;
    this.replayBuf = '';
    this.replayKicks = 0;
    this.replayDeadline = Date.now() + REPLAY_MAX_MS;
    this.sim.speed = REPLAY_SPEED;
    this.sim.reanchor();
    // Le simulateur peut être gelé par une pause matérielle : sans lui, plus rien
    // ne s'injecte (le firmware ne tourne plus).
    if (this.pausedByStop) {
      this.pausedByStop = false;
      this.sim.execute();
    }
    this.onDebugRestart?.('start');
    this.armReplayGuard();
    if (this.replPhase === 'stdout') this.cdc.sendSerialByte(3); // Ctrl-C : le script rend la main
    else this.beginRawRepl();
  }

  /** Ctrl-C ×2 (interrompt le code en cours) puis Ctrl-A : entrée en raw REPL. */
  private beginRawRepl(): void {
    if (!this.cdc) return;
    this.pendingDebug = false;
    this.replPhase = 'wait-raw';
    this.replBuffer = '';
    this.cdc.sendSerialByte(3);
    this.cdc.sendSerialByte(3);
    this.cdc.sendSerialByte(1);
  }

  /** Surveillance du rejeu : Ctrl-C insistant, puis abandon du silence au bout du délai. */
  private armReplayGuard(): void {
    if (this.replayTimer !== null) clearTimeout(this.replayTimer);
    this.replayTimer = setTimeout(() => this.replayTick(), REPLAY_TICK_MS);
  }

  private replayTick(): void {
    this.replayTimer = null;
    if (!this.silentReplay || this.disposed) return;
    if (this.pendingDebug && this.replPhase === 'stdout' && this.replayKicks < REPLAY_KICKS) {
      // Le script rapide n'a pas rendu la main (sleep long, KeyboardInterrupt
      // rattrapé par le programme…) : on réessaie.
      this.replayKicks++;
      this.cdc?.sendSerialByte(3);
      this.armReplayGuard();
      return;
    }
    // Délai dépassé : le point d'arrêt n'est peut-être jamais atteint. On rend la
    // parole au moniteur — le programme, lui, continue en version instrumentée.
    if (Date.now() >= this.replayDeadline) this.endSilentReplay();
    else this.armReplayGuard();
  }

  /** Fin du rejeu : la sortie retenue est publiée d'un coup et la vitesse revient au réglage. */
  private endSilentReplay(): void {
    if (!this.silentReplay) return;
    this.silentReplay = false;
    if (this.replayTimer !== null) {
      clearTimeout(this.replayTimer);
      this.replayTimer = null;
    }
    this.sim.speed = this.speedFraction;
    this.sim.reanchor();
    const buf = this.replayBuf;
    this.replayBuf = '';
    // 'end' AVANT la restitution : l'UI redevient visible, puis reçoit d'un bloc
    // ce que le programme a écrit pendant le rejeu.
    this.onDebugRestart?.('end');
    if (buf) this.onSerial?.(buf);
    this.onRunning?.();
  }

  // --- USB-CDC : console MicroPython + injection raw REPL ---------------------
  private onCdcConnected(): void {
    if (!this.cdc) return;
    if (this.script) {
      // Points d'arrêt déjà posés avant le lancement : on démarre directement en
      // version instrumentée, sans relance à subir plus tard.
      if (this.breakpoints.length > 0 && this.canSwitchToDebug) this.useDebugScript();
      this.beginRawRepl();
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

  /**
   * Sortie destinée au moniteur série. Pendant un rejeu silencieux elle est
   * retenue (et publiée d'un bloc à l'arrivée sur le point d'arrêt) : le
   * programme redémarré ne doit pas re-dérouler tout son affichage.
   */
  private output(text: string): void {
    if (!this.silentReplay) {
      this.onSerial?.(text);
      return;
    }
    this.replayBuf += text;
    if (this.replayBuf.length > REPLAY_BUF_MAX) {
      this.replayBuf = this.replayBuf.slice(-REPLAY_BUF_MAX);
    }
  }

  private emitSerialChar(ch: string): void {
    if (this.escBuf.length === 0) {
      if (ch === '\x1b') {
        this.escBuf = ch; // début possible d'une séquence
        return;
      }
      this.output(ch);
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
    this.output(buf.slice(0, -1));
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
      // Le rejeu silencieux avait justement pour but d'arriver ici.
      this.endSilentReplay();
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
          if (this.pendingDebug) {
            // Le script rapide vient de rendre la main : place à la version
            // instrumentée (la bannière du REPL est avalée par la phase wait-raw).
            this.beginRawRepl();
          } else {
            // Programme terminé sans avoir croisé le point d'arrêt : plus rien à attendre.
            this.endSilentReplay();
          }
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
