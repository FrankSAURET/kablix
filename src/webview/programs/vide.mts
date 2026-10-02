// Programmes « vides » : le microcontrôleur tourne, il ne fait rien. Servent au
// lancement sans fichier de code (Frank, 02/10 : « si pas de carte ou pas de
// code : pas de simulation. Change ça ») — le reste du montage (alimentations,
// piles, multimètre, composants passifs…) se simule quand même.

/** AVR : `rjmp .-2` partout (0xCFFF), y compris sur le vecteur de reset. */
export const AVR_VIDE = new Uint16Array(256).fill(0xcfff);

/**
 * RP2040 / RP2350, image en RAM (même format que PICO_BLINK) : pointeur de pile,
 * vecteur de reset Thumb sur l'octet 8, puis `b .` (0xE7FE).
 */
export const PICO_VIDE = new Uint8Array([
  0x00, 0x00, 0x04, 0x20, // SP = 0x20040000 (dans la fenêtre RAM de la RP2350 comme de la RP2040)
  0x09, 0x00, 0x00, 0x20, // reset = 0x20000008 (Thumb)
  0xfe, 0xe7, 0x00, 0x00, // b . ; remplissage
]);
