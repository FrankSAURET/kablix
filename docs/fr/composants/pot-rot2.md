# Potentiomètre ajustable

![Potentiomètre ajustable](../../img/composants/pot-rot2.webp)

Petit potentiomètre **réglé au tournevis** (trimmer, ajustable) : on le pose une fois pour caler un seuil, un contraste ou un zéro, puis on n'y touche plus. Électriquement, c'est le même composant que le [potentiomètre](pot.md) rotatif — un rail résistif et un curseur qui se promène dessus.

## Broches

Les pattes portent, sur le boîtier, les repères du dessin : **1** et **2** sont les extrémités du rail, **V** est le curseur.

| Broche | Repère du boîtier | Rôle |
|--------|-------------------|------|
| **GND** | 1 | Extrémité basse du rail (masse) |
| **SIG** | V | Curseur → entrée analogique |
| **VCC** | 2 | Extrémité haute du rail (+) |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `ohms` | Valeur nominale : résistance totale entre les pattes 1 et 2 (Ω) | 10 000 |
| `value` | Position initiale (0–100 %) | 50 |

## Le code écrit sur le boîtier

La valeur nominale s'inscrit toute seule sur le composant, en **code à trois chiffres** : les deux premiers sont les chiffres de la valeur, le troisième dit le nombre de zéros à ajouter.

| Valeur | Code |
|--------|------|
| 220 Ω | 221 |
| 4,7 kΩ | 472 |
| 10 kΩ | 103 |
| 100 kΩ | 104 |
| 1 MΩ | 105 |

Changer `ohms` réécrit le code : c'est le vrai composant qu'on retrouve dans un tiroir, pas une étiquette collée dessus.

## Utilisation

- V vers une entrée analogique (A0…, GP26–GP28), lecture `analogRead()` (0–1023) ou `ADC.read_u16()` (0–65535).
- Régler en simulation : **glisser la vis** à la souris, ou flèches / Page ↑↓ après un clic. Comme les autres composants interactifs, on le **déplace au clic droit** (le clic gauche tourne la vis).
- Pendant la simulation, l'étiquette au-dessus du composant donne la position **et** les deux moitiés de la piste ; leur somme fait toujours la valeur nominale.
- Câblé en **résistance variable** (une seule extrémité utilisée), il ne sert que de rhéostat : laisser l'autre extrémité en l'air reste une entrée flottante côté microcontrôleur.

---

*Composant maison Kablix — dessin de Frank Sauret.*
