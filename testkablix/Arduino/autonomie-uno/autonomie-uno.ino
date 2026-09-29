// Scénario autonomie (Uno sur pile 9 V, capacité réduite à 2 mAh).
// Cycle : 1 s de mesure (LED D8 allumée), puis 4 s d'attente.
//   VEILLE 1 : attente en veille profonde (power-down, réveil par le chien
//              de garde) -> Courant de la carte : 46 mA puis 31 mA.
//   VEILLE 0 : attente par delay() -> 46 mA en permanence.
// Au traceur : Bat1: voltage descend de 9,5 V ; sous 6,2 V (seuil de VIN), la
// carte s'éteint et la barre d'état dit au bout de combien de temps.
#include <avr/sleep.h>
#include <avr/wdt.h>
#include <avr/interrupt.h>

#define VEILLE 1

const int LED = 8;
unsigned long cycles = 0;

ISR(WDT_vect) {}

void dormir4s() {
  cli();
  MCUSR = 0;
  WDTCSR = _BV(WDCE) | _BV(WDE);
  WDTCSR = _BV(WDIE) | _BV(WDP3);  // 4 s
  set_sleep_mode(SLEEP_MODE_PWR_DOWN);
  sleep_enable();
  sei();
  sleep_cpu();
  sleep_disable();
  wdt_disable();
}

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
  Serial.println(VEILLE ? "Attente en veille profonde" : "Attente eveillee");
}

void loop() {
  digitalWrite(LED, HIGH);   // mesure
  cycles++;
  Serial.print("cycle ");
  Serial.println(cycles);
  delay(1000);
  digitalWrite(LED, LOW);
  Serial.flush();
#if VEILLE
  dormir4s();
#else
  delay(4000);
#endif
}
