# Grove DMX512

![Grove DMX512](dmx-grove.webp)

Carte Grove DMX512 (Seeed Studio) : un émetteur de ligne **SP3485** qui transforme l'UART de la carte en sortie DMX512 sur une embase **XLR 3 points**. Composant de bibliothèque : il s'installe par le gestionnaire de composants.

## Broches

| Broche | Rôle |
|--------|------|
| **SIG** | Entrée série, à relier à la broche d'émission de la carte |
| **VCC** | Alimentation +5 V |
| **GND.1** | Masse, côté Grove |
| **NC** | Non connectée |
| **+** | Data+ du XLR (broche 3) |
| **−** | Data− du XLR (broche 2) |
| **GND.2** | Blindage du XLR (broche 1) |

Deux masses, donc deux noms : le dessin porte « GND » des deux côtés, la netlist les distingue par `GND.1` et `GND.2` — comme le `Com.1` / `Com.2` du relais.

## Câblage

- **SIG** sur une broche d'émission : `1` (TX) sur Uno, `1` / `18` / `16` / `14` sur Mega, `GP0` sur Pico. Avec `DmxSimple`, n'importe quelle broche fait l'affaire (la 3 par défaut).
- **VCC** au +5 V, **GND.1** à la masse.
- Côté XLR, `+` / `−` / `GND.2` vers le [projecteur](spot.md), en chaîne pour les suivants.

## Simulation

La carte n'a pas de comportement propre : c'est un émetteur de ligne. C'est elle qui donne son sens au montage — Kablix remonte de la broche câblée sur **SIG** jusqu'aux projecteurs qui partagent sa paire, et leur applique les canaux qu'ils écoutent. Débranchée de la carte ou du projecteur, plus rien ne s'allume.

Avec l'**analyseur logique**, une [sonde](sonde-logique.md) posée sur **SIG** ou sur **+** montre le signal de la broche qui attaque la carte, et une sonde posée sur **−** le même signal **inversé** : c'est la paire différentielle du DMX, où la ligne − est toujours à l'opposé de la ligne +. Pour décoder la voie −, cochez **Inverser** dans ses réglages : elle se lit alors comme la +. Dans la marge, les voies **+** et **−** portent les tensions de sortie de l'émetteur de ligne, **3,7 V** à l'état haut et **1,1 V** à l'état bas (valeurs de la fiche technique du SN75176A), et non celles de la carte ; la voie **SIG** garde celles de la carte.

Le trafic DMX ne remonte **pas** au moniteur série : une trame, ce sont 513 octets binaires par seconde, la console serait noyée.

---

*Dessin et fiche : Frank Sauret. Référence : [Seeed Studio](https://wiki.seeedstudio.com/Grove-DMX512/).*
