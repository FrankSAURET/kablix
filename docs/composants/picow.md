# Raspberry Pi Pico W

![Raspberry Pi Pico W](img/picow.png)

Identique au Pico (RP2040, 3,3 V, mêmes broches) avec un module **Wi-Fi/Bluetooth**
intégré. Le brochage physique est le même que le Pico.

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
- Le Wi-Fi n'est **pas émulé** par le cœur ; Kablix propose un pont réseau optionnel via l'hôte (réglage `kablix.picowNetworkBridge`).

---

*Composant maison Kablix (dessin de la carte). RP2040 © Raspberry Pi Ltd.*
