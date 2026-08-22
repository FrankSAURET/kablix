# Raspberry Pi Pico 2

![Raspberry Pi Pico 2](../../img/composants/pico2.webp)

Carte microcontrôleur **RP2350** (double cœur ARM Cortex-M33 à 150 MHz), successeur du Pico. Même format, même brochage 40 broches, niveau logique **3,3 V** — 26 broches GPIO et 3 entrées analogiques (ADC).

## Broches

| Broche | Rôle |
|--------|------|
| **GP0–GP28** | E/S numériques (GP26–GP28 = ADC0–ADC2) |
| **3V3** | Sortie 3,3 V |
| **VSYS / VBUS** | Alimentation d'entrée |
| **GND** | Masses |
| **RUN** | Reset (actif bas) |

## Utilisation

- Brochage complet via le bouton **K** (poster de brochage) — identique au Pico.
- **Niveau logique 3,3 V** : ne pas appliquer 5 V sur une entrée.
- Programmable en **MicroPython** : Kablix charge le firmware `RPI_PICO2`.
- Le RP2350 existe aussi en variante RISC-V (cœurs Hazard3) : Kablix simule les cœurs **Cortex-M33**, les firmwares `-RISCV-` ne conviennent pas.

> ⚠️ Les GPIO ne sont **pas** tolérants 5 V.

> ℹ️ Le C/C++ bare-metal n'est pas encore pris en charge sur cette carte : utiliser MicroPython, ou le Pico pour un programme Arduino.

---

*Composant maison Kablix (dessin de la carte). RP2350 © Raspberry Pi Ltd.*
