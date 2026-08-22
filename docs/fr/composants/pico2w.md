# Raspberry Pi Pico 2 W

![Raspberry Pi Pico 2 W](../../img/composants/pico2w.webp)

Identique au Pico 2 (RP2350, double cœur Cortex-M33 à 150 MHz, 3,3 V, mêmes broches) avec un module **Wi-Fi/Bluetooth** intégré. Le brochage physique est le même que le Pico.

## Broches

| Broche | Rôle |
|--------|------|
| **GP0–GP28** | E/S numériques (GP26–GP28 = ADC0–ADC2) |
| **3V3** | Sortie 3,3 V |
| **VSYS / VBUS** | Alimentation d'entrée |
| **GND** | Masses |
| **RUN** | Reset (actif bas) |

## Utilisation

- Brochage complet via le bouton **K**.
- Niveau logique **3,3 V** (non tolérant 5 V).
- Programmable en **MicroPython** : Kablix charge le firmware `RPI_PICO2_W`.
- Le Wi-Fi n'est **pas émulé** par le cœur ; Kablix propose un pont réseau optionnel via l'hôte (réglage `kablix.picowNetworkBridge`).

> ℹ️ Le C/C++ bare-metal n'est pas encore pris en charge sur cette carte : utiliser MicroPython, ou le Pico W pour un programme Arduino.

---

*Composant maison Kablix (dessin de la carte). RP2350 © Raspberry Pi Ltd.*
