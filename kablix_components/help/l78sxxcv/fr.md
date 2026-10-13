# Régulateur de tension L78SxxCV

![Régulateur de tension L78SxxCV](l78sxxcv.webp)

Un régulateur linéaire positif de STMicroelectronics, en boîtier TO-220. Il transforme une tension d'entrée plus haute en une **tension de sortie fixe** (le « xx » du nom), jusqu'à **2 A**.

> **Béta** — composant en cours de validation.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il n'est pas dans la palette d'origine.

## Broches

Vu de face, côté inscription tourné vers soi :

| Broche | Rôle |
| --- | --- |
| **IN** | Entrée, au moins 2 V au-dessus de la sortie |
| **GND** | Masse commune de l'entrée et de la sortie |
| **OUT** | Sortie régulée |

## Propriétés

- **Tension de sortie (V)** : 5, 6, 8, 8,5, 9, 12, 15, 18 ou 24 V.
- **Courant max (A)** : 2 A par défaut. Au-delà, la tension s'effondre.
- **Radiateur (°C/W)** : 0 = aucun (air libre, 50 °C/W). Un radiateur de 5 °C/W ramène la résistance thermique à 8 °C/W (3 °C/W du boîtier + 5).

## Marge de 2 V (dropout)

Le régulateur a besoin d'au moins **2 V** de plus à l'entrée qu'à la sortie. Pour un L78S05 (5 V), il faut donc 7 V à l'entrée.

Sous cette marge, la sortie ne tient plus : elle vaut **l'entrée moins 2 V**. Une pile 9 V neuve (9,5 V) sur un L78S12 ne donne que 7,5 V.

Sans tension à l'entrée, la sortie est à 0 V.

## Courant limité

Si la charge réclame plus que le courant max, la tension de sortie **s'effondre** : le régulateur limite son courant, la tension baisse en proportion. Une résistance de 1 Ω sur un 5 V limité à 2 A donne 2 V, pas 5 V.

## En simulation

La tension de sortie se recalcule à chaque changement du montage : réglage, tension d'entrée, charge. L'entrée peut venir d'une alimentation de laboratoire, d'une pile ou d'un autre régulateur en cascade, ou d'un rail de la carte (VIN, 5V…).

- Une **diode** en série sur l'entrée retire son seuil (0,6 V par défaut) ; montée à l'envers, rien n'arrive.
- Une **résistance** en série retire `R × I` : le courant d'entrée est celui que le régulateur débite. Trop de résistance, et la marge de 2 V disparaît : la sortie baisse.
- Le courant débité est **reporté sur la source** d'entrée (alimentation, pile ou régulateur amont). Une pile se vide donc plus vite, une alimentation dépasse son courant max.

## Courant de repos

Le régulateur tire environ **5 mA** sur son entrée, même sans charge. Ce courant s'ajoute à celui de la sortie : il est reporté sur la source (une pile se vide un peu plus vite) et il fait chuter une résistance placée à l'entrée.

## Échauffement

Un régulateur linéaire transforme en chaleur ce qu'il retire à la tension : **P = (Vin − Vout) × I + Vin × Iq**. La température de la jonction vaut **25 °C + P × résistance thermique** (50 °C/W sans radiateur).

- Au-dessus de **125 °C** : alerte « trop chaud », la sortie tient encore.
- À **150 °C** : la protection thermique **coupe la sortie** (0 V) et le composant s'encadre en rouge.

Exemple : 12 V → 5 V sous 0,5 A dissipe 3,6 W, soit 205 °C sans radiateur : coupure. Avec un radiateur de 5 °C/W, la jonction reste à 53 °C.

Limite de la simulation : les condensateurs conseillés sur l'entrée et la sortie ne sont pas nécessaires.
