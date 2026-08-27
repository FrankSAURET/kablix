// Moteur de simulation Arduino AVR basé sur avr8js.
//   - 'avr328' : ATmega328P (Uno / Nano / Pro Mini) — broches 0–13, A0–A7 ;
//   - 'avr2560' : ATmega2560 (Mega) — broches 0–53, A0–A15, ports A–L.
// Expose un accès générique aux broches numériques, l'ADC et la liaison série
// (USART0 = Serial sur les deux familles). Les *registres* USART0 / timers 0-2 /
// ADC sont aux mêmes adresses sur le 328P et le 2560, MAIS la table de vecteurs
// d'interruption diffère → configs Mega dédiées avec vecteurs corrigés (cf.
// MEGA_TIMER*…), sinon millis()/delay()/Serial gèlent sur le Mega. Les timers
// 3-5, USART1-3 (Serial1/2/3) et les canaux ADC 8-15 (A8-A15) — absents du 328P
// donc sans config avr8js — sont reconstruits à la main (adresses de registres,
// vecteurs et broches OC du 2560) : tout le PWM (D2-D13, 44-46) et toutes les
// entrées analogiques (A0-A15) sont donc simulés.
import {
  CPU,
  avrInstruction,
  AVRIOPort,
  AVRUSART,
  AVRADC,
  AVRTimer,
  AVRTWI,
  twiConfig,
  AVRSPI,
  spiConfig,
  adcConfig,
  ADCMuxInputType,
  portAConfig,
  portBConfig,
  portCConfig,
  portDConfig,
  portEConfig,
  portFConfig,
  portGConfig,
  portHConfig,
  portJConfig,
  portKConfig,
  portLConfig,
  usart0Config,
  timer0Config,
  timer1Config,
  timer2Config,
  PinState,
} from 'avr8js';
import type { ADCMuxConfiguration } from 'avr8js';
import type {
  AvrDebugInfo,
  Breakpoint,
  DebugPauseState,
  DebugVariable,
  Dht22Sensor,
  KeypadConfig,
  LcdParallelConfig,
  SimEngine,
  UltrasonicSensor,
} from './types.mjs';
import {
  buildDht22Schedule,
  dht22ResponseCycles,
  DHT22_START_LOW_US,
  type Dht22Monitor,
} from './dht22.mjs';
import { DEFAULT_AIR_TEMP_C, echoUsPerCm } from './ultrasonic.mjs';
import { selectSpiDevice, Hd44780, type I2cDevice, type SpiDevice } from './i2c-devices.mjs';
import { Ws2812Decoder } from './ws2812.mjs';
import { DmxDecoder, DmxWire } from './dmx.mjs';

export type AvrFamily = 'avr328' | 'avr2560';

const CLOCK_HZ = 16_000_000;
const CYCLES_PER_US = CLOCK_HZ / 1_000_000; // 16 cycles = 1 µs
// Budget temps réel d'une tranche de simulation par frame (ms). Sous cette limite
// le navigateur garde le temps de repeindre l'affichage ; au-delà on cède la main.
const MAX_FRAME_MS = 12;
// Retard (temps réel, ms) que la simulation accepte de RATTRAPER. Tout ce qui
// bloque la page — rendu, layout, moniteur série — vole du temps à la boucle :
// sans rattrapage, ce temps est du temps simulé définitivement perdu et le
// sketch tourne au ralenti. Au-delà de cette dette (onglet caché, page figée
// plusieurs secondes) on ré-ancre : mieux vaut sauter du temps que s'emballer.
const MAX_DEBT_MS = 250;
// Avance (temps réel, ms) à partir de laquelle on rend vraiment la main au
// navigateur par un timer, au lieu d'enchaîner tout de suite une tranche.
const AHEAD_NAP_MS = 8;
const VREF = 5;
// RAMEND du 2560 = 0x21FF : la pile démarre tout en haut de la SRAM, il faut donc
// dimensionner l'espace données pour le couvrir (data = sramBytes + 0x100).
const MEGA_SRAM_BYTES = 0x2200;

type PortKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L';

// Broche Arduino (nom) -> port AVR + index de bit. ATmega328P (Uno / Nano / Pro Mini).
const UNO_PINS: Record<string, [PortKey, number]> = {
  '0': ['D', 0], '1': ['D', 1], '2': ['D', 2], '3': ['D', 3],
  '4': ['D', 4], '5': ['D', 5], '6': ['D', 6], '7': ['D', 7],
  '8': ['B', 0], '9': ['B', 1], '10': ['B', 2], '11': ['B', 3],
  '12': ['B', 4], '13': ['B', 5],
  'A0': ['C', 0], 'A1': ['C', 1], 'A2': ['C', 2],
  'A3': ['C', 3], 'A4': ['C', 4], 'A5': ['C', 5],
};

// ATmega2560 (Mega) : correspondance broche Arduino -> port/bit (datasheet + variant Arduino).
const MEGA_PINS: Record<string, [PortKey, number]> = {
  '0': ['E', 0], '1': ['E', 1], '2': ['E', 4], '3': ['E', 5], '4': ['G', 5],
  '5': ['E', 3], '6': ['H', 3], '7': ['H', 4], '8': ['H', 5], '9': ['H', 6],
  '10': ['B', 4], '11': ['B', 5], '12': ['B', 6], '13': ['B', 7],
  '14': ['J', 1], '15': ['J', 0], '16': ['H', 1], '17': ['H', 0],
  '18': ['D', 3], '19': ['D', 2], '20': ['D', 1], '21': ['D', 0],
  '22': ['A', 0], '23': ['A', 1], '24': ['A', 2], '25': ['A', 3],
  '26': ['A', 4], '27': ['A', 5], '28': ['A', 6], '29': ['A', 7],
  '30': ['C', 7], '31': ['C', 6], '32': ['C', 5], '33': ['C', 4],
  '34': ['C', 3], '35': ['C', 2], '36': ['C', 1], '37': ['C', 0],
  '38': ['D', 7], '39': ['G', 2], '40': ['G', 1], '41': ['G', 0],
  '42': ['L', 7], '43': ['L', 6], '44': ['L', 5], '45': ['L', 4],
  '46': ['L', 3], '47': ['L', 2], '48': ['L', 1], '49': ['L', 0],
  '50': ['B', 3], '51': ['B', 2], '52': ['B', 1], '53': ['B', 0],
  'A0': ['F', 0], 'A1': ['F', 1], 'A2': ['F', 2], 'A3': ['F', 3],
  'A4': ['F', 4], 'A5': ['F', 5], 'A6': ['F', 6], 'A7': ['F', 7],
  'A8': ['K', 0], 'A9': ['K', 1], 'A10': ['K', 2], 'A11': ['K', 3],
  'A12': ['K', 4], 'A13': ['K', 5], 'A14': ['K', 6], 'A15': ['K', 7],
  'SDA': ['D', 1], 'SCL': ['D', 0],
};

// Broche analogique -> canal ADC. Le 328P expose A0-A5 (canaux 0-5, port C) ; le
// 2560 A0-A15 (canaux 0-7 sur port F, 8-15 sur port K). Les canaux 8-15 passent
// par le bit MUX5 (ADCSRB) — géré par avr8js dès que MEGA_ADC_CONFIG élargit le
// masque et déclare les entrées 0x20-0x27.
const UNO_ADC: Record<string, number> = { A0: 0, A1: 1, A2: 2, A3: 3, A4: 4, A5: 5 };
const MEGA_ADC: Record<string, number> = {
  ...UNO_ADC, A6: 6, A7: 7,
  A8: 8, A9: 9, A10: 10, A11: 11, A12: 12, A13: 13, A14: 14, A15: 15,
};

// ATmega2560 : les registres des périphériques (timers 0-2, USART0, SPI, TWI, ADC)
// sont aux mêmes adresses que le 328P, MAIS la table de vecteurs d'interruption
// est plus grande → les adresses de vecteur diffèrent. On recopie les configs
// avr8js (328P) en corrigeant uniquement les vecteurs (datasheet ATmega2560,
// table 14-1, adresses en mots). Sans ça, les ISR (Timer0 pour millis/delay,
// USART pour Serial…) sautent au mauvais endroit → millis() gèle, delay() boucle
// à l'infini et la broche ne bascule jamais (programme « bloqué », CPU pourtant
// en marche).
//
// On corrige AUSSI les sorties PWM (compPort/compPin = broche OCnx pilotée par
// analogWrite) : sur le 2560 les OCnx ne sont pas sur les mêmes broches que le
// 328P. Sans ça, analogWrite() agissait sur la broche du Uno → la vraie broche
// du Mega restait inerte. Broches gérées (timers 0-2) : D13/OC0A=PB7, D4/OC0B=PG5,
// D11/OC1A=PB5, D12/OC1B=PB6, D10/OC2A=PB4, D9/OC2B=PH6. Les timers 3-5 (ci-dessous)
// couvrent les broches PWM restantes : D5/D2/D3, D6/D7/D8, D46/D45/D44.
const MEGA_TIMER0 = {
  ...timer0Config,
  compAInterrupt: 0x2a, compBInterrupt: 0x2c, ovfInterrupt: 0x2e,
  compPortA: portBConfig.PORT, compPinA: 7, // OC0A = PB7 (D13)
  compPortB: portGConfig.PORT, compPinB: 5, // OC0B = PG5 (D4)
};
const MEGA_TIMER1 = {
  ...timer1Config,
  captureInterrupt: 0x20, compAInterrupt: 0x22, compBInterrupt: 0x24, compCInterrupt: 0x26, ovfInterrupt: 0x28,
  compPortA: portBConfig.PORT, compPinA: 5, // OC1A = PB5 (D11)
  compPortB: portBConfig.PORT, compPinB: 6, // OC1B = PB6 (D12)
};
const MEGA_TIMER2 = {
  ...timer2Config,
  compAInterrupt: 0x1a, compBInterrupt: 0x1c, ovfInterrupt: 0x1e,
  compPortA: portBConfig.PORT, compPinA: 4, // OC2A = PB4 (D10)
  compPortB: portHConfig.PORT, compPinB: 6, // OC2B = PH6 (D9)
};
// Timers 16 bits 3/4/5 : propres au 2560 (absents du 328P → aucune config avr8js).
// Ce sont des clones du timer1 (même structure 16 bits A/B/C) ; on repart donc de
// timer1Config en remplaçant les adresses de registres (datasheet 2560), les
// vecteurs (table 14-1, en mots) et les broches OCnx. OCFC/OCIEC = bit 3 (TIFR/
// TIMSK) activent le canal C, présent sur ces timers. Broches PWM ainsi gérées :
// T3 → D5/D2/D3, T4 → D6/D7/D8, T5 → D46/D45/D44.
const MEGA_TIMER3 = {
  ...timer1Config,
  TCCRA: 0x90, TCCRB: 0x91, TCCRC: 0x92, TCNT: 0x94, ICR: 0x96,
  OCRA: 0x98, OCRB: 0x9a, OCRC: 0x9c, TIMSK: 0x71, TIFR: 0x38, OCFC: 0x08, OCIEC: 0x08,
  captureInterrupt: 0x3e, compAInterrupt: 0x40, compBInterrupt: 0x42, compCInterrupt: 0x44, ovfInterrupt: 0x46,
  externalClockPort: portEConfig.PORT, externalClockPin: 6, // T3 = PE6
  compPortA: portEConfig.PORT, compPinA: 3, // OC3A = PE3 (D5)
  compPortB: portEConfig.PORT, compPinB: 4, // OC3B = PE4 (D2)
  compPortC: portEConfig.PORT, compPinC: 5, // OC3C = PE5 (D3)
};
const MEGA_TIMER4 = {
  ...timer1Config,
  TCCRA: 0xa0, TCCRB: 0xa1, TCCRC: 0xa2, TCNT: 0xa4, ICR: 0xa6,
  OCRA: 0xa8, OCRB: 0xaa, OCRC: 0xac, TIMSK: 0x72, TIFR: 0x39, OCFC: 0x08, OCIEC: 0x08,
  captureInterrupt: 0x52, compAInterrupt: 0x54, compBInterrupt: 0x56, compCInterrupt: 0x58, ovfInterrupt: 0x5a,
  externalClockPort: portHConfig.PORT, externalClockPin: 7, // T4 = PH7
  compPortA: portHConfig.PORT, compPinA: 3, // OC4A = PH3 (D6)
  compPortB: portHConfig.PORT, compPinB: 4, // OC4B = PH4 (D7)
  compPortC: portHConfig.PORT, compPinC: 5, // OC4C = PH5 (D8)
};
const MEGA_TIMER5 = {
  ...timer1Config,
  TCCRA: 0x120, TCCRB: 0x121, TCCRC: 0x122, TCNT: 0x124, ICR: 0x126,
  OCRA: 0x128, OCRB: 0x12a, OCRC: 0x12c, TIMSK: 0x73, TIFR: 0x3a, OCFC: 0x08, OCIEC: 0x08,
  captureInterrupt: 0x5c, compAInterrupt: 0x5e, compBInterrupt: 0x60, compCInterrupt: 0x62, ovfInterrupt: 0x64,
  externalClockPort: portLConfig.PORT, externalClockPin: 2, // T5 = PL2 (D47)
  compPortA: portLConfig.PORT, compPinA: 3, // OC5A = PL3 (D46)
  compPortB: portLConfig.PORT, compPinB: 4, // OC5B = PL4 (D45)
  compPortC: portLConfig.PORT, compPinC: 5, // OC5C = PL5 (D44)
};
const MEGA_USART0 = { ...usart0Config, rxCompleteInterrupt: 0x32, dataRegisterEmptyInterrupt: 0x34, txCompleteInterrupt: 0x36 };
// USART1-3 (Serial1/2/3) : génériques aussi, copie de usart0Config avec les
// adresses UCSR/UBRR/UDR et les vecteurs du 2560.
const MEGA_USART1 = { ...usart0Config,
  rxCompleteInterrupt: 0x48, dataRegisterEmptyInterrupt: 0x4a, txCompleteInterrupt: 0x4c,
  UCSRA: 0xc8, UCSRB: 0xc9, UCSRC: 0xca, UBRRL: 0xcc, UBRRH: 0xcd, UDR: 0xce };
const MEGA_USART2 = { ...usart0Config,
  rxCompleteInterrupt: 0x66, dataRegisterEmptyInterrupt: 0x68, txCompleteInterrupt: 0x6a,
  UCSRA: 0xd0, UCSRB: 0xd1, UCSRC: 0xd2, UBRRL: 0xd4, UBRRH: 0xd5, UDR: 0xd6 };
const MEGA_USART3 = { ...usart0Config,
  rxCompleteInterrupt: 0x6c, dataRegisterEmptyInterrupt: 0x6e, txCompleteInterrupt: 0x70,
  UCSRA: 0x130, UCSRB: 0x131, UCSRC: 0x132, UBRRL: 0x134, UBRRH: 0x135, UDR: 0x136 };
const MEGA_SPI = { ...spiConfig, spiInterrupt: 0x30 };
const MEGA_TWI = { ...twiConfig, twiInterrupt: 0x4e };
// ADC du 2560 : 16 canaux. Les canaux 8-15 (A8-A15) sont sélectionnés via le bit
// MUX5 (ADCSRB) → index 0x20-0x27 dans avr8js. On élargit donc le masque à 0x3f
// et on déclare A0-A7 (0-7), A8-A15 (0x20-0x27) et les références VBG/GND.
const MEGA_ADC_CHANNELS: ADCMuxConfiguration = {
  30: { type: ADCMuxInputType.Constant, voltage: 1.1 }, // référence interne 1,1 V
  31: { type: ADCMuxInputType.Constant, voltage: 0 }, // GND
};
for (let i = 0; i < 8; i++) {
  MEGA_ADC_CHANNELS[i] = { type: ADCMuxInputType.SingleEnded, channel: i }; // A0-A7
  MEGA_ADC_CHANNELS[0x20 + i] = { type: ADCMuxInputType.SingleEnded, channel: 8 + i }; // A8-A15
}
const MEGA_ADC_CONFIG = { ...adcConfig, adcInterrupt: 0x3a, numChannels: 16, muxInputMask: 0x3f, muxChannels: MEGA_ADC_CHANNELS };

export class AvrEngine implements SimEngine {
  onUpdate: (() => void) | null = null;
  onSerial: ((chunk: string) => void) | null = null;
  onDebugPause: ((state: DebugPauseState) => void) | null = null;

  private cpu: CPU;
  private ports: Partial<Record<PortKey, AVRIOPort>>;
  private pinMap: Record<string, [PortKey, number]>;
  private adcMap: Record<string, number>;
  private usart: AVRUSART;
  // USART1-3 (Serial1/2/3 du Mega) : leur émission est routée vers le moniteur
  // série (onSerial), comme Serial. Vide sur le 328P (un seul USART).
  private usarts: AVRUSART[] = [];
  private twi: AVRTWI;
  private spi: AVRSPI;
  private adc: AVRADC;
  /** Canaux dont la tension est CALCULÉE à la conversion (cf. setAnalogSampler). */
  private analogSamplers = new Map<number, () => number>();
  // Timers 0/1/2 : indispensables pour millis()/micros()/delay() (sans eux la
  // boucle de delay() ne se terminait jamais et la simulation semblait planter).
  private timers: AVRTimer[];
  private rafId: number | null = null; // handle du timer de boucle (setTimeout)
  // Cadencement temps réel : ANCRE reliant le temps mur au temps simulé (même
  // principe que le moteur Pico). L'ancien « dt depuis la tranche précédente »
  // repartait de l'instant courant à chaque tranche : tout le temps passé
  // ailleurs (repeinture de la page, moniteur série…) était perdu pour la
  // simulation, sans jamais être rattrapé. Ici la cible est calculée depuis
  // l'ancre, donc un retard passager se résorbe.
  private paceWall = 0; // performance.now() de l'ancre (0 = à ré-ancrer)
  private paceCycles = 0; // cpu.cycles au moment de l'ancre
  private busyAccum = 0; // temps réel cumulé passé DANS la boucle (diagnostic)
  /** Yield sans clampage : un setTimeout(0) imbriqué est bridé à ~4 ms par le navigateur. */
  private readonly yieldPort: MessagePort | null = ((): MessagePort | null => {
    if (typeof MessageChannel !== 'function') return null;
    const ch = new MessageChannel();
    ch.port2.onmessage = (e: MessageEvent): void => {
      if (e.data === this.yieldGen && this.running) this.loop();
    };
    // Node (bancs de test) : sans unref, les ports garderaient le process en vie.
    (ch.port1 as unknown as { unref?: () => void }).unref?.();
    (ch.port2 as unknown as { unref?: () => void }).unref?.();
    return ch.port1;
  })();
  private yieldGen = 0; // invalide les yields en vol après un stop
  private running = false;
  private rxQueue: number[] = [];
  private isPaused = false;
  private speed = 1; // fraction du temps réel exécutée à chaque frame
  private debugInfo: AvrDebugInfo | null = null;
  private breakpoints = new Set<number>(); // adresses flash (octets) des points d'arrêt
  private skipBreakAddr: number | null = null; // adresse à ne pas re-déclencher après un arrêt
  // Pas à pas « par-dessus » exécuté en arrière-plan par la boucle RAF (cf. step()
  // et loop()) : on avance jusqu'à une autre ligne du sketch revenue au niveau de
  // pile de départ, sans figer l'UI même sur un delay() long.
  private stepping = false;
  private stepStartLine: number | undefined = undefined;
  private stepStartSp = 0;
  // Décodage UTF-8 incrémental de la liaison série : un caractère accentué
  // (ex. « é » = 2 octets) est émis octet par octet par l'USART ; le décodeur
  // en flux tampon les séquences incomplètes pour restituer le bon caractère.
  private serialDecoder = new TextDecoder('utf-8');
  /** Décodeurs DMX512 par broche TX déclarée (cf. setDmx) — vide en temps normal. */
  private dmxByPin = new Map<string, DmxDecoder>();
  /** Décodeur DMX de chaque USART, indexé comme `usarts` (0 = Serial). */
  private dmxByUsart: Array<DmxDecoder | null> = [];
  /**
   * Lignes DMX512 bit-bangées : broches SANS UART matériel (DmxSimple sort sur
   * la broche 3 par défaut). Vide en temps normal — c'est ce qui rend
   * `sampleDmxWire` gratuit sur les autres montages.
   */
  private dmxWires: Array<{ port: PortKey; bit: number; wire: DmxWire }> = [];
  /** Ces mêmes lignes, par nom de broche : un recâblage réutilise le décodeur. */
  private dmxWiresByPin = new Map<string, DmxWire>();

  // Famille AVR ciblée : 'avr328' (Uno / Nano / Pro Mini) ou 'avr2560' (Mega).
  private readonly family: AvrFamily;

  // Mesure de largeur d'impulsion (servo) : broches surveillées + état d'arête.
  private pulsePins: Array<{ name: string; port: PortKey; bit: number }> = [];
  // Rapport cyclique (readPwmDuty) : intégré sur des PÉRIODES COMPLÈTES, d'un
  // front montant au suivant. `accHigh`/`accTotal` cumulent les périodes closes
  // depuis la dernière lecture, `curHigh` le temps haut de la période en cours,
  // `perStart` son début. Mesurer sur une fenêtre quelconque (l'ancien procédé)
  // laissait une période tronquée à chaque bout : la luminosité affichée
  // oscillait de quelques pour cent d'une image à l'autre. `lastDuty` est
  // conservée tant qu'aucune période complète n'est écoulée.
  private pulseState = new Map<
    string,
    {
      high: boolean; rise: number; lastUs: number; lastEdge: number;
      perStart: number; curHigh: number; accHigh: number; accTotal: number;
      lastPeriod: number; lastRead: number; lastDuty: number;
    }
  >();

  // Capteurs ultrason + actions d'entrée programmées en temps simulé (génération ECHO).
  private ultrasonic: UltrasonicSensor[] = [];
  // `suite` : les fronts qui suivent celui-ci, datés en RELATIF (cycles après
  // son application réelle). Une trame série fait des centaines de fronts :
  // les empiler tous dans la file les ferait tous relire après CHAQUE
  // instruction — un seul front attend, la suite se déroule d'elle-même.
  private scheduled: Array<{
    cycle: number; name: string; value: boolean;
    suite?: Array<{ apres: number; value: boolean }>;
    // Instant reel d'application de la TETE : toute la suite s'y rapporte.
    base?: number;
  }> = [];

  // Chaînes NeoPixel : décodeur WS2812 par broche DIN surveillée.
  private neopixels: Array<{ name: string; port: PortKey; bit: number; dec: Ws2812Decoder; last: boolean }> = [];

  // Afficheurs LCD parallèles : décodeur HD44780 par composant. `data` = broches
  // (port,bit) LSB→MSB ; `fourBit` déduit à la déclaration ; `lastE` = état de E.
  private lcdParallel: Array<{
    id: string;
    core: Hd44780;
    rs: [PortKey, number];
    e: [PortKey, number];
    data: Array<[PortKey, number]>;
    fourBit: boolean;
    lastE: boolean;
  }> = [];

  // Claviers matriciels : touches enfoncées → colonnes tirées à LOW (re-calculé
  // à chaque changement de port). Garde-fou de ré-entrance + dernier niveau posé.
  private keypads: KeypadConfig[] = [];
  private applyingKeypads = false;
  private keypadPinLevel = new Map<string, boolean>();
  private spiDevices: SpiDevice[] = [];
  private spiSelected = new Map<SpiDevice, boolean>();

  // Capteurs DHT22 : surveillance du signal de départ (1-wire) par broche.
  private dht22: Dht22Monitor[] = [];

  constructor(
    program: Uint16Array,
    debugInfo?: AvrDebugInfo | null,
    family: AvrFamily = 'avr328'
  ) {
    this.family = family;
    this.debugInfo = debugInfo ?? null;
    const isMega = family === 'avr2560';
    // Le Mega a 8 Ko de SRAM (pile en haut, RAMEND 0x21FF) : l'espace données par
    // défaut (328P) serait trop petit et la pile déborderait.
    this.cpu = isMega ? new CPU(program.slice(), MEGA_SRAM_BYTES) : new CPU(program.slice());
    // avr8js déduit la taille du PC (16 vs 22 bits) de la TAILLE du programme
    // (> 128 Ko ⇒ 22 bits). Or l'ATmega2560 a TOUJOURS un PC 22 bits : son
    // avr-gcc émet des EICALL qui empilent une adresse de retour sur 3 octets,
    // tandis que CALL/RET/RCALL et le saut d'interruption ne suivent pc22Bits
    // que pour 2 octets quand le firmware est petit. Le désaccord (push 3 / pop 2)
    // désaligne la pile : SP dérive dans la .bss, écrase timer0_overflow_count
    // (micros() délire → delay() boucle) et finit par planter (un blink simple
    // sans EICALL passe, mais dès qu'on touche à Serial/objets C++ ça casse).
    // On force donc le mode 22 bits pour le Mega quelle que soit la taille.
    // (pc22Bits est typé `readonly` par avr8js mais reste mutable au runtime.)
    if (isMega) (this.cpu as { pc22Bits: boolean }).pc22Bits = true;
    this.pinMap = isMega ? MEGA_PINS : UNO_PINS;
    this.adcMap = isMega ? MEGA_ADC : UNO_ADC;
    this.ports = isMega
      ? {
          A: new AVRIOPort(this.cpu, portAConfig),
          B: new AVRIOPort(this.cpu, portBConfig),
          C: new AVRIOPort(this.cpu, portCConfig),
          D: new AVRIOPort(this.cpu, portDConfig),
          E: new AVRIOPort(this.cpu, portEConfig),
          F: new AVRIOPort(this.cpu, portFConfig),
          G: new AVRIOPort(this.cpu, portGConfig),
          H: new AVRIOPort(this.cpu, portHConfig),
          J: new AVRIOPort(this.cpu, portJConfig),
          K: new AVRIOPort(this.cpu, portKConfig),
          L: new AVRIOPort(this.cpu, portLConfig),
        }
      : {
          B: new AVRIOPort(this.cpu, portBConfig),
          C: new AVRIOPort(this.cpu, portCConfig),
          D: new AVRIOPort(this.cpu, portDConfig),
        };
    // Configs avec vecteurs d'interruption corrigés pour le Mega (cf. MEGA_TIMER*…).
    this.usart = new AVRUSART(this.cpu, isMega ? MEGA_USART0 : usart0Config, CLOCK_HZ);
    this.twi = new AVRTWI(this.cpu, isMega ? MEGA_TWI : twiConfig, CLOCK_HZ); // bus I²C (Wire) — esclaves branchés via setI2cDevices
    this.spi = new AVRSPI(this.cpu, isMega ? MEGA_SPI : spiConfig, CLOCK_HZ); // bus SPI — esclave branché via setSpiDevices
    this.adc = new AVRADC(this.cpu, isMega ? MEGA_ADC_CONFIG : adcConfig);
    // Échantillonnage à l'instant EXACT de la conversion : on rafraîchit la
    // tension du canal juste avant que l'implémentation par défaut la lise.
    {
      const defaultRead = this.adc.onADCRead;
      this.adc.onADCRead = (input): void => {
        if (input.type === ADCMuxInputType.SingleEnded) {
          const sample = this.analogSamplers.get(input.channel);
          if (sample) this.adc.channelValues[input.channel] = Math.max(0, Math.min(1, sample())) * VREF;
        }
        defaultRead(input);
      };
    }
    this.timers = isMega
      ? [
          new AVRTimer(this.cpu, MEGA_TIMER0),
          new AVRTimer(this.cpu, MEGA_TIMER1),
          new AVRTimer(this.cpu, MEGA_TIMER2),
          new AVRTimer(this.cpu, MEGA_TIMER3),
          new AVRTimer(this.cpu, MEGA_TIMER4),
          new AVRTimer(this.cpu, MEGA_TIMER5),
        ]
      : [
          new AVRTimer(this.cpu, timer0Config),
          new AVRTimer(this.cpu, timer1Config),
          new AVRTimer(this.cpu, timer2Config),
        ];

    for (const port of Object.values(this.ports)) {
      // À chaque changement de port : échantillonne les impulsions (servo) puis
      // rafraîchit l'affichage.
      port?.addListener(() => {
        if (this.dmxWires.length) this.sampleDmxWire();
        this.samplePulses();
        this.sampleNeopixels();
        this.sampleLcdParallel();
        this.sampleDht22();
        this.sampleSpiSelect();
        this.applyKeypads();
        this.onUpdate?.();
      });
    }
    this.usart.onByteTransmit = (b: number) => {
      // Ligne DMX512 branchée sur cette sortie : l'octet part au décodeur et
      // S'ARRÊTE LÀ (voir setDmx). Une trame, ce sont 513 octets binaires : les
      // relayer noierait le moniteur série sous des caractères de contrôle.
      // `dmxByUsart` est vide en temps normal, le test tient en une comparaison.
      if (this.dmxByUsart[0]) {
        this.dmxByUsart[0].feed(b, this.cpu.cycles / CYCLES_PER_US);
        return;
      }
      const text = this.serialDecoder.decode(Uint8Array.of(b), { stream: true });
      if (text) this.onSerial?.(text);
    };
    // Serial1/2/3 (Mega) : chaque USART a son propre décodeur UTF-8 et émet vers
    // le même moniteur série. Sans instanciation, un sketch qui utilise Serial1
    // resterait bloqué (registres absents, ISR au mauvais vecteur).
    if (isMega) {
      for (const [i, cfg] of [MEGA_USART1, MEGA_USART2, MEGA_USART3].entries()) {
        const u = new AVRUSART(this.cpu, cfg, CLOCK_HZ);
        const decoder = new TextDecoder('utf-8');
        u.onByteTransmit = (b: number) => {
          const dmx = this.dmxByUsart[i + 1];
          if (dmx) {
            dmx.feed(b, this.cpu.cycles / CYCLES_PER_US);
            return; // ligne DMX : rien de lisible à envoyer au moniteur
          }
          const text = decoder.decode(Uint8Array.of(b), { stream: true });
          if (text) this.onSerial?.(text);
        };
        this.usarts.push(u);
      }
    }
  }

  /**
   * Broches TX qui portent une ligne DMX512 (cf. SimEngine.setDmx). Le numéro
   * d'USART est déduit du nom de la broche : sur le 328P il n'y en a qu'un
   * (broche 1 = TX de Serial), le Mega en a quatre (1, 18, 16, 14).
   */
  setDmx(pins: string[]): void {
    const TX = this.family === 'avr2560'
      ? { '1': 0, '18': 1, '16': 2, '14': 3 }
      : { '1': 0 };
    const garde = new Map<string, DmxDecoder>();
    const fils: Array<{ port: PortKey; bit: number; wire: DmxWire }> = [];
    const gardeFils = new Map<string, DmxWire>();
    this.dmxByUsart = [];
    for (const pin of pins) {
      const usart = (TX as Record<string, number | undefined>)[pin];
      if (usart !== undefined) {
        const dec = this.dmxByPin.get(pin) ?? new DmxDecoder();
        garde.set(pin, dec);
        this.dmxByUsart[usart] = dec;
        continue;
      }
      // Broche ordinaire : la trame est produite à la main (DmxSimple), rien ne
      // passe par l'UART. On décode alors le FIL, front par front.
      const map = this.pinMap[pin];
      if (!map) continue;
      const wire = this.dmxWiresByPin.get(pin) ?? new DmxWire();
      gardeFils.set(pin, wire);
      garde.set(pin, wire.decoder);
      fils.push({ port: map[0], bit: map[1], wire });
    }
    this.dmxWiresByPin = gardeFils;
    this.dmxWires = fils;
    this.dmxByPin = garde;
  }

  /**
   * Niveau des broches DMX bit-bangées, daté au cycle près. Appelé à CHAQUE
   * écriture de port : la boucle est vide tant qu'aucune ligne de ce genre n'est
   * câblée (cf. le test dans le listener).
   */
  private sampleDmxWire(): void {
    const us = this.cpu.cycles / CYCLES_PER_US;
    for (const f of this.dmxWires) {
      f.wire.sample(this.ports[f.port]?.pinState(f.bit) === PinState.High, us);
    }
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

  /** Temps simulé depuis le démarrage (ms) : cycles CPU ÷ horloge de la carte. */
  simulatedMs(): number {
    return (this.cpu.cycles / CLOCK_HZ) * 1000;
  }

  /** Temps réel cumulé passé dans la boucle du moteur (ms) — voir SimEngine.busyMs. */
  busyMs(): number {
    return this.busyAccum;
  }

  readDigital(name: string): boolean {
    const map = this.pinMap[name];
    if (!map) return false;
    const [port, bit] = map;
    return this.ports[port]?.pinState(bit) === PinState.High;
  }

  /** Ce que le cœur impose sur la broche (voir SimEngine.readPinDrive). */
  readPinDrive(name: string): 'high' | 'low' | 'pullup' | 'pulldown' | 'hiz' {
    const map = this.pinMap[name];
    if (!map) return 'hiz';
    switch (this.ports[map[0]]?.pinState(map[1])) {
      case PinState.High:
        return 'high';
      case PinState.Low:
        return 'low';
      case PinState.InputPullUp:
        return 'pullup';
      default:
        return 'hiz'; // PinState.Input : entrée sans rappel (l'AVR n'a pas de pull-down)
    }
  }

  setInput(name: string, value: boolean): void {
    const map = this.pinMap[name];
    if (!map) return;
    const [port, bit] = map;
    this.ports[port]?.setPin(bit, value);
  }

  setPulseMonitors(names: string[]): void {
    this.pulsePins = [];
    for (const name of names) {
      const m = this.pinMap[name];
      if (!m) continue;
      this.pulsePins.push({ name, port: m[0], bit: m[1] });
      if (!this.pulseState.has(name)) {
        this.pulseState.set(name, {
          high: false, rise: 0, lastUs: 0, lastEdge: 0,
          perStart: -1, curHigh: 0, accHigh: 0, accTotal: 0,
          lastPeriod: 0, lastRead: this.cpu.cycles, lastDuty: 0,
        });
      }
    }
  }

  readPulseUs(name: string): number {
    return this.pulseState.get(name)?.lastUs ?? 0;
  }

  /**
   * Vrai si la broche OSCILLE : au moins une période complète mesurée, et un
   * front il y a moins de 60 ms simulées. Un front isolé ne suffit pas — un
   * simple `digitalWrite` en produit un, et le prendre pour un signal carré
   * faisait lire un rapport cyclique là où il n'y a qu'un niveau.
   */
  pulseActive(name: string): boolean {
    const st = this.pulseState.get(name);
    if (!st || st.lastPeriod === 0) return false;
    return this.cpu.cycles - st.lastEdge < 60_000 * CYCLES_PER_US;
  }

  /**
   * Rapport cyclique (0..1) des périodes PWM COMPLÈTES écoulées depuis la
   * dernière lecture. Une période tronquée fausserait la moyenne selon la phase :
   * seules les périodes closes (front montant → front montant) sont comptées, et
   * la dernière valeur est conservée tant qu'il n'y en a aucune.
   *
   * Sortie FIGÉE (le programme est passé à `digitalWrite`, ou à un rapport
   * cyclique extrême) : plus aucun front n'arrive. On le reconnaît à un silence
   * de plus de deux périodes — la mesure retombe alors sur le niveau de la
   * broche, sans quoi une LED passée à fond resterait affichée à son ancienne
   * luminosité. Le plafond de 100 ms couvre le cas où aucune période n'a encore
   * été mesurée.
   */
  readPwmDuty(name: string): number {
    const st = this.pulseState.get(name);
    if (!st) return this.readDigital(name) ? 1 : 0;
    const now = this.cpu.cycles;
    // Sortie figée : l'état présent prime sur ce qui reste en cumul (périodes du
    // régime précédent). Sinon `analogWrite(pin, 255)` juste après un 128
    // afficherait encore l'ancien rapport cyclique.
    const fige =
      st.lastPeriod > 0
        ? now - st.lastEdge > 2 * st.lastPeriod
        : now - st.lastRead > 100_000 * CYCLES_PER_US;
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

  /** Relie des esclaves I²C au bus : le maître TWI route vers eux par adresse. */
  setI2cDevices(devices: I2cDevice[]): void {
    const twi = this.twi;
    let current: I2cDevice | null = null;
    twi.eventHandler = {
      start: (repeated: boolean) => {
        for (const d of devices) d.onStart?.(repeated);
        twi.completeStart();
      },
      stop: () => {
        current?.onStop?.();
        current = null;
        twi.completeStop();
      },
      connectToSlave: (addr: number) => {
        // General Call (0x00) : dirigé vers le 1er device qui l'accepte (SWRST
        // du PCA9685), sinon NAK. Symétrique du routage Pico.
        if (addr === 0) {
          current = devices.find((d) => d.generalCall) ?? null;
          current?.setGeneralCall?.(true);
        } else {
          current = devices.find((d) => d.address === addr) ?? null;
          current?.setGeneralCall?.(false);
        }
        twi.completeConnect(current !== null); // ACK seulement si l'adresse existe
      },
      writeByte: (value: number) => {
        twi.completeWrite(current ? current.write(value) : false);
      },
      readByte: () => {
        twi.completeRead(current ? current.read() : 0xff);
      },
    };
  }

  setNeopixels(strips: Array<{ pin: string; count: number }>): void {
    this.neopixels = [];
    for (const s of strips) {
      const m = this.pinMap[s.pin];
      if (!m) continue;
      this.neopixels.push({
        name: s.pin,
        port: m[0],
        bit: m[1],
        dec: new Ws2812Decoder(s.count, CYCLES_PER_US),
        last: false,
      });
    }
  }

  readNeopixel(pin: string): Array<{ r: number; g: number; b: number }> {
    const n = this.neopixels.find((np) => np.name === pin);
    if (!n) return [];
    n.dec.flush(); // classe le dernier bit (la trame est terminée à la lecture)
    return n.dec.colors;
  }

  /** Alimente les décodeurs WS2812 avec les fronts des broches DIN surveillées. */
  private sampleNeopixels(): void {
    if (this.neopixels.length === 0) return;
    const now = this.cpu.cycles;
    for (const n of this.neopixels) {
      const level = this.ports[n.port]?.pinState(n.bit) === PinState.High;
      if (level !== n.last) {
        n.dec.edge(now, level);
        n.last = level;
      }
    }
  }

  setLcdParallel(displays: LcdParallelConfig[]): void {
    this.lcdParallel = [];
    for (const d of displays) {
      const rs = this.pinMap[d.rs];
      const e = this.pinMap[d.e];
      const data = d.data.map((p) => this.pinMap[p]);
      if (!rs || !e || data.some((m) => !m)) continue; // câblage incomplet
      this.lcdParallel.push({
        id: d.id,
        core: new Hd44780(d.cols, d.rows),
        rs,
        e,
        data: data as Array<[PortKey, number]>,
        fourBit: data.length === 4,
        lastE: false,
      });
    }
  }

  readLcdParallel(id: string): string[] {
    return this.lcdParallel.find((l) => l.id === id)?.core.text ?? [];
  }

  /**
   * Décode les afficheurs HD44780 parallèles : sur chaque front descendant de E,
   * lit RS + lignes de données (octet en 8 bits, quartet en 4 bits) et alimente
   * le cœur d'affichage.
   */
  private sampleLcdParallel(): void {
    if (this.lcdParallel.length === 0) return;
    for (const l of this.lcdParallel) {
      const e = this.ports[l.e[0]]?.pinState(l.e[1]) === PinState.High;
      if (l.lastE && !e) {
        const rs = this.ports[l.rs[0]]?.pinState(l.rs[1]) === PinState.High;
        let bits = 0;
        for (let i = 0; i < l.data.length; i++) {
          if (this.ports[l.data[i][0]]?.pinState(l.data[i][1]) === PinState.High) bits |= 1 << i;
        }
        if (l.fourBit) l.core.writeNibble(bits, rs);
        else l.core.writeByte(bits, rs);
      }
      l.lastE = e;
    }
  }

  /**
   * Relie des esclaves SPI : à chaque octet, on route vers le périphérique dont
   * la broche CS est active (bas), ou celui sans CS à défaut.
   */
  setSpiDevices(devices: SpiDevice[]): void {
    this.spiDevices = devices;
    this.spiSelected.clear();
    this.spi.onByte = (mosi: number) => {
      const dev = selectSpiDevice(devices, (p) => this.readDigital(p));
      if (!dev) {
        this.spi.completeTransfer(0xff);
        return;
      }
      const dc = dev.dcPin ? this.readDigital(dev.dcPin) : false;
      this.spi.completeTransfer(dev.transfer(mosi, dc));
    };
  }

  /**
   * Surveille les broches CS pour prévenir les périphériques qui le demandent
   * (`onSelect`). Une carte SD s'en sert pour repartir d'une trame propre : sans
   * cela, une commande interrompue en cours de route laissait des octets de
   * réponse en attente, décalant toutes les suivantes.
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

  /**
   * Suite de fronts sur une broche (trame série d'une carte RFID…) : seul le
   * premier entre dans la file, les autres le suivent au fur et à mesure.
   */
  emitPulses(pin: string, edges: Array<{ afterUs: number; level: boolean }>): void {
    if (edges.length === 0) return;
    const [premier, ...reste] = edges;
    // Ecarts d'un front au suivant en entree, dates depuis la tete dans la file.
    let cumul = 0;
    this.scheduled.push({
      cycle: this.cpu.cycles + Math.max(0, premier.afterUs) * CYCLES_PER_US,
      name: pin,
      value: premier.level,
      suite: reste.map((e) => {
        cumul += Math.max(0, e.afterUs) * CYCLES_PER_US;
        return { apres: cumul, value: e.level };
      }),
    });
  }

  setUltrasonic(sensors: UltrasonicSensor[]): void {
    this.ultrasonic = sensors;
    this.scheduled = [];
    // Surveille les broches TRIG (en plus des broches déjà suivies, ex. servo).
    for (const s of sensors) {
      const m = this.pinMap[s.trig];
      if (!m) continue;
      if (!this.pulsePins.some((p) => p.name === s.trig)) {
        this.pulsePins.push({ name: s.trig, port: m[0], bit: m[1] });
      }
      if (!this.pulseState.has(s.trig)) {
        this.pulseState.set(s.trig, {
          high: false, rise: 0, lastUs: 0, lastEdge: 0,
          perStart: -1, curHigh: 0, accHigh: 0, accTotal: 0,
          lastPeriod: 0, lastRead: this.cpu.cycles, lastDuty: 0,
        });
      }
    }
  }

  setKeypads(keypads: KeypadConfig[]): void {
    this.keypads = keypads;
    this.keypadPinLevel.clear();
    // Lignes ET colonnes au repos = HAUT (pull-up). Le firmware lit ce niveau tant
    // qu'aucune touche ne relie la broche à une broche pilotée à LOW. Ne forcer que
    // les colonnes laissait les lignes à leur niveau externe par défaut (BAS) : la
    // bibliothèque Keypad, qui lit les LIGNES, voyait alors les 16 touches
    // enfoncées en permanence.
    for (const kp of keypads) {
      for (const row of kp.rows) if (row) this.setInput(row, true);
      for (const col of kp.cols) if (col) this.setInput(col, true);
    }
  }

  /**
   * Réévalue les contacts du clavier hors changement de port : appelée quand
   * l'utilisateur appuie/relâche une touche. Sans elle, une touche enfoncée alors
   * que sa ligne est déjà basse (cas courant en pas à pas, où plus rien ne bouge
   * entre deux pas) n'était vue qu'au balayage suivant — jamais en pas à pas.
   */
  syncKeypads(): void {
    this.applyKeypads();
  }

  /** Vrai si la broche est PILOTÉE à LOW (sortie basse), pas seulement flottante. */
  private pinDrivenLow(name: string): boolean {
    const map = this.pinMap[name];
    if (!map) return false;
    return this.ports[map[0]]?.pinState(map[1]) === PinState.Low;
  }

  /**
   * Recalcule le niveau des broches de chaque clavier. Une touche enfoncée est un
   * simple contact entre sa ligne et sa colonne : le balayage marche dans les DEUX
   * sens, et la bibliothèque choisit lequel. Beaucoup de sketches mettent une
   * LIGNE en sortie BASSE puis lisent les colonnes ; la bibliothèque Keypad
   * d'Arduino fait l'inverse (lignes en INPUT_PULLUP, impulsion BASSE sur chaque
   * COLONNE). On tire donc le côté non piloté vers le côté piloté à LOW, quel que
   * soit le sens. Les broches en haute impédance sont ignorées : sans cela, une
   * touche enfoncée en ferait apparaître d'autres (touches fantômes). Garde-fou de
   * ré-entrance : `setInput` redéclenche l'écouteur de port.
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

  setDht22(sensors: Dht22Sensor[]): void {
    const before = this.dht22;
    this.dht22 = sensors.map((s) => {
      // Curseur bougé pendant une lecture : on MET À JOUR le moniteur existant.
      // Le recréer remettait à zéro l'état de détection ET reforçait la ligne à
      // HAUT, ce qui coupait la trame en cours d'émission : la bibliothèque
      // Arduino voyait un checksum faux, renvoyait NaN, et le sketch conservait
      // sa valeur précédente — d'où « le DHT22 ne marche que la première fois,
      // après il relit toujours la même valeur » (v205).
      const prev = before.find((d) => d.pin === s.pin);
      if (prev) {
        prev.tempC = s.temperatureC;
        prev.humidity = s.humidity;
        prev.model = s.model ?? 'dht22';
        return prev;
      }
      return {
        pin: s.pin,
        tempC: s.temperatureC,
        humidity: s.humidity,
        model: s.model ?? 'dht22',
        wasLow: false,
        lowStart: 0,
        busyUntil: 0,
      };
    });
    // Ligne de données au repos = HAUT (pull-up) ; le MCU la tire BAS pour
    // démarrer. Réservé aux capteurs NOUVEAUX : forcer les autres écraserait la
    // réponse en cours.
    for (const d of this.dht22) if (!before.includes(d)) this.setInput(d.pin, true);
  }

  /**
   * Détecte le signal de départ du DHT22 (ligne tenue BASSE ≥ ~0,5 ms puis
   * relâchée) et programme la réponse (accusé + 40 bits) en temps simulé.
   */
  private sampleDht22(): void {
    if (this.dht22.length === 0) return;
    const now = this.cpu.cycles;
    for (const d of this.dht22) {
      const map = this.pinMap[d.pin];
      if (!map) continue;
      const low = this.ports[map[0]]?.pinState(map[1]) === PinState.Low;
      if (low && !d.wasLow) {
        d.wasLow = true;
        d.lowStart = now;
      } else if (!low && d.wasLow) {
        d.wasLow = false;
        const lowUs = (now - d.lowStart) / CYCLES_PER_US;
        if (lowUs >= DHT22_START_LOW_US && now >= d.busyUntil) {
          const start = now + 30 * CYCLES_PER_US; // ~30 µs après le relâchement
          const sched = buildDht22Schedule(d.tempC, d.humidity, start, CYCLES_PER_US, d.model);
          for (const ev of sched) this.scheduled.push({ cycle: ev.cycle, name: d.pin, value: ev.value });
          d.busyUntil = start + dht22ResponseCycles(sched, start);
        }
      }
    }
  }

  /** Mesure la durée de l'état haut sur les broches surveillées (front montant→descendant). */
  private samplePulses(): void {
    if (this.pulsePins.length === 0) return;
    const now = this.cpu.cycles;
    for (const pp of this.pulsePins) {
      const high = this.ports[pp.port]?.pinState(pp.bit) === PinState.High;
      const st = this.pulseState.get(pp.name);
      if (!st) continue;
      if (high && !st.high) {
        st.high = true;
        st.rise = now;
        st.lastEdge = now; // front montant : la broche bascule (activité)
        // Front montant = fin d'une période PWM et début de la suivante. La
        // période close est ajoutée telle quelle au cumul (readPwmDuty).
        if (st.perStart >= 0) {
          const per = now - st.perStart;
          // Une période dont la durée n'a rien à voir avec la précédente n'est
          // pas une période du même signal : c'est le moment où le programme a
          // changé de régime (nouvel analogWrite, PWM coupé, note suivante).
          // La compter fausserait la moyenne — on la saute, et la suivante,
          // mesurée sur le nouveau régime, sera prise.
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
        const widthUs = (now - st.rise) / CYCLES_PER_US;
        st.lastUs = widthUs; // dernière largeur d'impulsion haute (servo, fréquence buzzer)
        st.curHigh += now - st.rise; // temps haut de la période en cours
        this.maybeFireEcho(pp.name, widthUs); // une impulsion TRIG déclenche ECHO
      }
    }
  }

  /** Sur une impulsion TRIG valide (≥ 8 µs), programme l'impulsion ECHO correspondante. */
  private maybeFireEcho(trigName: string, widthUs: number): void {
    if (widthUs < 8) return;
    for (const s of this.ultrasonic) {
      if (s.trig !== trigName) continue;
      const cm = Math.max(2, Math.min(400, s.distanceCm || 0)); // plage HC-SR04 : 2–400 cm
      const start = this.cpu.cycles + 200 * CYCLES_PER_US; // ~200 µs de latence capteur
      // Durée d'écho = distance × µs/cm, ce dernier VARIANT AVEC LA TEMPÉRATURE
      // (vitesse du son). 20 °C → 58,24 µs/cm, la constante des exemples Arduino.
      const widthCycles = cm * echoUsPerCm(s.temperatureC ?? DEFAULT_AIR_TEMP_C) * CYCLES_PER_US;
      this.scheduled.push({ cycle: start, name: s.echo, value: true });
      this.scheduled.push({ cycle: start + widthCycles, name: s.echo, value: false });
    }
  }

  /** Applique les actions d'entrée programmées arrivées à échéance (temps simulé). */
  private fireScheduled(): void {
    const now = this.cpu.cycles;
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      if (now >= this.scheduled[i].cycle) {
        const a = this.scheduled[i];
        this.setInput(a.name, a.value);
        this.scheduled.splice(i, 1);
        // La suite garde l'instant de depart de la tete : sinon le retard de
        // chaque lot d'instructions s'ajouterait front apres front et la trame
        // s'etirerait au point d'etre illisible.
        const suite = a.suite;
        if (suite && suite.length > 0) {
          const base = a.base ?? now;
          const [prochain, ...reste] = suite;
          this.scheduled.push({
            cycle: base + prochain.apres, name: a.name, value: prochain.value, suite: reste, base,
          });
        }
      }
    }
  }

  setAnalog(name: string, fraction: number): void {
    const ch = this.adcMap[name];
    if (ch === undefined) return;
    this.adc.channelValues[ch] = Math.max(0, Math.min(1, fraction)) * VREF;
  }

  /** cf. SimEngine.setAnalogSampler — la tension est relue à l'instant exact de la conversion. */
  setAnalogSampler(name: string, sample: (() => number) | null): void {
    const ch = this.adcMap[name];
    if (ch === undefined) return;
    if (sample) this.analogSamplers.set(ch, sample);
    else this.analogSamplers.delete(ch);
  }

  writeSerial(text: string): void {
    // Encodage UTF-8 (un caractère accentué saisi devient plusieurs octets).
    for (const byte of new TextEncoder().encode(text)) this.rxQueue.push(byte);
    this.flushRx();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.paceWall = 0; // (ré)ancrage au premier tour
    this.loop();
  }

  stop(): void {
    this.running = false;
    this.stepping = false;
    this.paceWall = 0;
    this.yieldGen++; // un yield déjà posté ne relancera pas la boucle
    if (this.rafId !== null) {
      clearTimeout(this.rafId);
      this.rafId = null;
    }
  }

  dispose(): void {
    this.stop();
  }

  get paused(): boolean {
    // Pendant un pas en arrière-plan, isPaused est faux (la boucle tourne) mais
    // l'UI doit rester en état « pause » → on inclut stepping.
    return this.isPaused || this.stepping;
  }

  pause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.emitDebugPause();
  }

  resume(): void {
    this.stepping = false;
    this.isPaused = false;
  }

  setSpeed(fraction: number): void {
    // Au-dessus de 1× la cible est simplement plus haute : la boucle exécute
    // autant de cycles qu'elle peut dans sa frame, et le retard irrattrapable
    // ré-ancre sans dette (MAX_DEBT_MS) — donc pas d'emballement, juste « aussi
    // vite que la machine le permet ». Le plafond à 1× d'avant interdisait tout
    // accéléré ; il est levé (menu 🐆 200 %, 🦅 500 %).
    this.speed = Math.max(0.001, Math.min(100, fraction));
    this.paceWall = 0; // le facteur change : l'ancre repart d'ici
  }

  /**
   * Avance jusqu'à la prochaine ligne source du sketch (ou un point d'arrêt).
   * Pas « par-dessus » (step over) : on ne s'arrête qu'une fois revenu au niveau
   * de pile de départ, donc un appel (delay(), Serial.print(), une fonction de
   * l'élève…) est exécuté d'un bloc au lieu d'être parcouru instruction par
   * instruction. La table DWARF ne contient que les lignes du sketch : pendant
   * un appel au cœur Arduino, lineForPc renvoie une ligne périmée — la garde sur
   * SP évite de s'arrêter dessus.
   *
   * Exécution déléguée à la boucle RAF (cf. loop()) au lieu d'une boucle
   * synchrone : un delay() de plusieurs secondes se franchit en UN clic sans
   * figer l'interface (le pas s'écoule au rythme de la simulation). isPaused
   * passe à faux pour laisser tourner la boucle, mais `paused` reste vrai (via
   * `stepping`) afin que l'UI conserve l'état « pause ».
   */
  step(): void {
    if (!this.debugInfo || this.debugInfo.lines.length === 0) return;
    if (this.stepping) return; // un pas déjà en cours
    this.stepStartLine = this.currentLine();
    this.stepStartSp = this.cpu.SP;
    this.stepping = true;
    this.isPaused = false;
  }

  /**
   * Convertit les lignes cochées en adresses flash (1re entrée par ligne). Les
   * conditions (champ `condition`) ne sont pas évaluées côté C/AVR : il faudrait
   * un évaluateur d'expression C sur les globales DWARF (hors périmètre). Un
   * point d'arrêt conditionnel en C se comporte donc comme inconditionnel.
   */
  setBreakpoints(breakpoints: Breakpoint[]): void {
    this.breakpoints.clear();
    if (!this.debugInfo) return;
    const wanted = new Set(breakpoints.map((b) => b.line));
    for (const entry of this.debugInfo.lines) {
      // Table triée par adresse : delete() ne retient que la première entrée.
      if (wanted.delete(entry.line)) this.breakpoints.add(entry.addr);
    }
  }

  /** Ligne source pour une adresse flash en octets (recherche dichotomique). */
  private lineForPc(pcBytes: number): number | undefined {
    const table = this.debugInfo?.lines;
    if (!table || table.length === 0 || pcBytes < table[0].addr) return undefined;
    let lo = 0;
    let hi = table.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (table[mid].addr <= pcBytes) lo = mid;
      else hi = mid - 1;
    }
    return table[lo].line;
  }

  /** Ligne source associée au PC courant, d'après la table DWARF. */
  private currentLine(): number | undefined {
    return this.lineForPc(this.cpu.pc * 2); // PC AVR en mots, table DWARF en octets
  }

  /** Lit les globales en SRAM (little-endian) pour le panneau Variables. */
  private readVariables(): DebugVariable[] {
    if (!this.debugInfo) return [];
    const data = this.cpu.data;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const out: DebugVariable[] = [];
    for (const g of this.debugInfo.globals) {
      if (g.addr + g.size > data.length) continue;
      const type = (g.type ?? '').toLowerCase();
      const unsigned = type.includes('unsigned') || type.startsWith('uint') || type === 'bool';
      let value: string;
      // Sur AVR, `double` = flottant 32 bits (identique à float) : même décodage.
      if (g.size === 4 && (type.includes('float') || type.includes('double'))) {
        // Float IEEE 754 ; arrondi pour masquer le bruit binaire (3.1400001…).
        value = String(Math.round(view.getFloat32(g.addr, true) * 1e6) / 1e6);
      } else if (g.size === 1) {
        const n = unsigned ? view.getUint8(g.addr) : view.getInt8(g.addr);
        value = type.includes('bool') ? (n ? 'true' : 'false') : String(n);
      } else if (g.size === 2) {
        value = String(unsigned ? view.getUint16(g.addr, true) : view.getInt16(g.addr, true));
      } else {
        value = String(unsigned ? view.getUint32(g.addr, true) : view.getInt32(g.addr, true));
      }
      out.push({ name: g.name, value, type: g.type });
    }
    return out;
  }

  /** Publie l'état courant (ligne + variables) vers le panneau de débogage. */
  private emitDebugPause(): void {
    if (!this.onDebugPause) return;
    this.onDebugPause({ line: this.currentLine(), variables: this.readVariables() });
    this.onUpdate?.();
  }

  // L'USART ne peut recevoir qu'un octet à la fois : on vide la file dès que
  // le récepteur est libre (réessai à la frame suivante sinon).
  private flushRx(): void {
    while (this.rxQueue.length > 0 && !this.usart.rxBusy) {
      const ok = this.usart.writeByte(this.rxQueue[0]);
      if (!ok) break;
      this.rxQueue.shift();
    }
  }

  private loop = (): void => {
    if (!this.running) return;
    if (!this.isPaused) {
      // Cadencement sur une ANCRE temps mur ↔ temps simulé : la cible est
      // recalculée depuis l'ancre, jamais depuis l'instant courant, donc le temps
      // volé à la boucle par le reste de la page (repeinture, moniteur série…)
      // se RATTRAPE au lieu d'être perdu. `speed` ralentit ; pendant un pas on
      // ignore le ralenti pour franchir au plus vite.
      const started = performance.now();
      const factor = this.stepping ? 1 : this.speed;
      const perMs = (CLOCK_HZ / 1000) * factor; // cycles simulés par ms réelle
      if (this.paceWall === 0) {
        this.paceWall = started;
        this.paceCycles = this.cpu.cycles;
      }
      let deadline = this.paceCycles + (started - this.paceWall) * perMs;
      if (deadline - this.cpu.cycles > MAX_DEBT_MS * perMs) {
        // Retard trop grand pour être rattrapé (onglet caché, page figée) : on
        // repart d'ici sans dette, sinon la simulation s'emballerait pour rien.
        this.paceWall = started;
        this.paceCycles = this.cpu.cycles;
        deadline = this.cpu.cycles;
      }
      // Plafond temps réel : ne jamais bloquer le thread plus qu'une frame, sinon
      // le compositeur ne rafraîchit pas le calque transformé du canvas et
      // l'affichage ne bouge qu'à l'arrêt/la pause. Vérif espacée (coût de now()).
      // (Un « noyau chaud » sans ces tests, exécuté par paquets de 256
      // instructions, a été essayé et MESURÉ : 1,24× contre 1,23× pour la boucle
      // ci-dessous, soit rien du tout — V8 prédit parfaitement des tests dont
      // l'issue ne change jamais. Ne pas y revenir : cf. v2026.7.223.)
      const cpu = this.cpu;
      let guard = 0;
      while (cpu.cycles < deadline && !this.isPaused) {
        avrInstruction(cpu);
        cpu.tick();
        // Actions d'entrée programmées (ECHO ultrason) à échéance en temps simulé.
        if (this.scheduled.length > 0) this.fireScheduled();
        if ((++guard & 0x1fff) === 0 && performance.now() - started > MAX_FRAME_MS) break;
        const pcBytes = cpu.pc * 2;
        // Points d'arrêt : test du PC (en octets) après chaque instruction.
        if (this.breakpoints.size > 0) {
          if (pcBytes !== this.skipBreakAddr) this.skipBreakAddr = null;
          if (this.skipBreakAddr === null && this.breakpoints.has(pcBytes)) {
            this.skipBreakAddr = pcBytes; // resume() repartira sans re-déclencher ici
            this.stepping = false;
            this.pause(); // émet l'état et interrompt la boucle (isPaused)
            break;
          }
        }
        // Pas à pas « par-dessus » : arrêt sur une autre ligne du sketch, une fois
        // la pile revenue au niveau de départ (les appels sont franchis d'un bloc).
        if (this.stepping) {
          const line = this.lineForPc(pcBytes);
          if (line !== undefined && line !== this.stepStartLine && cpu.SP >= this.stepStartSp) {
            this.stepping = false;
            this.pause(); // émet l'état (isPaused devient vrai)
            break;
          }
        }
      }
      this.flushRx();
      // En avance sur le temps réel : on dort d'autant (le sketch ne doit pas
      // aller plus vite qu'une vraie carte). En retard : reprise IMMÉDIATE.
      const aheadMs = (this.cpu.cycles - deadline) / perMs;
      this.busyAccum += performance.now() - started;
      this.schedule(aheadMs > AHEAD_NAP_MS ? Math.min(aheadMs - 4, 40) : 0);
    } else {
      this.paceWall = 0; // en pause : l'ancre repart à la reprise
      this.schedule(16);
    }
  };

  /**
   * Replanifie la tranche suivante. Un `setTimeout(0)` imbriqué est bridé à ~4 ms
   * par le navigateur : quand la simulation est en RETARD, ces millisecondes-là
   * sont autant de temps simulé qui ne sera pas rendu à l'heure. Le yield par
   * MessageChannel n'a pas ce plafond tout en restant une macrotâche — le
   * navigateur garde donc la main pour repeindre entre deux tranches (une boucle
   * rAF, elle, monopoliserait le cycle de rendu : l'affichage n'arrivait qu'à
   * l'arrêt). Au-delà de zéro on veut vraiment dormir : un timer suffit.
   */
  private schedule(delayMs: number): void {
    if (!this.running) return;
    if (delayMs > 0 || !this.yieldPort) {
      this.rafId = setTimeout(this.loop, delayMs) as unknown as number;
      return;
    }
    this.yieldPort.postMessage(this.yieldGen);
  }
}
