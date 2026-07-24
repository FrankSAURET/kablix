# Raspberry Pi Pico

![Raspberry Pi Pico](../img/pico.png)

Carte microcontrôleur RP2040 (double cœur ARM Cortex-M0+). 26 broches GPIO, 3
entrées analogiques (ADC), niveau logique **3,3 V**.

## Broches

| Broche | Rôle |
|--------|------|
| **GP0–GP28** | E/S numériques (GP26–GP28 = ADC0–ADC2) |
| **3V3** | Sortie 3,3 V |
| **VSYS / VBUS** | Alimentation d'entrée |
| **GND** | Masses |
| **RUN** | Reset (actif bas) |

## Utilisation

- Brochage complet via le bouton **K** (poster de brochage).
- **Niveau logique 3,3 V** : ne pas appliquer 5 V sur une entrée.
- Programmable en MicroPython ou en C/C++ (Arduino).

> ⚠️ Les GPIO ne sont **pas** tolérants 5 V.

---

*Composant maison Kablix (dessin de la carte). RP2040 © Raspberry Pi Ltd.*
