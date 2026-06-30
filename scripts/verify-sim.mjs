// Vérifie de bout en bout les deux moteurs de simulation avec les firmwares de
// démo compilés : LED clignotante, sortie série et bouton (AVR) ; LED embarquée
// (RP2040). Sert de test de non-régression (npm run verify).
import {
  CPU,
  avrInstruction,
  AVRIOPort,
  AVRUSART,
  AVRTimer,
  AVRADC,
  adcConfig,
  ADCMuxInputType,
  portBConfig,
  portDConfig,
  portEConfig,
  portFConfig,
  portGConfig,
  portHConfig,
  portKConfig,
  portLConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
  PinState,
} from 'avr8js';
import { RP2040, GPIOPinState } from 'rp2040js';
import { UNO_DEMO } from '../src/webview/programs/uno-demo.mjs';
import { MEGA_DEMO } from '../src/webview/programs/mega-demo.mjs';
import { MEGA_PWM } from '../src/webview/programs/mega-pwm.mjs';
import { MEGA_PWM345 } from '../src/webview/programs/mega-pwm345.mjs';
import { PICO_BLINK } from '../src/webview/programs/pico-blink.mjs';

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) failures++;
}

// --- Arduino Uno (avr8js) ----------------------------------------------------
console.log('Arduino Uno (ATmega328P) :');
{
  const cpu = new CPU(UNO_DEMO.slice());
  const portB = new AVRIOPort(cpu, portBConfig);
  const portD = new AVRIOPort(cpu, portDConfig);
  const usart = new AVRUSART(cpu, usart0Config, 16_000_000);

  let d13Toggles = 0;
  let lastD13 = PinState.Input;
  let serial = '';
  portB.addListener(() => {
    const s = portB.pinState(5);
    if (s !== lastD13) {
      d13Toggles++;
      lastD13 = s;
    }
  });
  usart.onByteTransmit = (b) => {
    serial += String.fromCharCode(b);
  };

  // Phase 1 : bouton relâché -> on émule le pull-up en pilotant PD2 à l'état
  // haut. D8 (PB0) doit rester bas.
  portD.setPin(2, true);
  for (let i = 0; i < 3_000_000; i++) {
    avrInstruction(cpu);
    cpu.tick();
  }
  const d8Released = portB.pinState(0);

  // Phase 2 : on appuie sur le bouton (PD2 forcé bas) -> D8 doit passer haut.
  portD.setPin(2, false);
  for (let i = 0; i < 3_000_000; i++) {
    avrInstruction(cpu);
    cpu.tick();
  }
  const d8Pressed = portB.pinState(0);

  check(`LED D13 clignote (${d13Toggles} bascules)`, d13Toggles >= 2);
  check(`sortie série contient "blink" (${JSON.stringify(serial.slice(0, 16))})`, serial.includes('blink'));
  check('bouton relâché -> D8 bas', d8Released === PinState.Low);
  check('bouton appuyé -> D8 haut', d8Pressed === PinState.High);
}

// --- Arduino Mega (avr8js) ---------------------------------------------------
// Garde-fou de la simu ATmega2560 : vecteurs d'interruption (table 14-1) ET
// PC 22 bits. Sans pc22Bits, les EICALL (Serial/objets C++) empilent 3 octets
// alors que CALL/RET en dépilent 2 → la pile dérive, micros() délire et delay()
// boucle (la LED s'allume sans jamais s'éteindre). Le firmware de démo utilise
// Serial pour exercer justement ce chemin.
console.log('Arduino Mega (ATmega2560) :');
{
  const MEGA_SRAM_BYTES = 0x2200;
  const MEGA_TIMER0 = {
    ...timer0Config,
    compAInterrupt: 0x2a,
    compBInterrupt: 0x2c,
    ovfInterrupt: 0x2e,
  };
  const MEGA_USART0 = {
    ...usart0Config,
    rxCompleteInterrupt: 0x32,
    dataRegisterEmptyInterrupt: 0x34,
    txCompleteInterrupt: 0x36,
  };

  const cpu = new CPU(MEGA_DEMO.slice(), MEGA_SRAM_BYTES);
  cpu.pc22Bits = true; // le 2560 a toujours un PC 22 bits (cf. avr.mts)
  const portB = new AVRIOPort(cpu, portBConfig);
  const usart = new AVRUSART(cpu, MEGA_USART0, 16_000_000);
  new AVRTimer(cpu, MEGA_TIMER0); // Timer0 : millis()/delay()

  let d13Toggles = 0;
  let lastD13 = PinState.Input;
  let serial = '';
  portB.addListener(() => {
    const s = portB.pinState(7); // D13 = PB7 sur le Mega
    if (s !== lastD13) {
      d13Toggles++;
      lastD13 = s;
    }
  });
  usart.onByteTransmit = (b) => {
    serial += String.fromCharCode(b);
  };

  for (let i = 0; i < 24_000_000; i++) {
    avrInstruction(cpu);
    cpu.tick();
  }

  check(`LED D13 clignote (${d13Toggles} bascules)`, d13Toggles >= 2);
  check(`sortie série contient "blink" (${JSON.stringify(serial.slice(0, 16))})`, serial.includes('blink'));
}

// --- Arduino Mega : PWM (analogWrite) ----------------------------------------
// Sur le 2560 les sorties OCnx ne sont pas sur les mêmes broches que le 328P.
// On vérifie que analogWrite() pilote la BONNE broche Mega (rapport cyclique) :
// D11=OC1A=PB5 (25 %), D9=OC2B=PH6 (75 %, timer2 → autre port), D13=OC0A=PB7 (50 %).
console.log('Arduino Mega — PWM (analogWrite) :');
{
  const MEGA_TIMER0 = {
    ...timer0Config,
    compAInterrupt: 0x2a, compBInterrupt: 0x2c, ovfInterrupt: 0x2e,
    compPortA: portBConfig.PORT, compPinA: 7, // OC0A=PB7 (D13)
    compPortB: portGConfig.PORT, compPinB: 5, // OC0B=PG5 (D4)
  };
  const MEGA_TIMER1 = {
    ...timer1Config,
    captureInterrupt: 0x20, compAInterrupt: 0x22, compBInterrupt: 0x24, compCInterrupt: 0x26, ovfInterrupt: 0x28,
    compPortA: portBConfig.PORT, compPinA: 5, // OC1A=PB5 (D11)
    compPortB: portBConfig.PORT, compPinB: 6, // OC1B=PB6 (D12)
  };
  const MEGA_TIMER2 = {
    ...timer2Config,
    compAInterrupt: 0x1a, compBInterrupt: 0x1c, ovfInterrupt: 0x1e,
    compPortA: portBConfig.PORT, compPinA: 4, // OC2A=PB4 (D10)
    compPortB: portHConfig.PORT, compPinB: 6, // OC2B=PH6 (D9)
  };

  const cpu = new CPU(MEGA_PWM.slice(), 0x2200);
  cpu.pc22Bits = true;
  const portB = new AVRIOPort(cpu, portBConfig);
  const portH = new AVRIOPort(cpu, portHConfig);
  new AVRIOPort(cpu, portGConfig);
  new AVRTimer(cpu, MEGA_TIMER0);
  new AVRTimer(cpu, MEGA_TIMER1);
  new AVRTimer(cpu, MEGA_TIMER2);

  // setup() configure les 3 PWM, puis on mesure le rapport cyclique.
  for (let i = 0; i < 2_000_000; i++) {
    avrInstruction(cpu);
    cpu.tick();
  }
  let n = 0;
  let pb5 = 0;
  let ph6 = 0;
  let pb7 = 0;
  const c0 = cpu.cycles;
  while (cpu.cycles - c0 < 2_000_000) {
    avrInstruction(cpu);
    cpu.tick();
    n++;
    if (portB.pinState(5) === PinState.High) pb5++;
    if (portH.pinState(6) === PinState.High) ph6++;
    if (portB.pinState(7) === PinState.High) pb7++;
  }
  const near = (got, want) => Math.abs((100 * got) / n - want) <= 8;
  const pct = (x) => `${Math.round((100 * x) / n)}%`;
  check(`D11 OC1A=PB5 ≈ 25 % (${pct(pb5)})`, near(pb5, 25));
  check(`D9 OC2B=PH6 ≈ 75 % (${pct(ph6)})`, near(ph6, 75));
  check(`D13 OC0A=PB7 ≈ 50 % (${pct(pb7)})`, near(pb7, 50));
}

// --- Arduino Mega : timers 3-5, ADC A8-A15, Serial1 -------------------------
// Périphériques propres au 2560 (absents du 328P → reconstruits à la main dans
// avr.mts). On vérifie : PWM sur OC3A=PE3 (25 %), OC4A=PH3 (75 %), OC5A=PL3
// (50 %) ; analogRead(A8) (canal 8 sélectionné par le bit MUX5) ; émission
// Serial1 (USART1).
console.log('Arduino Mega — timers 3-5 / ADC A8 / Serial1 :');
{
  const base16 = (regs, vects, pins) => ({
    ...timer1Config,
    ...regs,
    OCFC: 0x08, OCIEC: 0x08,
    ...vects,
    ...pins,
  });
  const MEGA_TIMER3 = base16(
    { TCCRA: 0x90, TCCRB: 0x91, TCCRC: 0x92, TCNT: 0x94, ICR: 0x96, OCRA: 0x98, OCRB: 0x9a, OCRC: 0x9c, TIMSK: 0x71, TIFR: 0x38 },
    { captureInterrupt: 0x3e, compAInterrupt: 0x40, compBInterrupt: 0x42, compCInterrupt: 0x44, ovfInterrupt: 0x46 },
    { externalClockPort: portEConfig.PORT, externalClockPin: 6,
      compPortA: portEConfig.PORT, compPinA: 3, compPortB: portEConfig.PORT, compPinB: 4, compPortC: portEConfig.PORT, compPinC: 5 }
  );
  const MEGA_TIMER4 = base16(
    { TCCRA: 0xa0, TCCRB: 0xa1, TCCRC: 0xa2, TCNT: 0xa4, ICR: 0xa6, OCRA: 0xa8, OCRB: 0xaa, OCRC: 0xac, TIMSK: 0x72, TIFR: 0x39 },
    { captureInterrupt: 0x52, compAInterrupt: 0x54, compBInterrupt: 0x56, compCInterrupt: 0x58, ovfInterrupt: 0x5a },
    { externalClockPort: portHConfig.PORT, externalClockPin: 7,
      compPortA: portHConfig.PORT, compPinA: 3, compPortB: portHConfig.PORT, compPinB: 4, compPortC: portHConfig.PORT, compPinC: 5 }
  );
  const MEGA_TIMER5 = base16(
    { TCCRA: 0x120, TCCRB: 0x121, TCCRC: 0x122, TCNT: 0x124, ICR: 0x126, OCRA: 0x128, OCRB: 0x12a, OCRC: 0x12c, TIMSK: 0x73, TIFR: 0x3a },
    { captureInterrupt: 0x5c, compAInterrupt: 0x5e, compBInterrupt: 0x60, compCInterrupt: 0x62, ovfInterrupt: 0x64 },
    { externalClockPort: portLConfig.PORT, externalClockPin: 2,
      compPortA: portLConfig.PORT, compPinA: 3, compPortB: portLConfig.PORT, compPinB: 4, compPortC: portLConfig.PORT, compPinC: 5 }
  );
  const MEGA_USART1 = { ...usart0Config,
    rxCompleteInterrupt: 0x48, dataRegisterEmptyInterrupt: 0x4a, txCompleteInterrupt: 0x4c,
    UCSRA: 0xc8, UCSRB: 0xc9, UCSRC: 0xca, UBRRL: 0xcc, UBRRH: 0xcd, UDR: 0xce };
  const MEGA_ADC_CHANNELS = { 30: { type: ADCMuxInputType.Constant, voltage: 1.1 }, 31: { type: ADCMuxInputType.Constant, voltage: 0 } };
  for (let i = 0; i < 8; i++) {
    MEGA_ADC_CHANNELS[i] = { type: ADCMuxInputType.SingleEnded, channel: i };
    MEGA_ADC_CHANNELS[0x20 + i] = { type: ADCMuxInputType.SingleEnded, channel: 8 + i };
  }
  const MEGA_ADC_CONFIG = { ...adcConfig, adcInterrupt: 0x3a, numChannels: 16, muxInputMask: 0x3f, muxChannels: MEGA_ADC_CHANNELS };

  const cpu = new CPU(MEGA_PWM345.slice(), 0x2200);
  cpu.pc22Bits = true;
  new AVRIOPort(cpu, portFConfig); // A0-A7
  new AVRIOPort(cpu, portKConfig); // A8-A15
  const portE = new AVRIOPort(cpu, portEConfig);
  const portH = new AVRIOPort(cpu, portHConfig);
  const portL = new AVRIOPort(cpu, portLConfig);
  new AVRTimer(cpu, MEGA_TIMER3);
  new AVRTimer(cpu, MEGA_TIMER4);
  new AVRTimer(cpu, MEGA_TIMER5);
  const usart1 = new AVRUSART(cpu, MEGA_USART1, 16_000_000);
  const adc = new AVRADC(cpu, MEGA_ADC_CONFIG);
  adc.channelValues[8] = 2.5; // A8 -> ~512 sur 1023

  let serial1 = '';
  usart1.onByteTransmit = (b) => { serial1 += String.fromCharCode(b); };

  // Warmup : setup() configure les 3 PWM, la loop lance analogRead + Serial1.
  for (let i = 0; i < 4_000_000; i++) { avrInstruction(cpu); cpu.tick(); }
  // Mesure du rapport cyclique sur les sorties OCnA des timers 3/4/5.
  let n = 0, pe3 = 0, ph3 = 0, pl3 = 0;
  const c0 = cpu.cycles;
  while (cpu.cycles - c0 < 2_000_000) {
    avrInstruction(cpu); cpu.tick(); n++;
    if (portE.pinState(3) === PinState.High) pe3++;
    if (portH.pinState(3) === PinState.High) ph3++;
    if (portL.pinState(3) === PinState.High) pl3++;
  }
  const near = (got, want) => Math.abs((100 * got) / n - want) <= 8;
  const pct = (x) => `${Math.round((100 * x) / n)}%`;
  // analogRead(A8) attendu ~512 : on accepte 470-540.
  const m = serial1.match(/a8=(\d+)/);
  const a8 = m ? Number(m[1]) : -1;
  check(`D5 OC3A=PE3 ≈ 25 % (${pct(pe3)})`, near(pe3, 25));
  check(`D6 OC4A=PH3 ≈ 75 % (${pct(ph3)})`, near(ph3, 75));
  check(`D46 OC5A=PL3 ≈ 50 % (${pct(pl3)})`, near(pl3, 50));
  check(`Serial1 émet (${JSON.stringify(serial1.slice(0, 12))})`, serial1.includes('a8='));
  check(`analogRead(A8) ≈ 512 (${a8})`, a8 >= 470 && a8 <= 540);
}

// --- Raspberry Pi Pico (rp2040js) -------------------------------------------
console.log('Raspberry Pi Pico (RP2040) :');
{
  const mcu = new RP2040();
  mcu.sram.set(PICO_BLINK, 0); // image chargée à 0x20000000
  mcu.core.VTOR = 0x20000000;
  mcu.core.reset();

  let ledToggles = 0;
  let lastState = GPIOPinState.Input;
  mcu.gpio[25].addListener((state) => {
    if (state !== lastState) {
      ledToggles++;
      lastState = state;
    }
  });

  for (let i = 0; i < 2_000_000; i++) {
    mcu.step();
  }

  check(`LED embarquée GPIO25 clignote (${ledToggles} bascules)`, ledToggles >= 2);
}

console.log(failures === 0 ? '\nRESULTAT: OK' : `\nRESULTAT: ECHEC (${failures})`);
process.exit(failures === 0 ? 0 : 1);
