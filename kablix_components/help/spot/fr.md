# Projecteur PAR 38 DMX

![Projecteur PAR 38 DMX](spot.webp)

Projecteur à LED PAR 38 (Contest) piloté en **DMX512**. Il écoute la ligne et prend la couleur envoyée sur ses canaux. Composant de bibliothèque : il s'installe par le gestionnaire de composants, il n'est pas dans la palette d'origine.

## Broches

| Broche | Rôle |
|--------|------|
| **GND** | Blindage du câble XLR (broche 1) |
| **−** | Data− (broche 2) |
| **+** | Data+ (broche 3) |

Les **deux** fils de la paire doivent être câblés jusqu'à l'interface : relié par le seul Data+, le projecteur n'est pas piloté — il est à moitié câblé, et la simulation le laisse éteint.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `address` | Adresse DMX, 1 à 512. Le projecteur lit quatre canaux à partir de là : rouge, vert, bleu, effets | 1 |

Plusieurs projecteurs peuvent partager la même ligne, chacun à son adresse : c'est tout le principe du DMX. Deux projecteurs à la même adresse font la même couleur.

## Canaux

| Canal | Rôle | Valeurs |
|-------|------|---------|
| adresse | Rouge | 0 à 255 |
| adresse + 1 | Vert | 0 à 255 |
| adresse + 2 | Bleu | 0 à 255 |
| adresse + 3 | Effets | **0 à 189** : intensité lumineuse (0 = éteint, 189 = plein feu) ; **190 à 250** : clignotement, de 1 Hz (190) à 10 Hz (250) ; **251 à 255** : pas de changement, la couleur telle qu'envoyée |

Le canal effets à 0, le projecteur reste **éteint** quelle que soit la couleur : un programme qui n'envoie que rouge, vert et bleu doit aussi régler ce quatrième canal.

## Câblage

Carte → [Grove DMX512](dmx-grove.md) → câble XLR → projecteur. Les projecteurs suivants se raccordent en **chaîne** sur la même paire.

## Simulation

Kablix décode la trame émise par la carte et allume les LED du projecteur à la couleur reçue, avec son halo. Les deux voies sont reconnues :

- **UART matériel** — `Serial.begin(250000, SERIAL_8N2)` côté Arduino, `machine.UART(0, 250000, stop=2)` côté Pico, BREAK et MAB tenus par le programme ;
- **bibliothèque bit-bang** — `DmxSimple`, qui n'utilise pas l'UART mais génère la trame sur une broche ordinaire (la 3 par défaut) : la ligne est décodée front par front.

Un canal de couleur à 0 éteint la LED correspondante ; les trois à 0 éteignent le projecteur. Le clignotement suit le temps simulé : il se fige quand la simulation est en pause.

---

*Dessin et fiche : Frank Sauret. Référence : [Contest](https://www.contest-lighting.com/).*
