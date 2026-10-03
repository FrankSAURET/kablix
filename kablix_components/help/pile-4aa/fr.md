# Coupleur de 4 piles AA

![Coupleur de 4 piles AA](pile-4aa.webp)

Quatre piles alcalines AA en série dans un boîtier. Neuves, elles donnent **6,4 V** ; usées, il ne reste que **4,4 V**. Capacité : **2500 mAh**.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il n'est pas dans la palette d'origine.

## Broches

| Broche | Rôle |
|--------|------|
| **+** | Pôle positif, à relier à l'entrée d'alimentation de la carte |
| **−** | Pôle négatif, à relier à une masse **GND** de la carte |

## Où la brancher

| Carte | Entrée | Résultat |
|-------|--------|----------|
| Uno, Nano, Mega | **VIN** (6,2 à 20 V) | Démarre, mais s'arrête dès que la tension passe sous **6,2 V** |
| Uno, Nano, Mega | **5V** (4,5 à 5,5 V) | Refusé : 6,4 V, c'est trop |
| Pico | **VSYS** ou **VBUS** (1,8 à 5,5 V) | **La carte grille** : ces entrées n'ont pas de régulateur pour encaisser 6,4 V |

Sur VIN, le régulateur de la carte a besoin d'une marge : quatre piles neuves passent tout juste, et la carte s'éteint bien avant que les piles soient vides. Sur un vrai montage, c'est pareil — c'est pourquoi on voit souvent six piles AA sur une Uno.

## La propriété « capacité »

L'inspecteur montre la capacité en **mAh** (par défaut **2500**). Baissez-la pour voir la fin de l'histoire sans attendre des heures.

## Simulation

La pile se vide au rythme de ce qu'elle alimente, la carte comprise. Sa tension descend en ligne droite, de 6,4 V pleine à 4,4 V vide. Le traceur montre trois courbes : la **charge** (%), la **tension** (V) et l'**autonomie** restante (h).

La simulation s'arrête avec un message quand la carte ne peut pas démarrer, quand la tension sort de la plage de l'entrée, ou quand la pile est vide.

---

*Dessin et fiche : Frank Sauret.*
