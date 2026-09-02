# Capteur de lumière Grove

![Capteur de lumière Grove](grove-light-sensor.webp)

Une petite carte avec un œil électronique dessus. Plus il reçoit de lumière,
plus il laisse passer de courant : la carte transforme ce courant en tension et
la rend sur un seul fil. C'est le capteur des veilleuses qui s'allument quand la
nuit tombe, et des écrans qui baissent tout seuls dans le noir.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il
n'est pas dans la palette d'origine.

## Broches

C'est une prise Grove à quatre fils, dans l'ordre du câble :

| Broche | Rôle |
|--------|------|
| **GND** (noir) | Masse |
| **VCC** (rouge) | Alimentation, 3,3 V ou 5 V |
| **NC** | Rien du tout — ce fil ne sert pas |
| **SIG** (jaune) | Sortie, à relier à une **entrée analogique** (A0, GP26…) |

La sortie n'est pas un tout-ou-rien : c'est une tension qui monte doucement.
Elle doit donc aller sur une entrée capable de mesurer, pas sur une simple
broche numérique.

## Ce que vaut la sortie

| Lumière | Tension sur **SIG** |
|---------|---------------------|
| Le noir complet | proche de **0 V** |
| Une pièce éclairée | à mi-chemin |
| Plein soleil | proche de la tension d'alimentation |

Côté programme, `analogRead(A0)` rend **0** dans le noir et **1023** en pleine
lumière sur une Arduino ; `ADC.read_u16()` rend **0** à **65535** sur une Pico.
Un seuil suffit pour allumer une lampe à la tombée du jour :

```c
if (analogRead(A0) < 200) { /* il fait sombre : on allume */ }
```

## La propriété « éclairement de pleine échelle »

L'inspecteur montre une valeur en **lux** (par défaut **500 lx**). Le lux est
l'unité de la lumière reçue : quelques lux pour une bougie, 500 pour un bureau
bien éclairé, plus de 10 000 dehors par beau temps.

Cette valeur dit **à quel éclairement le capteur arrive au bout de sa course**,
c'est-à-dire quand sa tension de sortie atteint le maximum. Changez-la et le
curseur de simulation change de graduation avec elle : mettez 10 000 lx et le
curseur va de 0 à 10 000.

## Simulation

En simulation, le composant affiche un curseur **Éclairement**, gradué de **0**
à la valeur de pleine échelle. Tirez-le : la tension de la broche `SIG` suit
tout de suite, en ligne droite — 0 lx donne 0 V, la pleine échelle donne la
tension d'alimentation de la carte (5 V ou 3,3 V). Le programme lit le
changement au tour suivant.

Le vrai capteur, lui, ne répond pas tout à fait en ligne droite, et il voit un
peu mieux le vert que le rouge ou le bleu. Sur un vrai montage, on relève donc
les valeurs qui comptent (pièce noire, pièce éclairée) avant de choisir son
seuil.

## Attention

- Le capteur ne donne **pas des lux** : il donne une tension. Pour lire de vrais
  lux, il faut un capteur à mesure directe (un TSL2561 sur le bus I²C, par
  exemple).
- Ne le mettez pas face à la lampe qu'il commande : elle s'allumerait,
  l'éclairerait, il l'éteindrait, et ainsi de suite. Ce clignotement sans fin
  s'évite en écartant les deux, ou en gardant un écart entre le seuil qui allume
  et celui qui éteint.

---

*Dessin et fiche : Frank Sauret. Référence : [Grove - Light Sensor](https://wiki.seeedstudio.com/Grove-Light_Sensor/).*
