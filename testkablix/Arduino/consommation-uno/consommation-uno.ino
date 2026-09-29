// Test consommation : 2 s éveillée (LED L allumée), 2 s en veille profonde
// (power-down, réveil par le chien de garde). Au traceur, le courant de la
// carte passe de 46 à 31 mA : même endormie, une Uno garde son régulateur, sa
// puce USB et sa LED ON. La batterie (1 mAh) se vide en quelques minutes.
#include <avr/sleep.h>
#include <avr/wdt.h>
#include <avr/interrupt.h>

ISR(WDT_vect) {}

void dormir2s() {
  cli();
  MCUSR = 0;
  WDTCSR = _BV(WDCE) | _BV(WDE);
  WDTCSR = _BV(WDIE) | _BV(WDP2) | _BV(WDP1) | _BV(WDP0);  // 2 s
  set_sleep_mode(SLEEP_MODE_PWR_DOWN);
  sleep_enable();
  sei();
  sleep_cpu();
  sleep_disable();
  wdt_disable();
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println("eveillee");
  delay(2000);
  digitalWrite(LED_BUILTIN, LOW);
  Serial.println("veille");
  Serial.flush();
  dormir2s();
}
