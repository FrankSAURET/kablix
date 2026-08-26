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

// --- Saut d'attente active (RP2350 seulement) -------------------------------
// Le firmware du Pico 2 attend souvent l'heure les yeux ouverts au lieu de
// s'endormir (voir `Rp2350Chip.dort`). Rien n'avance alors, sinon le compteur
// de microsecondes qu'il relit en boucle : on reconnaît cette boucle et on
// avance le temps d'un bloc, comme pour un vrai sommeil.
/** Adresse (poids forts) du TIMER0 dans la table des périphériques du RP2350. */
const TIMER0_CLE = 0x400b0;
/**
 * Dernier registre « pendule » du TIMER : de TIMEHW (0x00) à TIMERAWL (0x28),
 * soit l'heure, les quatre rendez-vous et le registre ARMED. Les lire ne change
 * rien à la puce — c'est ce qu'une attente fait, et rien d'autre. Au-delà
 * commencent les registres d'interruption, qui eux signalent du travail.
 */
const TIMER_PENDULE_MAX = 0x28;
/** Nombre de lectures d'heure rapprochées avant de conclure à une attente. */
const ATTENTE_SERIE = 100;
/** Au-delà de cet écart entre deux lectures d'heure, le cœur travaillait. */
const ATTENTE_ECART_CYCLES = 20_000;
/**
 * Pas d'un saut d'attente active (ns simulées). Un changement d'entrée décidé
 * par l'éditeur est donc vu au pire une milliseconde plus tard — c'est déjà la
 * granularité du moteur, qui exécute ses lots par tranches d'une milliseconde
 * sans regarder les entrées entre deux.
 */
const ATTENTE_PAS_NANOS = 1_000_000;
/**
 * Plafond d'un saut de sommeil (ns simulées). Sans rien à faire, le firmware
 * arme son rendez-vous sur « jamais » (0xFFFFFFFF µs) et s'endort : le saut
 * porterait alors l'horloge 71 minutes plus loin d'un seul bond, et le
 * programme se réveillerait en croyant avoir dormi tout ce temps. Une seconde
 * par saut ne coûte rien — le moteur cale de toute façon le temps simulé sur
 * le temps réel — et garde l'heure du programme crédible.
 */
const SOMMEIL_MAX_NANOS = 1_000_000_000;

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
 * Kablix se sert depuis toujours — MOINS LE CŒUR : sur le RP2350 `core` est un
 * TABLEAU de deux cœurs, et le déclarer ici comme un cœur unique laissait
 * `mcu.core.cycles` compiler pour rendre `undefined` sur RP2350 (compteur de
 * temps écoulé à `NaN`, périodes PWM et durées DHT/ultrason faussées). Le cœur 0
 * s'obtient par `PicoChip.core`, qui dit vrai des deux puces.
 * Les deux implémentations sont rapprochées par des `as unknown as` confinés à
 * ce fichier : c'est ici, et nulle part ailleurs, qu'on affirme l'équivalence
 * des deux bibliothèques, donc le seul endroit à relire si l'une des deux bouge.
 */
export type PicoMcu = Omit<RP2040, 'core'>;

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
  /** Lectures d'heure rapprochées vues d'affilée (cf. `ATTENTE_SERIE`). */
  private serieHeure = 0;
  /** Compteur de cycles à la dernière lecture d'heure, pour mesurer l'écart. */
  private cyclesDerniereHeure = 0;
  /** Le prochain saut est un saut d'attente active, pas un vrai sommeil. */
  private sautAttente = false;
  /** Attente reconnue : la boucle chaude doit rendre la main pour qu'on saute. */
  private attente = false;

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
    this.compterLecturesHeure();
  }

  /**
   * Compte les lectures de l'heure faites coup sur coup. Deux lectures séparées
   * par un long calcul ne comptent pas : la série repart de zéro. Ce que l'on
   * cherche est la boucle qui ne fait QUE regarder la pendule — pas celle qui
   * surveille un composant en même temps, d'où la remise à zéro dès qu'un autre
   * matériel est touché : un scan I²C interroge son contrôleur entre deux coups
   * d'œil à la pendule, et sauter par-dessus ferait expirer son attente pour
   * rien (banc `verify:pico2`).
   */
  private compterLecturesHeure(): void {
    const core0 = this.puce.core[0];
    const vuHeure = (): void => {
      const cycles = core0.cycles;
      this.serieHeure =
        cycles - this.cyclesDerniereHeure > ATTENTE_ECART_CYCLES ? 0 : this.serieHeure + 1;
      this.cyclesDerniereHeure = cycles;
      if (this.serieHeure >= ATTENTE_SERIE) {
        // Le test ne tombe qu'une fois par série, jamais dans le chemin chaud :
        // sans rendez-vous à viser, on n'a rien à sauter et il faut laisser le
        // cœur tourner, sinon la boucle du moteur n'exécuterait plus une seule
        // instruction.
        this.attente = this.clock.nanosToNextAlarm > 0;
        if (!this.attente) this.serieHeure = 0;
      }
    };
    for (const cle of Object.keys(this.puce.peripherals)) {
      const horloge = Number(cle) === TIMER0_CLE;
      const perif = this.puce.peripherals[Number(cle)] as unknown as {
        readUint32(offset: number): number;
        writeUint32(offset: number, value: number): void;
      };
      const lire = perif.readUint32.bind(perif);
      const ecrire = perif.writeUint32.bind(perif);
      perif.readUint32 = (offset: number): number => {
        if (horloge && offset <= TIMER_PENDULE_MAX) vuHeure();
        else this.serieHeure = 0;
        return lire(offset);
      };
      perif.writeUint32 = (offset: number, value: number): void => {
        this.serieHeure = 0;
        ecrire(offset, value);
      };
    }
  }

  /** Le cœur a touché autre chose que la pendule : ce n'est plus une attente. */
  private reveilMateriel(): void {
    this.serieHeure = 0;
  }

  dort(): boolean {
    const core0 = this.puce.core[0];
    const core1 = this.puce.core[1];
    // Les DEUX cœurs, pas seulement le nôtre : sauter à la prochaine alarme
    // pendant que le cœur 1 calcule (_thread) escamoterait son travail.
    if (core0.waiting && core1.waiting) {
      this.sautAttente = false;
      return true;
    }
    // Attente active. Le firmware RP2350 ne s'endort presque jamais : sa liste
    // de réveils se vide (chaque réveil posé avant un WFE y laisse sa case), et
    // faute de case il retombe sur une boucle qui relit l'heure jusqu'à
    // l'échéance — un million et demi d'instructions pour dix millisecondes qui
    // ne servent à rien. Quand la boucle est reconnue, on saute comme pour un
    // sommeil.
    if (!this.attente || !core1.waiting) return false;
    this.sautAttente = true;
    return true;
  }

  sauter(nanos: number): void {
    if (this.sautAttente) {
      // Saut d'attente active : le cœur 0 n'est pas endormi, il tourne à vide.
      // On avance par petits pas plutôt que d'un bond jusqu'à l'échéance, pour
      // lui rendre la main souvent — un caractère reçu sur l'USB ou une entrée
      // changée doit encore pouvoir le sortir de sa boucle.
      nanos = Math.min(nanos, ATTENTE_PAS_NANOS);
      this.sautAttente = false;
      this.attente = false;
      this.serieHeure = 0;
    } else {
      nanos = Math.min(nanos, SOMMEIL_MAX_NANOS);
    }
    const jumpCycles = nanos / this.cycleNanos;
    // Les deux cœurs dorment (cf. dort) : leurs compteurs suivent le saut.
    // Celui du cœur 1 sert de borne au rattrapage, pas seulement d'affichage.
    this.puce.core[0].addCycles(jumpCycles);
    this.puce.core[1].addCycles(jumpCycles);
    // `stepThings` avance les machines PIO actives ET tique l'horloge de
    // cycles × (1e9 / clkSys), soit exactement `nanos`.
    this.puce.stepThings(jumpCycles);
    // Le bond de compteur ne doit pas passer pour un long calcul au retour.
    this.cyclesDerniereHeure = this.puce.core[0].cycles;
  }

  executerLot(finNanos: number): void {
    const { puce, arret } = this;
    const clock = puce.clock;
    const core0 = puce.core[0];
    const core1 = puce.core[1];
    // Une instruction du cœur 0, le cœur 1 rattrapé jusqu'au même cycle, puis
    // PIO + horloge : c'est leur `step()`, déplié pour ne pas payer deux appels.
    // `this.attente` s'allume dans le compteur de lectures d'heure : il faut
    // rendre la main tout de suite, sinon le moteur ne reconsulterait `dort`
    // qu'à la fin du lot — une milliseconde simulée plus loin, soit exactement
    // ce qu'on voulait sauter.
    while (
      !(core0.waiting && core1.waiting) &&
      !this.attente &&
      !arret.stopped &&
      clock.nanos < finNanos
    ) {
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
      // Les broches se lisent par le SIO, hors table des périphériques : c'est
      // ici qu'une surveillance de broche annule le saut d'attente active.
      this.reveilMateriel();
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
