# Écran OLED (SSD1306)

![Écran OLED (SSD1306)](../img/oled-ssd1306.png)

Petit écran OLED monochrome 128×64 (SPI). Idéal pour textes et graphiques.

## Broches

| Broche | Rôle |
|--------|------|
| **VIN** | Alimentation (+) |
| **GND** | Masse |
| **CLK** | Horloge SPI (SCK) |
| **DATA** | Données SPI (MOSI) |
| **DC** | Data/Command |
| **CS** | Sélection puce |
| **RST** | Reset |

## Utilisation

- Bus SPI + DC + CS. Bibliothèques Adafruit_SSD1306 / U8g2.
- Adresse mémoire écran décodée et dessinée en simulation.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-ssd1306) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
