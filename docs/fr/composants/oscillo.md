# Oscilloscope

![Oscilloscope](../../img/composants/oscillo.webp)

Appareil de mesure à deux prises banane, comme le [multimètre](multimetre.md) — mais au lieu d'un chiffre, il **dessine la tension au fil du temps**. L'écran porte une grille de **10 carreaux sur 10**, les deux axes au milieu. Deux boutons règlent la taille d'un carreau : un en hauteur (volts), un en largeur (temps).

Catégorie de la palette : **Appareils de mesure**.

## Broches

| Borne | Rôle |
|-------|------|
| **+** | Prise banane **rouge** — le point dont on regarde la tension |
| **GND** | Prise banane **noire** — le point de référence |

Les deux prises sont espacées de 20 px (deux pas de grille). L'oscilloscope se branche **en parallèle**, en travers de ce qu'on veut voir, exactement comme un voltmètre : aux bornes d'une résistance, d'une LED, ou entre une broche de la carte et la masse. Il ne consomme rien, le montage se comporte comme s'il n'était pas là.

Si la courbe part vers le bas au lieu du haut, les deux fils sont inversés — ce n'est pas une erreur de câblage, juste un signe.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `voltsdiv` | Hauteur d'un carreau, en volts : `0.1`, `0.5`, `1`, `2` ou `5` | `1` |
| `sdiv` | Largeur d'un carreau, en secondes — **nombre libre** | `1` |
| `trigger` | Tension de **déclenchement**, en volts. **Vide** = posée toute seule | *(vide)* |
| `triggeredge` | Sens du front qui déclenche : `rising` (montant) ou `falling` (descendant) | `rising` |

Les deux se règlent dans le panneau à tout moment, ou **à la souris sur les boutons pendant la simulation**.

## Les deux boutons

Chaque bouton se tourne d'un cran par **clic** : sur sa **moitié droite** pour tourner à droite, sur sa **moitié gauche** pour tourner à gauche. La **molette** de la souris marche aussi.

- **Volts/Div** (bouton de gauche) : cinq crans dessinés, `0,1 · 0,5 · 1 · 2 · 5` volts par carreau, avec **butée** aux deux bouts. Plus le chiffre est petit, plus la courbe est haute. L'écran fait 5 carreaux au-dessus de l'axe et 5 en dessous : à 1 V/div, il montre de −5 V à +5 V.
- **s/Div** (bouton de droite) : **sans butée**, il tourne tant qu'on veut. Vers la **droite** la courbe se **dilate** (moins de secondes par carreau, on voit le détail) ; vers la **gauche** elle se **rétracte** (on voit plus longtemps). Un tour complet vaut un facteur **10**, soit huit crans. Pas de liste `1-2-5` : les valeurs intermédiaires existent (`1,33 s/div`, `562 ms/div`…).

Le cartouche **sous l'écran** rappelle les deux calibres et la tension de déclenchement, dans l'unité qui parle :

```
Vert : 2 V/div
Hor : 500 ms/div
Dec : 0,8 V
```

## Le déclenchement

Sans lui, une courbe qui se répète **glisse sans arrêt** : chaque image repart là où le hasard l'a laissée, et un créneau bien régulier a l'air de courir sur l'écran. Le déclenchement règle ça comme on recale un film sur la même image : l'appareil cherche, en remontant le temps, le dernier endroit où le signal **traverse une tension donnée dans un sens donné**, et il met **ce point-là au bord gauche** de l'écran. La courbe se redessine alors toujours au même endroit, immobile.

- **Le curseur** — le petit triangle bleu collé au bord **gauche** de l'écran — donne la **tension**. Pendant la simulation, on le **prend à la souris** et on le monte ou on le descend ; le cartouche suit (`Dec : …`). Tant qu'on n'y touche pas, il se pose tout seul **à mi-hauteur du signal**, ce qui tombe juste sur à peu près tout (créneau, sinus, dent de scie).
- **Le petit bouton** en bas à droite du dessin choisit le **sens** : sa moitié bleue **en haut** = front **montant** (le signal grimpe en traversant), **en bas** = front **descendant**. Un clic bascule de l'un à l'autre.

Si le signal ne traverse jamais cette tension — une tension continue, ou un curseur monté trop haut — il n'y a rien sur quoi se caler : la courbe **redéfile** comme avant. C'est le signe qu'il faut redescendre le curseur dans le signal.

## Ce que montre l'écran

- Sans déclenchement possible, la courbe **défile vers la gauche** : le présent est au bord **droit**, le passé s'en va par la gauche. La largeur visible vaut **10 carreaux**, donc dix fois le calibre horizontal.
- Le temps affiché est celui du **programme**, pas celui de la montre. Au ralenti, la courbe se dessine plus lentement mais garde la bonne échelle.
- Un signal trop haut est **coupé au bord** de l'écran, comme sur un vrai appareil : baissez le calibre vertical (chiffre plus grand) pour le faire rentrer.
- Prises **en l'air** (rien de câblé) : la courbe s'interrompt.
- L'écran se **vide au démarrage** de la simulation : chaque essai repart d'une trace propre.
- Hors simulation, l'écran est vide et les boutons ne tournent pas — le clic sert alors à sélectionner et déplacer l'appareil.

> **Ce qu'il ne sait pas faire.** L'appareil relève **un point par image**, soit environ 60 par seconde. Il montre très bien ce qui est **lent** : une LED qui s'allume, un condensateur qui se charge, un potentiomètre qu'on tourne, un signal qui clignote à quelques hertz. Il ne montre **pas** la forme d'un signal rapide (une PWM à 500 Hz, une trame série) : il n'en attrape que quelques points au hasard.

## Utilisation

- Posez les deux prises aux points à comparer, lancez la simulation, puis réglez d'abord le **Volts/Div** pour que la courbe tienne dans l'écran, ensuite le **s/Div** pour voir ce qui vous intéresse.
- Courbe qui court sur l'écran alors que le signal se répète : c'est le **déclenchement** qu'il faut régler — descendez le curseur au milieu du signal.
- Pour observer une charge de condensateur, mettez 1 V/div et quelques centaines de millisecondes par carreau.
- Pour surveiller une tension qui bouge lentement (capteur, potentiomètre), montez à plusieurs secondes par carreau : l'écran devient un enregistreur.

---

*Dessin de l'appareil réalisé par Frank pour Kablix.*
