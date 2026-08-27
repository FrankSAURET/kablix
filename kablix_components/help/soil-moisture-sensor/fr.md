# Capteur d'humidité du sol

![Capteur d'humidité du sol](soil-moisture-sensor.webp)

Deux dents que l'on plante dans la terre d'un pot. La terre sèche laisse mal
passer le courant, la terre mouillée le laisse bien passer : le capteur mesure
ce passage et le rend sur un seul fil, sous forme de tension. C'est le capteur
des arrosages automatiques.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il
n'est pas dans la palette d'origine.

## Broches

| Broche | Rôle |
|--------|------|
| **+** (rouge) | Alimentation, 5 V sur une Arduino, 3,3 V sur une Pico |
| **−** (noir) | Masse |
| **S** (signal) | Sortie, à relier à une **entrée analogique** (A0, GP26…) |

La sortie n'est pas un tout-ou-rien : c'est une tension qui monte doucement.
Elle doit donc aller sur une entrée capable de mesurer, pas sur une simple
broche numérique.

## Ce que vaut la sortie

| Terre | Passage du courant | Tension sur **S** |
|-------|--------------------|-------------------|
| Sèche | mauvais | proche de **0 V** |
| Humide | moyen | à mi-chemin |
| Trempée | bon | proche de la tension d'alimentation |

Côté programme, `analogRead(A0)` rend **0** pour le sec et **1023** pour le
trempé sur une Arduino ; `ADC.read_u16()` rend **0** à **65535** sur une Pico.
Un seuil suffit pour décider d'arroser :

```c
if (analogRead(A0) < 350) { /* trop sec : on arrose */ }
```

## Simulation

En simulation, le composant affiche un curseur **Soil moisture**, gradué de
**0 à 100 %**. Tirez-le : la tension de la broche `S` suit tout de suite, en
ligne droite — 0 % donne 0 V, 100 % donne la tension d'alimentation de la carte
(5 V ou 3,3 V). Le programme lit le changement au tour suivant.

Le vrai capteur, lui, ne descend jamais tout à fait à zéro et ne monte jamais
tout à fait au maximum : chaque exemplaire a sa plage. Sur un vrai montage, on
relève donc les deux valeurs extrêmes (dent à l'air libre, dents dans un verre
d'eau) avant de choisir son seuil.

## Attention

- Ne laissez pas les dents **branchées en permanence** dans la terre : le
  courant qui les traverse les ronge (elles s'oxydent). Sur un vrai montage, on
  alimente le capteur juste le temps de la mesure, par une broche de sortie.
- La terre n'est pas une mesure fiable de l'arrosage à elle seule : deux terres
  différentes ne conduisent pas pareil à humidité égale.

---

*Dessin et fiche : Frank Sauret. Référence : [DFRobot SEN0114](https://www.dfrobot.com/product-599.html).*
