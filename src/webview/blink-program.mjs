// Programme "Blink" pour ATmega328P (Arduino Uno), assemblé à la main.
// Fait basculer la broche PB5 (broche numérique 13) avec un délai logiciel.
//
// Source assembleur équivalent :
//        ldi  r16, 0x20        ; masque du bit PB5
//        ldi  r17, 0x20        ; état initial de sortie (LED allumée)
//        out  DDRB, r16        ; PB5 en sortie  (DDRB  = I/O 0x04)
//   main:
//        out  PORTB, r17       ; écrit l'état courant (PORTB = I/O 0x05)
//        eor  r17, r16         ; bascule le bit PB5
//        ldi  r18, 0x00        ; compteur de délai (24 bits ~ 640000)
//        ldi  r19, 0xC4
//        ldi  r20, 0x09
//   dloop:
//        subi r18, 1
//        sbci r19, 0
//        sbci r20, 0
//        brne dloop            ; ~0,2 s à 16 MHz
//        rjmp main
//
// Encodage little-endian, un mot (16 bits) par instruction.
export const BLINK_PROGRAM = new Uint16Array([
  0xe200, // ldi  r16, 0x20
  0xe210, // ldi  r17, 0x20
  0xb904, // out  DDRB, r16
  0xb915, // out  PORTB, r17      (main)
  0x2710, // eor  r17, r16
  0xe020, // ldi  r18, 0x00
  0xec34, // ldi  r19, 0xC4
  0xe049, // ldi  r20, 0x09
  0x5021, // subi r18, 1          (dloop)
  0x4030, // sbci r19, 0
  0x4040, // sbci r20, 0
  0xf7c1, // brne dloop  (-4)
  0xcff6, // rjmp main   (-10)
]);
