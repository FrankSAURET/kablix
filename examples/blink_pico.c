/*
 * Exemple Kablix — Raspberry Pi Pico (RP2040), bare-metal exécuté en RAM.
 * Fait clignoter la LED embarquée (GPIO25).
 *
 * Contrainte : pour rester compatible avec le moteur du simulateur, le
 * programme doit fournir sa propre table de vecteurs (.vectors) avec le SP
 * initial et le handler de reset, et être lié en RAM (voir le linker fourni).
 *
 * Utilisation : sélectionner « Raspberry Pi Pico » puis « Compiler & exécuter ».
 */
#define IO_BANK0 0x40014000u
#define SIO 0xd0000000u
#define REG(addr) (*(volatile unsigned int *)(addr))

#define LED_PIN 25u
#define GPIO25_CTRL REG(IO_BANK0 + LED_PIN * 8u + 4u)
#define GPIO_OE_SET REG(SIO + 0x024u)
#define GPIO_OUT_XOR REG(SIO + 0x01cu)

__attribute__((used)) static void reset_handler(void) {
  GPIO25_CTRL = 5u;
  GPIO_OE_SET = (1u << LED_PIN);
  for (;;) {
    GPIO_OUT_XOR = (1u << LED_PIN);
    for (volatile unsigned int i = 0; i < 200000u; i++) {
    }
  }
}

__attribute__((section(".vectors"), used))
static void *const vectors[] = {
    (void *)0x20042000u,  /* SP initial */
    (void *)reset_handler /* Reset_Handler */
};
