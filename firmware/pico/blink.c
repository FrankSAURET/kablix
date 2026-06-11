/*
 * Démo Kablix pour Raspberry Pi Pico (RP2040), bare-metal, exécutée en RAM.
 * Fait clignoter la LED embarquée (GPIO25) via le bloc SIO.
 *
 * Aucun SDK requis : on configure directement IO_BANK0 (fonction SIO) puis
 * on pilote les registres SIO GPIO_OE / GPIO_OUT.
 */
#define IO_BANK0 0x40014000u
#define SIO 0xd0000000u
#define REG(addr) (*(volatile unsigned int *)(addr))

#define LED_PIN 25u
#define GPIO25_CTRL REG(IO_BANK0 + LED_PIN * 8u + 4u)
#define GPIO_OE_SET REG(SIO + 0x024u)
#define GPIO_OUT_XOR REG(SIO + 0x01cu)

__attribute__((used)) static void reset_handler(void) {
  GPIO25_CTRL = 5u;             /* fonction 5 = SIO */
  GPIO_OE_SET = (1u << LED_PIN); /* GPIO25 en sortie */

  for (;;) {
    GPIO_OUT_XOR = (1u << LED_PIN); /* bascule la LED */
    for (volatile unsigned int i = 0; i < 200000u; i++) {
    }
  }
}

/* Table des vecteurs minimale : SP initial + handler de reset (bit Thumb).
 * L'adresse d'une fonction Thumb a déjà son bit 0 à 1, pas besoin de l'ajouter. */
__attribute__((section(".vectors"), used))
static void *const vectors[] = {
    (void *)0x20042000u, /* sommet de la SRAM (264 Ko) */
    (void *)reset_handler /* Reset_Handler (Thumb)      */
};
