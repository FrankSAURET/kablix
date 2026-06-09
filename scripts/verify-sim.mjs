// Vérifie de bout en bout les deux moteurs de simulation avec les firmwares de
// démo compilés : LED clignotante, sortie série et bouton (AVR) ; LED embarquée
// (RP2040). Sert de test de non-régression (npm run verify).
import {
  CPU,
  avrInstruction,
  AVRIOPort,
  AVRUSART,
  portBConfig,
  portDConfig,
  usart0Config,
  PinState,
} from 'avr8js';
import { RP2040, GPIOPinState } from 'rp2040js';
import { UNO_DEMO } from '../src/webview/programs/uno-demo.mjs';
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
