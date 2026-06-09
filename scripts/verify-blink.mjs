// Validation du programme Blink hand-assemblé contre avr8js.
// On vérifie que PB5 (broche 13) bascule réellement pendant l'exécution.
import { CPU, avrInstruction, AVRIOPort, portBConfig, PinState } from 'avr8js';
import { BLINK_PROGRAM } from '../src/webview/blink-program.mjs';

const cpu = new CPU(BLINK_PROGRAM);
const portB = new AVRIOPort(cpu, portBConfig);

let transitions = 0;
let last = PinState.Input;
portB.addListener(() => {
  const s = portB.pinState(5);
  if (s !== last) { transitions++; last = s; }
});

// Exécute ~5 millions de cycles (~0.3s à 16MHz)
for (let i = 0; i < 5_000_000 && transitions < 6; i++) {
  avrInstruction(cpu);
  cpu.tick();
}

console.log('Transitions PB5 :', transitions);
console.log('Etat final broche 13 :', PinState[portB.pinState(5)]);
if (transitions >= 2) { console.log('RESULTAT: OK — la LED clignote'); process.exit(0); }
else { console.log('RESULTAT: ECHEC — pas de bascule'); process.exit(1); }
