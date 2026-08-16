# Résistance

![Résistance](../../img/composants/resistor.webp)

Résistance fixe. Limite le courant (LED) ou forme un pont diviseur / pull-up / pull-down.

## Broches

| Broche | Rôle |
|--------|------|
| **1** | Borne 1 |
| **2** | Borne 2 (non polarisé) |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `value` | Valeur en ohms | 220 |
| `orientation` | Pose : `h` horizontale (couchée) ou `v` verticale (debout) | `h` |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Utilisation

- Non polarisée : les deux bornes sont équivalentes.
- LED : 220 Ω–1 kΩ. Pull-up/pull-down : 10 kΩ typique.
- Pose verticale : le corps est debout et une patte est repliée par-dessus, les
  deux bornes sortant côte à côte (20 px d'écart au lieu de 60). Pratique pour
  loger une résistance dans peu de place sur la platine. Debout, la résistance
  est vue de biais : ses anneaux sont dessinés en ellipses, l'anneau doré
  (tolérance) en bas, le premier anneau de valeur en haut.
- Debout, elle tient dans **30 × 30 px** au lieu de 30 × 60 : le dessin est
  raccourci de moitié en hauteur, comme la perspective le fait quand on regarde
  la pièce de plus haut — les anneaux s'aplatissent, le diamètre du corps ne
  change pas. C'est bien la même résistance, vue autrement, et l'encombrement
  gagné est celui qu'on cherchait en la mettant debout.

---

*Fiche adaptée et traduite de la [documentation Wokwi](https://docs.wokwi.com/parts/wokwi-resistor) — © Wokwi. Composants `@wokwi/elements` (licence MIT).*
