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

## Marge de 2 V (dropout)

Le régulateur a besoin d'au moins **2 V** de plus à l'entrée qu'à la sortie. Pour un L78S05 (5 V), il faut donc 7 V à l'entrée.

Sous cette marge, la sortie ne tient plus : elle vaut **l'entrée moins 2 V**. Une pile 9 V neuve (9,5 V) sur un L78S12 ne donne que 7,5 V.

Sans tension à l'entrée, la sortie est à 0 V.

## Courant limité

Si la charge réclame plus que le courant max, la tension de sortie **s'effondre** : le régulateur limite son courant, la tension baisse en proportion. Une résistance de 1 Ω sur un 5 V limité à 2 A donne 2 V, pas 5 V.

## En simulation

La tension de sortie se recalcule à chaque changement du montage : réglage, tension d'entrée, charge. L'entrée peut venir d'une alimentation de laboratoire, d'une pile ou d'un autre régulateur en cascade, ou d'un rail de la carte (VIN, 5V…).

Limites de la simulation :

- Le courant tiré par le régulateur n'est pas compté sur sa source d'entrée.
- Le courant de repos et l'échauffement ne sont pas simulés.
- Les condensateurs conseillés sur l'entrée et la sortie ne sont pas nécessaires.
