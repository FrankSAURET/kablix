# Carte microSD (SPI)

![Carte microSD (SPI)](../../img/composants/microsd.webp)

Lecteur de carte microSD en SPI : stockage de fichiers.

## Broches

| Broche | Rôle |
|--------|------|
| **VCC / GND** | Alimentation |
| **SCK** | Horloge SPI |
| **DI** | Données entrantes (MOSI) |
| **DO** | Données sortantes (MISO) |
| **CS** | Sélection puce |
| **CD** | Détection de carte |

## Utilisation

- Bus SPI + CS. Bibliothèque `SD`.
- La carte simulée est livrée **formatée en FAT16** (environ 2 Mo), comme une carte
  du commerce : `SD.begin()`, `SD.open()`, l'écriture et la relecture de fichiers
  fonctionnent sans rien préparer.
- Le contenu vit en mémoire : il est **perdu à l'arrêt de la simulation**, et la
  carte repart vide au démarrage suivant.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-microsd-card) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
