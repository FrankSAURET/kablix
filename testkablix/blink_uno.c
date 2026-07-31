/*
 * Exemple Kablix — Arduino Uno (compilable avec avr-gcc, sans Arduino).
 * Fait clignoter la LED D13 et recopie le bouton D2 sur la LED D8.
 *
 * Utilisation : ouvrir ce fichier, sélectionner la carte « Arduino Uno »
 * dans le simulateur, puis « Compiler & exécuter le fichier actif ».
 */
#include <avr/io.h>
#include <util/delay.h>

int main(void) {
  DDRB |= (1 << PB5);  /* D13 en sortie */
  DDRB |= (1 << PB0);  /* D8  en sortie */
  PORTD |= (1 << PD2); /* D2  pull-up   */

  for (;;) {
    PORTB ^= (1 << PB5);
    if (PIND & (1 << PD2)) {
      PORTB &= ~(1 << PB0);
    } else {
      PORTB |= (1 << PB0);
    }
    _delay_ms(250);
  }
}
