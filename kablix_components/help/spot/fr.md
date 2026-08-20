# Projecteur PAR 38 DMX

![Projecteur PAR 38 DMX](spot.webp)

Projecteur à LED PAR 38 (Contest) piloté en **DMX512**. Il écoute la ligne et
prend la couleur envoyée sur ses canaux. Composant de bibliothèque : il
s'installe par le gestionnaire de composants, il n'est pas dans la palette
d'origine.

## Broches

| Broche | Rôle |
|--------|------|
| **GND** | Blindage du câble XLR (broche 1) |
| **−** | Data− (broche 2) |
| **+** | Data+ (broche 3) |

Les **deux** fils de la paire doivent être câblés jusqu'à l'interface : relié par
le seul Data+, le projecteur n'est pas piloté — il est à moitié câblé, et la
simulation le laisse éteint.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `address` | Adresse DMX, 1 à 512. Le projecteur lit trois canaux à partir de là : rouge, vert, bleu | 1 |

Plusieurs projecteurs peuvent partager la même ligne, chacun à son adresse :
c'est tout le principe du DMX. Deux projecteurs à la même adresse font la même
couleur.

## Câblage

Carte → [Grove DMX512](dmx-grove.md) → câble XLR → projecteur. Les projecteurs
suivants se raccordent en **chaîne** sur la même paire.

## Simulation

Kablix décode la trame émise par la carte et allume les LED du projecteur à la
couleur reçue, avec son halo. Les deux voies sont reconnues :

- **UART matériel** — `Serial.begin(250000, SERIAL_8N2)` côté Arduino,
  `machine.UART(0, 250000, stop=2)` côté Pico, BREAK et MAB tenus par le
  programme ;
- **bibliothèque bit-bang** — `DmxSimple`, qui n'utilise pas l'UART mais génère
  la trame sur une broche ordinaire (la 3 par défaut) : la ligne est décodée
  front par front.

Un canal à 0 éteint la LED correspondante ; les trois à 0 éteignent le
projecteur.

---

*Dessin et fiche : Frank Sauret. Référence : [Contest](https://www.contest-lighting.com/).*
