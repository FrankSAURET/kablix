/*
 * Démo Kablix pour Arduino Uno (ATmega328P), bare-metal (avr-libc).
 * Exerce les composants du simulateur :
 *   - LED D13 (PB5) clignotante
 *   - LED D8  (PB0) qui recopie l'état du bouton
 *   - bouton D2 (PD2) en entrée avec pull-up interne
 *   - sortie série (USART0, 9600 bauds) : "blink <n>"
 */
#include <avr/io.h>
#include <util/delay.h>

static void uart_init(void) {
  /* 16 MHz, 9600 bauds -> UBRR = 103 */
  UBRR0H = 0;
  UBRR0L = 103;
  UCSR0B = (1 << TXEN0);
  UCSR0C = (1 << UCSZ01) | (1 << UCSZ00);
}

static void uart_putc(char c) {
  while (!(UCSR0A & (1 << UDRE0))) {
  }
  UDR0 = c;
}

static void uart_print(const char *s) {
  while (*s) {
    uart_putc(*s++);
  }
}

int main(void) {
  DDRB |= (1 << PB5);  /* D13 en sortie (LED clignotante) */
  DDRB |= (1 << PB0);  /* D8  en sortie (recopie bouton)  */
  PORTD |= (1 << PD2); /* D2  en entrée, pull-up activé   */
  uart_init();

  uint16_t count = 0;
  for (;;) {
    PORTB ^= (1 << PB5); /* bascule D13 */

    /* bouton actif à l'état bas : recopie sur D8 */
    if (PIND & (1 << PD2)) {
      PORTB &= ~(1 << PB0);
    } else {
      PORTB |= (1 << PB0);
    }

    uart_print("blink ");
    char buf[6];
    char *p = buf + 5;
    *p = 0;
    uint16_t n = count;
    if (n == 0) {
      *--p = '0';
    }
    while (n) {
      *--p = '0' + (n % 10);
      n /= 10;
    }
    uart_print(p);
    uart_putc('\n');

    count++;
    _delay_ms(300);
  }
}
