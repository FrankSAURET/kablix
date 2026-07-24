# Potentiomètre

![Potentiomètre](../img/pot.png)

Résistance variable à bouton rotatif. Le curseur fournit une tension proportionnelle à sa position.

## Broches

| Broche | Rôle |
|--------|------|
| **VCC** | Alimentation (+) |
| **SIG** | Curseur → entrée analogique |
| **GND** | Masse |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `value` | Position initiale (0–100 %) | 50 |

## Utilisation

- SIG vers une entrée analogique (A0…), lecture `analogRead()` (0–1023).
- Régler en simulation : glisser le bouton, ou flèches / Page ↑↓.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-potentiometer) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
