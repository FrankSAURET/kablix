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
import { selectSpiDevice, Hd44780, type I2cDevice, type SpiDevice } from './i2c-devices.mjs';
import { Ws2812Decoder } from './ws2812.mjs';

export type AvrFamily = 'avr328' | 'avr2560';

const CLOCK_HZ = 16_000_000;
const CYCLES_PER_US = CLOCK_HZ / 1_000_000; // 16 cycles = 1 µs
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
  // Timers 0/1/2 : indispensables pour millis()/micros()/delay() (sans eux la
  // boucle de delay() ne se terminait jamais et la simulation semblait planter).
  private timers: AVRTimer[];
  private rafId: number | null = null;
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

  // Famille AVR ciblée : 'avr328' (Uno / Nano / Pro Mini) ou 'avr2560' (Mega).
  private readonly family: AvrFamily;

  // Mesure de largeur d'impulsion (servo) : broches surveillées + état d'arête.
  private pulsePins: Array<{ name: string; port: PortKey; bit: number }> = [];
  private pulseState = new Map<string, { high: boolean; rise: number; lastUs: number; lastEdge: number }>();

  // Capteurs ultrason + actions d'entrée programmées en temps simulé (génération ECHO).
  private ultrasonic: UltrasonicSensor[] = [];
  private scheduled: Array<{ cycle: number; name: string; value: boolean }> = [];

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
  private keypadColLevel = new Map<string, boolean>();

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
        this.samplePulses();
        this.sampleNeopixels();
        this.sampleLcdParallel();
        this.sampleDht22();
        this.applyKeypads();
        this.onUpdate?.();
      });
    }
    this.usart.onByteTransmit = (b: number) => {
      const text = this.serialDecoder.decode(Uint8Array.of(b), { stream: true });
      if (text) this.onSerial?.(text);
    };
    // Serial1/2/3 (Mega) : chaque USART a son propre décodeur UTF-8 et émet vers
    // le même moniteur série. Sans instanciation, un sketch qui utilise Serial1
    // resterait bloqué (registres absents, ISR au mauvais vecteur).
    if (isMega) {
      for (const cfg of [MEGA_USART1, MEGA_USART2, MEGA_USART3]) {
        const u = new AVRUSART(this.cpu, cfg, CLOCK_HZ);
        const decoder = new TextDecoder('utf-8');
        u.onByteTransmit = (b: number) => {
          const text = decoder.decode(Uint8Array.of(b), { stream: true });
          if (text) this.onSerial?.(text);
        };
        this.usarts.push(u);
      }
    }
  }

  readDigital(name: string): boolean {
    const map = this.pinMap[name];
    if (!map) return false;
    const [port, bit] = map;
    return this.ports[port]?.pinState(bit) === PinState.High;
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
      if (!this.pulseState.has(name)) this.pulseState.set(name, { high: false, rise: 0, lastUs: 0, lastEdge: 0 });
    }
  }

  readPulseUs(name: string): number {
    return this.pulseState.get(name)?.lastUs ?? 0;
  }

  /** Vrai si la broche a basculé récemment (< 60 ms simulées) = signal carré actif (tone/PWM). */
  pulseActive(name: string): boolean {
    const st = this.pulseState.get(name);
    if (!st) return false;
    return this.cpu.cycles - st.lastEdge < 60_000 * CYCLES_PER_US;
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
        current = devices.find((d) => d.address === addr) ?? null;
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
        this.pulseState.set(s.trig, { high: false, rise: 0, lastUs: 0, lastEdge: 0 });
      }
    }
  }

  setKeypads(keypads: KeypadConfig[]): void {
    this.keypads = keypads;
    this.keypadColLevel.clear();
    // Colonnes au repos = HAUT (pull-up). Le firmware lit ce niveau tant qu'aucune
    // touche n'est enfoncée sur une ligne tirée à LOW.
    for (const kp of keypads) {
      for (const col of kp.cols) if (col) this.setInput(col, true);
    }
  }

  /** Vrai si la broche est PILOTÉE à LOW (sortie basse), pas seulement flottante. */
  private pinDrivenLow(name: string): boolean {
    const map = this.pinMap[name];
    if (!map) return false;
    return this.ports[map[0]]?.pinState(map[1]) === PinState.Low;
  }

  /**
   * Recalcule le niveau des colonnes de chaque clavier : une colonne est tirée à
   * LOW si une touche enfoncée la relie à une ligne actuellement pilotée à LOW (le
   * firmware balaie en mettant une ligne en sortie BASSE puis en lisant les
   * colonnes ; les autres lignes sont en entrée haute impédance, donc ignorées
   * pour éviter les touches fantômes). Garde-fou de ré-entrance : `setInput`
   * redéclenche l'écouteur de port.
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
          const level = !pulled; // tiré à LOW si une touche relie à une ligne basse
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

  setDht22(sensors: Dht22Sensor[]): void {
    this.dht22 = sensors.map((s) => ({
      pin: s.pin,
      tempC: s.temperatureC,
      humidity: s.humidity,
      wasLow: false,
      lowStart: 0,
      busyUntil: 0,
    }));
    // Ligne de données au repos = HAUT (pull-up) ; le MCU la tire BAS pour démarrer.
    for (const d of this.dht22) this.setInput(d.pin, true);
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
          const sched = buildDht22Schedule(d.tempC, d.humidity, start, CYCLES_PER_US);
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
      } else if (!high && st.high) {
        st.high = false;
        st.lastEdge = now; // front descendant
        const widthUs = (now - st.rise) / CYCLES_PER_US;
        st.lastUs = widthUs; // dernière largeur d'impulsion haute (servo, fréquence buzzer)
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
      const widthCycles = cm * 58 * CYCLES_PER_US; // 58 µs/cm (aller-retour)
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
      }
    }
  }

  setAnalog(name: string, fraction: number): void {
    const ch = this.adcMap[name];
    if (ch === undefined) return;
    this.adc.channelValues[ch] = Math.max(0, Math.min(1, fraction)) * VREF;
  }

  writeSerial(text: string): void {
    // Encodage UTF-8 (un caractère accentué saisi devient plusieurs octets).
    for (const byte of new TextEncoder().encode(text)) this.rxQueue.push(byte);
    this.flushRx();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    this.stepping = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
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
    this.speed = Math.max(0.001, Math.min(1, fraction));
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
      if (g.size === 4 && type.includes('float')) {
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
      // Ralenti : on n'exécute qu'une fraction du budget de cycles par frame.
      // Pendant un pas (stepping) on ignore le ralenti pour le franchir au plus vite.
      const factor = this.stepping ? 1 : this.speed;
      const deadline = this.cpu.cycles + (CLOCK_HZ / 60) * factor;
      while (this.cpu.cycles < deadline && !this.isPaused) {
        avrInstruction(this.cpu);
        this.cpu.tick();
        // Actions d'entrée programmées (ECHO ultrason) à échéance en temps simulé.
        if (this.scheduled.length > 0) this.fireScheduled();
        const pcBytes = this.cpu.pc * 2;
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
          if (line !== undefined && line !== this.stepStartLine && this.cpu.SP >= this.stepStartSp) {
            this.stepping = false;
            this.pause(); // émet l'état (isPaused devient vrai)
            break;
          }
        }
      }
      this.flushRx();
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
}
