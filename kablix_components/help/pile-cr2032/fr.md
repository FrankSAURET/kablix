# Pile bouton CR2032

![Pile bouton CR2032](pile-cr2032.webp)

La pile plate au lithium des montres et des cartes mères. Neuve, elle donne **3,0 V** ; usée, il ne reste que **2,0 V**. Capacité : **220 mAh**.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il n'est pas dans la palette d'origine.

## Broches

| Broche | Rôle |
|--------|------|
| **+** | Pôle positif, à relier à l'entrée d'alimentation de la carte |
| **−** | Pôle négatif, à relier à une masse **GND** de la carte |

## Où la brancher

| Carte | Entrée | Résultat |
|-------|--------|----------|
| Pico | **VSYS** ou **VBUS** (1,8 à 5,5 V) | Démarre et tourne jusqu'à ce que la pile soit vide |
| Uno, Nano, Mega | **VIN** (6,2 à 20 V) | Refusé : 3 V, c'est trop peu |
| Uno, Nano, Mega | **5V** (4,5 à 5,5 V) | Refusé : 3 V, c'est trop peu |

Une CR2032 convient à un montage qui dort le plus clair de son temps : une Pico en veille profonde tire environ 1,3 mA, éveillée 21 mA.

## La propriété « capacité »

L'inspecteur montre la capacité en **mAh** (par défaut **220**). Baissez-la pour voir la fin de l'histoire sans attendre des heures.

## Simulation

La pile se vide au rythme de ce qu'elle alimente, la carte comprise. Sa tension descend en ligne droite, de 3,0 V pleine à 2,0 V vide. Le traceur montre trois courbes : la **charge** (%), la **tension** (V) et l'**autonomie** restante (h).

La simulation s'arrête avec un message quand la carte ne peut pas démarrer, quand la tension sort de la plage de l'entrée, ou quand la pile est vide.

---

*Dessin et fiche : Frank Sauret.*
