# Grove Shield (Pico)

![Grove Shield (Pico)](../../img/composants/grove-pico.webp)

Carte d'extension **Grove Shield for Pi Pico v1.0** (Seeed Studio). La Pico (ou Pico W) s'enfiche sur les deux rangées centrales ; le shield redirige ses E/S vers 10 ports Grove à 4 broches, plus un connecteur SPI 2×3.

## Ports Grove

| Port | Broches (haut → bas) | GPIO de la Pico |
|------|----------------------|-----------------|
| **I2C0** | GND · VCC · SDA · SCL | GP8 / GP9 |
| **I2C1** | GND · VCC · SDA · SCL | GP6 / GP7 |
| **A0** | GND · 3V3 · NC · A0 | GP26 |
| **A1** | GND · 3V3 · A0 · A1 | GP26 / GP27 |
| **A2** | GND · 3V3 · A1 · A2 | GP27 / GP28 |
| **UART0** | GND · VCC · TX · RX | GP0 / GP1 |
| **UART1** | GND · VCC · TX · RX | GP4 / GP5 |
| **D16** | GND · VCC · D17 · D16 | GP17 / GP16 |
| **D18** | GND · VCC · D19 · D18 | GP19 / GP18 |
| **D20** | GND · VCC · D21 · D20 | GP21 / GP20 |
| **SPI** | SCK · TX · RX / GND · 3V3 · CS | GP2 / GP3 / GP4 / GP5 |

Les ports numériques et série exposent **deux** signaux : le second est le GPIO qui donne son nom au port. Les ports analogiques partagent leur voie avec le port voisin (A1 reprend A0, A2 reprend A1).

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `pwr` | Rail VCC des ports Grove : `3v3` ou `5v` (VBUS) | `3v3` |

## Utilisation

- Poser le shield, puis **glisser la Pico dessus** : elle s'enfiche sur le socle et reste au premier plan. Le câblage des ports Grove suit alors le brochage ci-dessus, sans fil à tirer vers la Pico.
- L'interrupteur `pwr` fixe le rail VCC des ports **I2C / UART / D16-D20**. Les ports analogiques et le SPI restent toujours en 3,3 V.
- En 5 V, VCC vient de VBUS (USB) : les signaux, eux, restent en 3,3 V — vérifier que le module Grove l'accepte.
- Toutes les masses (socle, ports, SPI) sont sur un rail unique.

---

*Composant Kablix — brochage relevé sur le schéma officiel Seeed `Grove_shield_for_PI_PICO v1.0.sch`.*
