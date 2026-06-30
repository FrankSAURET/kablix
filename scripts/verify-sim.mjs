// Vérifie de bout en bout les deux moteurs de simulation avec les firmwares de
// démo compilés : LED clignotante, sortie série et bouton (AVR) ; LED embarquée
// (RP2040). Sert de test de non-régression (npm run verify).
import {
  CPU,
  avrInstruction,
  AVRIOPort,
  AVRUSART,
  AVRTimer,
  portBConfig,
  portDConfig,
  portGConfig,
  portHConfig,
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
