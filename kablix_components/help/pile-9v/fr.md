# Pile 9 V

![Pile 9 V](pile-9v.webp)

La pile rectangulaire à pression (6LR61). Neuve, elle donne **9,5 V** ; usée, il ne reste que **6,0 V**. Capacité : **500 mAh**.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il n'est pas dans la palette d'origine.

## Broches

| Broche | Rôle |
|--------|------|
| **+** | Pôle positif, à relier à l'entrée d'alimentation de la carte |
| **−** | Pôle négatif, à relier à une masse **GND** de la carte |

## Où la brancher

| Carte | Entrée | Résultat |
|-------|--------|----------|
| Uno, Nano, Mega | **VIN** (6,2 à 20 V) | Démarre, s'arrête quand la tension passe sous **6,2 V** |
| Uno, Nano, Mega | **5V** (4,5 à 5,5 V) | Refusé : 9,5 V, c'est trop |
| Pico | **VSYS** ou **VBUS** (1,8 à 5,5 V) | **La carte grille** : ces entrées n'ont pas de régulateur pour encaisser 9,5 V |

Une pile 9 V a peu de réserve : une Uno qui tire 46 mA la vide en une dizaine d'heures.

## La propriété « capacité »

L'inspecteur montre la capacité en **mAh** (par défaut **500**). Baissez-la pour voir la fin de l'histoire sans attendre des heures.

## Simulation

La pile se vide au rythme de ce qu'elle alimente, la carte comprise. Sa tension descend en ligne droite, de 9,5 V pleine à 6,0 V vide. Le traceur montre trois courbes : la **charge** (%), la **tension** (V) et l'**autonomie** restante (h).

La simulation s'arrête avec un message quand la carte ne peut pas démarrer, quand la tension sort de la plage de l'entrée, ou quand la pile est vide.

---

*Dessin et fiche : Frank Sauret.*
