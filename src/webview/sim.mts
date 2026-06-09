// Simulateur exécuté dans la webview. Utilise avr8js pour émuler un ATmega328P
// (Arduino Uno) et pilote l'affichage de la LED de la broche 13 (PB5).
import { CPU, avrInstruction, AVRIOPort, portBConfig, PinState } from 'avr8js';
import { BLINK_PROGRAM } from './blink-program.mjs';

const CLOCK_HZ = 16_000_000; // Arduino Uno : 16 MHz
const PB5 = 5; // broche numérique 13

class ArduinoUnoSimulation {
  private cpu: CPU;
  private portB: AVRIOPort;
  private rafId: number | null = null;
  private running = false;

  constructor(private readonly onPinChange: (high: boolean) => void) {
    this.cpu = new CPU(BLINK_PROGRAM.slice());
    this.portB = new AVRIOPort(this.cpu, portBConfig);
    this.portB.addListener(() => {
      this.onPinChange(this.portB.pinState(PB5) === PinState.High);
    });
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private loop = (): void => {
    if (!this.running) {
      return;
    }
    // On exécute ~1/60 s de temps simulé par frame d'animation.
    const deadline = this.cpu.cycles + CLOCK_HZ / 60;
    while (this.cpu.cycles < deadline) {
      avrInstruction(this.cpu);
      this.cpu.tick();
    }
    this.rafId = requestAnimationFrame(this.loop);
  };
}

// --- Liaison avec le DOM -----------------------------------------------------

const led = document.getElementById('led13') as HTMLDivElement;
const runBtn = document.getElementById('run') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const logEl = document.getElementById('log') as HTMLPreElement;

let blinkCount = 0;

function log(message: string): void {
  const time = new Date().toLocaleTimeString();
  logEl.textContent = `[${time}] ${message}\n` + logEl.textContent;
}

const sim = new ArduinoUnoSimulation((high) => {
  led.classList.toggle('led--on', high);
  if (high) {
    blinkCount++;
    statusEl.textContent = `En cours — ${blinkCount} clignotement(s)`;
  }
});

runBtn.addEventListener('click', () => {
  sim.start();
  runBtn.disabled = true;
  stopBtn.disabled = false;
  statusEl.textContent = 'En cours…';
  log('Simulation démarrée (Blink sur broche 13).');
});

stopBtn.addEventListener('click', () => {
  sim.stop();
  runBtn.disabled = false;
  stopBtn.disabled = true;
  statusEl.textContent = 'Arrêté';
  log('Simulation arrêtée.');
});

log('Simulateur prêt. Cliquez sur « Démarrer ».');
