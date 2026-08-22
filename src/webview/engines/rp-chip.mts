// Fabrique de puce pour le moteur Pico : RP2040 (Pico, Pico W) ou RP2350
// (Pico 2, Pico 2 W). Deux bibliothèques cohabitent, et c'est voulu :
//   - RP2040 : `rp2040js` 1.3.3 depuis npm, patché (cf. patches/) — +30 % de
//     débit, PIO avancé à la main, alarmes en FIFO. Rien à y toucher.
//   - RP2350 : `rp2350js` (fork c1570), non publié sur npm, donc VENDORISÉ dans
//     vendor/rp2350js/ (cf. son ORIGINE.md). Mesuré à 60-70 % du régime du
//     RP2040 ci-dessus, ce qui reste utilisable.
//
// Ce module est la couche mince qui masque leurs différences réelles. Tout le
// reste — gpio, adc, i2c, spi, uart, usbCtrl, flash, sram, horloge — porte les
// mêmes noms et les mêmes signatures des deux côtés, et le moteur (pico.mts)
// s'en sert sans savoir sur quelle puce il tourne.
//
// Les boucles CHAUDES vivent ici, une par famille (`executerLot`), et non chez
// l'appelant : le moteur en appelle une par lot d'instructions, pas une par
// instruction. Écrire une boucle commune coûterait un appel indirect toutes les
// instructions, sur le seul chemin dont le régime dépend.
import { RP2040, USBCDC, GPIOPinState } from 'rp2040js';
import { RP2350 } from '../../../vendor/rp2350js/src/rp2350.js';
import { USBCDC as USBCDC2350 } from '../../../vendor/rp2350js/src/usb/cdc.js';
import { setupVectoredRamBoot } from '../../../vendor/rp2350js/src/utils/load-firmware.js';
import { bootromB1 } from './bootrom-b1.mjs';
import type { FlashSegment } from './types.mjs';

const RAM_START = 0x20000000;
const FLASH_START = 0x10000000;

/** Fréquence par défaut de chaque puce (Hz) — celle qu'annonce `machine.freq()`. */
const CLK_SYS = { rp2040: 125_000_000, rp2350: 150_000_000 } as const;

export type PicoFamily = keyof typeof CLK_SYS;

export { GPIOPinState };

/**
 * Le cœur tel que le moteur s'en sert. Le RP2350 en a deux : `core` désigne
 * toujours le cœur 0, celui sur lequel tourne le programme de l'utilisateur.
 */
export interface PicoCore {
  cycles: number;
  PC: number;
  waiting: boolean;
  executeInstruction(): number;
  reset(): void;
}

/**
 * La puce vue par le moteur. Décrite à partir du type de `rp2040js` — dont
 * Kablix se sert depuis toujours — moins le cœur, remplacé par la vue commune
 * ci-dessus. Les deux implémentations sont rapprochées par des `as unknown as`
 * confinés à ce fichier : c'est ici, et nulle part ailleurs, qu'on affirme
 * l'équivalence des deux bibliothèques, donc le seul endroit à relire si l'une
 * des deux bouge.
 */
export type PicoMcu = Omit<RP2040, 'core'> & { core: PicoCore };

/**
 * L'horloge simulée, réduite à ce dont le moteur se sert. Les deux
 * bibliothèques ont la même (compteur de nanosecondes + alarmes chaînées), mais
 * `rp2040js` ne l'exporte pas depuis son index : la décrire ici évite d'aller
 * chercher un chemin interne du paquet.
 */
export interface PicoClock {
  readonly nanos: number;
  readonly nanosToNextAlarm: number;
  tick(deltaNanos: number): void;
}

/** Le CDC vu par le moteur : injecter des octets dans le REPL, rien de plus. */
export interface PicoCdc {
  sendSerialByte(data: number): void;
}

/** Ce que le CDC rend au moteur. */
export interface CdcHooks {
  onData: (buffer: Uint8Array) => void;
  onConnected: () => void;
}

/** Drapeau d'arrêt consulté par les boucles chaudes (le simulateur lui-même). */
export interface Arret {
  readonly stopped: boolean;
}

/** Puce prête à tourner : les gestes que le moteur ne peut pas écrire une seule fois. */
export interface PicoChip {
  readonly famille: PicoFamily;
  readonly mcu: PicoMcu;
  /** Cœur 0 — le seul que le moteur regarde (cycles, PC). */
  readonly core: PicoCore;
  readonly clock: PicoClock;
  /** Durée d'un cycle en nanosecondes simulées. */
  readonly cycleNanos: number;
  /** Vrai quand plus aucun cœur n'a de travail : le moteur peut sauter à la prochaine alarme. */
  dort(): boolean;
  /**
   * Saut d'alarme : avance de `nanos` d'un coup pendant que le cœur dort
   * (compteur de cycles, PIO et horloge compris).
   */
  sauter(nanos: number): void;
  /**
   * Boucle chaude : exécute des instructions jusqu'à `finNanos` (temps simulé),
   * ou jusqu'à ce que le cœur s'endorme, ou qu'un arrêt soit demandé.
   */
  executerLot(finNanos: number): void;
  /** Écrit un programme bare-metal en SRAM et arme son démarrage. */
  chargerRam(image: Uint8Array): void;
  /** Écrit les segments d'un firmware en flash (bootrom compris si besoin). */
  chargerFlash(segments: FlashSegment[]): void;
  /** Lance l'exécution depuis la flash. */
  demarrer(): void;
  /** Branche l'USB-CDC (moniteur série / REPL MicroPython). */
  creerCdc(hooks: CdcHooks): PicoCdc;
  /**
   * GPIO_IN doit RELIRE ce que la broche pilote elle-même (KABLIX).
   * Sur silicium, le tampon d'entrée est branché sur le PAD : une broche en
   * sortie se relit donc à son propre niveau, et c'est là-dessus que repose le
   * `Pin.value()` de MicroPython (il lit SIO.GPIO_IN, jamais le registre de
   * sortie). Les deux bibliothèques, elles, ne remplissent `rawInputValue` que
   * depuis l'EXTÉRIEUR : une broche jamais pilotée du dehors relisait 0 pour
   * toujours — d'où `blink-pico` qui imprimait « LED OFF » à chaque tour alors
   * que la LED clignotait bel et bien (retour Frank). Correction au seul point
   * de lecture (SIO.GPIO_IN et l'entrée PIO) : les interruptions de broche
   * gardent leur source d'origine, donc une sortie ne peut pas se réveiller
   * elle-même.
   */
  patcherRelectureSortie(): void;
  /** Arrêt du simulateur sur BKPT (là où la puce sait le signaler). */
  surBreak(cb: () => void): void;
}

class Rp2040Chip implements PicoChip {
  readonly famille = 'rp2040';
  readonly mcu: PicoMcu;
  readonly core: PicoCore;
  readonly clock: PicoClock;
  readonly cycleNanos = 1e9 / CLK_SYS.rp2040;
  private readonly puce: RP2040;

  constructor(private readonly arret: Arret) {
    this.puce = new RP2040();
    this.clock = this.puce.clock as unknown as PicoClock;
    this.mcu = this.puce as unknown as PicoMcu;
    this.core = this.puce.core as unknown as PicoCore;
  }

  dort(): boolean {
    return this.puce.core.waiting;
  }

  sauter(nanos: number): void {
    const { puce, clock } = this;
    // Le compteur de cycles suit le saut (AVANT le tick : les fronts GPIO
    // déclenchés par les alarmes — PWM servo… — sont horodatés en cycles).
    const jumpCycles = nanos / this.cycleNanos;
    puce.core.cycles += jumpCycles;
    // PIO patché (KABLIX) : plus de setTimeout auto-cadencé, avancer
    // manuellement pendant les sauts WFE sinon un state machine actif
    // (ex. machine.bitstream d'un NeoPixel) se figerait pendant tout
    // time.sleep() — le firmware attend justement la fin du bitstream.
    puce.pio[0].advance(jumpCycles);
    puce.pio[1].advance(jumpCycles);
    clock.tick(nanos);
  }

  executerLot(finNanos: number): void {
    const { puce, clock, arret, cycleNanos } = this;
    const core = puce.core;
    const pio0 = puce.pio[0];
    const pio1 = puce.pio[1];
    // L'horloge avance À CHAQUE instruction (clock.tick) et non une fois par
    // lot : SYST_CVR (SysTick, dérivé de clock.nanos) resterait sinon GELÉ
    // pendant tout le lot, et toute routine firmware busy-waitant dessus à
    // quelques centaines de ns près — machine.bitstream d'un NeoPixel :
    // 0,4-0,9 µs par phase — verrait ses durées quantifiées à la taille du lot
    // (~1 ms), toutes identiques. Les alarmes dues en cours de lot (DMA, USB…)
    // tombent aussi pile au lieu d'attendre la fin du lot.
    while (!core.waiting && !arret.stopped && clock.nanos < finNanos) {
      const instrCycles = core.executeInstruction();
      pio0.advance(instrCycles);
      pio1.advance(instrCycles);
      clock.tick(instrCycles * cycleNanos);
    }
  }

  chargerRam(image: Uint8Array): void {
    this.puce.sram.set(image, 0); // image chargée à 0x20000000
    this.puce.core.VTOR = RAM_START;
    this.puce.core.reset();
  }

  chargerFlash(segments: FlashSegment[]): void {
    // Bootrom B1 requis : les firmwares pico-sdk/MicroPython appellent ses
    // fonctions ROM (boot2, routines flottantes, memcpy…).
    this.puce.loadBootrom(bootromB1);
    for (const seg of segments) {
      const offset = seg.addr - FLASH_START;
      if (offset < 0 || offset + seg.data.length > this.puce.flash.length) continue;
      this.puce.flash.set(seg.data, offset);
    }
  }

  demarrer(): void {
    // Démarrage identique au bootrom réel : exécution de boot2 en début de flash.
    this.puce.core.PC = FLASH_START;
  }

  creerCdc(hooks: CdcHooks): PicoCdc {
    const cdc = new USBCDC(this.puce.usbCtrl);
    cdc.onSerialData = hooks.onData;
    cdc.onDeviceConnected = hooks.onConnected;

    // Anti-tempête USB : quand le firmware arme le endpoint OUT du CDC sans
    // qu'aucun octet n'attende côté hôte, rp2040js répond « transfert vide »
    // au bout de 10 µs et TinyUSB réarme aussitôt — une IRQ toutes les
    // ~25 µs simulées qui avorte chaque WFE. time.sleep() devenait une
    // boucle chaude (~4× le temps réel). On répond à la cadence d'un vrai
    // hôte full-speed (trame de 1 ms) : le firmware dort vraiment entre deux.
    // (Le CDC du RP2350 n'en a pas besoin : il diffère carrément la lecture.)
    const usb = this.puce.usbCtrl;
    const cdcEndpointRead = usb.onEndpointRead;
    const cdcInternals = cdc as unknown as { outEndpoint: number };
    const emptyOut = new Uint8Array(0);
    usb.onEndpointRead = (endpoint, byteCount) => {
      if (endpoint === cdcInternals.outEndpoint && cdc.txFIFO.itemCount === 0) {
        usb.endpointReadDone(endpoint, emptyOut, 1000);
      } else {
        cdcEndpointRead?.(endpoint, byteCount);
      }
    };
    return cdc;
  }

  patcherRelectureSortie(): void {
    const gpio = this.puce.gpio;
    Object.defineProperty(this.puce, 'gpioValues', {
      get(): number {
        let result = 0;
        for (let i = 0; i < gpio.length; i++) {
          const pin = gpio[i];
          if (pin.outputEnable ? pin.outputValue : pin.inputValue) result |= 1 << i;
        }
        return result;
      },
    });
  }

  surBreak(cb: () => void): void {
    this.puce.onBreak = cb;
  }
}

class Rp2350Chip implements PicoChip {
  readonly famille = 'rp2350';
  readonly mcu: PicoMcu;
  readonly core: PicoCore;
  readonly clock: PicoClock;
  readonly cycleNanos = 1e9 / CLK_SYS.rp2350;
  private readonly puce: RP2350;

  constructor(private readonly arret: Arret) {
    // 'arm' : le Pico 2 est vendu en Cortex-M33, c'est l'architecture des
    // firmwares MicroPython RPI_PICO2, et la seule des deux dont l'évaluation
    // n'a rien laissé en suspens (leur RISC-V fige sur un i2c.scan()). Leur
    // défaut à eux est de démarrer en RISC-V, d'où l'option explicite.
    this.puce = new RP2350({ coreArch: 'arm' });
    // Ils laissent clkSys sur les 125 MHz du RP2040 ; le vrai Pico 2 tourne à
    // 150, et c'est ce que le firmware annonce (`machine.freq()`). Sans cette
    // ligne, tout ce qui se déduit de la fréquence — SysTick, PWM, la durée
    // d'un cycle — serait 20 % trop lent par rapport au programme qui tourne.
    this.puce.clkSys = CLK_SYS.rp2350;
    this.puce.clkPeri = CLK_SYS.rp2350;
    this.clock = this.puce.clock as unknown as PicoClock;
    this.mcu = this.puce as unknown as PicoMcu;
    this.core = this.puce.core[0] as unknown as PicoCore;
  }

  dort(): boolean {
    // Les DEUX cœurs, pas seulement le nôtre : sauter à la prochaine alarme
    // pendant que le cœur 1 calcule (_thread) escamoterait son travail.
    return this.puce.core[0].waiting && this.puce.core[1].waiting;
  }

  sauter(nanos: number): void {
    const jumpCycles = nanos / this.cycleNanos;
    // Les deux cœurs dorment (cf. dort) : leurs compteurs suivent le saut.
    // Celui du cœur 1 sert de borne au rattrapage, pas seulement d'affichage.
    this.puce.core[0].addCycles(jumpCycles);
    this.puce.core[1].addCycles(jumpCycles);
    // `stepThings` avance les machines PIO actives ET tique l'horloge de
    // cycles × (1e9 / clkSys), soit exactement `nanos`.
    this.puce.stepThings(jumpCycles);
  }

  executerLot(finNanos: number): void {
    const { puce, arret } = this;
    const clock = puce.clock;
    const core0 = puce.core[0];
    const core1 = puce.core[1];
    // Une instruction du cœur 0, le cœur 1 rattrapé jusqu'au même cycle, puis
    // PIO + horloge : c'est leur `step()`, déplié pour ne pas payer deux appels.
    while (!(core0.waiting && core1.waiting) && !arret.stopped && clock.nanos < finNanos) {
      puce.stepThings(puce.stepCores());
    }
  }

  chargerRam(image: Uint8Array): void {
    this.puce.sram.set(image, 0);
    // Le bootrom du RP2350 ne regarde pas la SRAM de lui-même : il faut lui
    // laisser la poignée de main « vectored boot » dans les scratch du
    // watchdog, sinon il part chercher un IMAGE_DEF en flash et n'en trouve pas.
    setupVectoredRamBoot(this.puce, RAM_START, 0x40000);
    this.puce.reset();
  }

  chargerFlash(segments: FlashSegment[]): void {
    // Pas de loadBootrom ici : le bootrom A2 est déjà en place (chargé par leur
    // constructeur), et il sait scanner la flash tout seul.
    for (const seg of segments) {
      const offset = seg.addr - FLASH_START;
      if (offset < 0 || offset + seg.data.length > this.puce.flash.length) continue;
      this.puce.flash.set(seg.data, offset);
    }
  }

  demarrer(): void {
    // Le bootrom fait le travail : scan de la flash, vérification de l'IMAGE_DEF,
    // saut vers le point d'entrée. Poser le PC à la main ne marcherait pas — un
    // firmware RP2350 commence par un en-tête, pas par du code.
    this.puce.reset();
  }

  creerCdc(hooks: CdcHooks): PicoCdc {
    const cdc = new USBCDC2350(this.puce.usbCtrl);
    cdc.onSerialData = hooks.onData;
    cdc.onDeviceConnected = hooks.onConnected;
    return cdc;
  }

  patcherRelectureSortie(): void {
    // Même correction que sur RP2040, mais `gpioValues` est ici une MÉTHODE
    // (deux banques de 32 broches : le RP2350 en compte 48).
    const gpio = this.puce.gpio;
    this.puce.gpioValues = (start: number): number => {
      let result = 0;
      const end = Math.min(start + 32, gpio.length);
      for (let i = start; i < end; i++) {
        const pin = gpio[i];
        if (pin.outputEnable ? pin.outputValue : pin.inputValue) result |= 1 << (i - start);
      }
      return result;
    };
  }

  surBreak(): void {
    // Leur puce n'expose pas de rappel BKPT : rien à brancher.
  }
}

export function creerChip(famille: PicoFamily, arret: Arret): PicoChip {
  return famille === 'rp2350' ? new Rp2350Chip(arret) : new Rp2040Chip(arret);
}
