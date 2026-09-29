# Batterie LiPo 1S

![Batterie LiPo 1S](batterie-lipo.webp)

Un seul élément lithium-polymère, celui des drones et des montres connectées. Chargée, elle donne **4,2 V** ; vide, il ne reste que **3,0 V**. Capacité : **1000 mAh**.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il n'est pas dans la palette d'origine.

## Broches

| Broche | Rôle |
|--------|------|
| **+** | Pôle positif, à relier à l'entrée d'alimentation de la carte |
| **−** | Pôle négatif, à relier à une masse **GND** de la carte |

## Où la brancher

| Carte | Entrée | Résultat |
|-------|--------|----------|
| Pico | **VSYS** ou **VBUS** (1,8 à 5,5 V) | Démarre et tourne jusqu'à ce que la batterie soit vide |
| Uno, Nano, Mega | **VIN** (6,2 à 20 V) | Refusé : 4,2 V, c'est trop peu |
| Uno, Nano, Mega | **5V** (4,5 à 5,5 V) | Refusé : 4,2 V, c'est trop peu |

Sur un vrai montage, une LiPo ne se vide jamais sous 3,0 V : elle s'abîmerait. Les cartes de protection coupent avant.

## La propriété « capacité »

L'inspecteur montre la capacité en **mAh** (par défaut **1000**). Baissez-la pour voir la fin de l'histoire sans attendre des heures.

## Simulation

La batterie se vide au rythme de ce qu'elle alimente, la carte comprise. Sa tension descend en ligne droite, de 4,2 V pleine à 3,0 V vide. Le traceur montre trois courbes : la **charge** (%), la **tension** (V) et l'**autonomie** restante (h).

La simulation s'arrête avec un message quand la carte ne peut pas démarrer, quand la tension sort de la plage de l'entrée, ou quand la batterie est vide.

---

*Dessin et fiche : Frank Sauret.*
