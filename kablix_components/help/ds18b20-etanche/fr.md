# Capteur de température DS18B20 — sonde étanche

![Sonde de température DS18B20 étanche](ds18b20-etanche.webp)

La même puce que le [DS18B20 en boîtier TO-92](../ds18b20/fr.md), mais logée
dans un tube inox scellé au bout d'un câble. Même programme, mêmes broches,
mêmes 4,7 kΩ : tout ce qui est écrit sur l'autre fiche vaut ici.

Ce qui change, c'est où on peut la mettre : **dans l'eau**, dans la terre, dans
un congélateur, dehors sous la pluie. C'est la sonde des aquariums, des
chauffe-eau, des stations météo et des serres.

Mesure de **−55 à +125 °C**, à **±0,5 °C** près entre −10 et +85 °C.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il
n'est pas dans la palette d'origine.

## Broches

Trois fils sortent du câble. Les couleurs sont presque toujours celles-ci, mais
elles varient d'un fabricant à l'autre — en cas de doute, la fiche du vendeur
tranche.

| Fil | Rôle |
|-----|------|
| **GND** (noir) | Masse |
| **Data** (jaune) | Le fil de données, à relier à une broche numérique |
| **VDD** (rouge) | Alimentation, 3,3 V ou 5 V |

Ici, pas de risque de se tromper de sens comme avec les pattes du TO-92 : les
couleurs sont explicites.

## Ce qu'il faut savoir en plus

**La résistance de 4,7 kΩ entre `Data` et `VDD` reste obligatoire.** Beaucoup de
sondes vendues « prêtes à brancher » l'ont déjà, cachée dans la gaine
thermorétractable près des fils ou sur une petite carte fournie. Si la vôtre a
quatre fils, ou un petit bloc à trois bornes, regardez avant d'en ajouter une
deuxième.

**Le tube est étanche, pas les fils.** La partie inox va dans le liquide ; la
jonction avec le câble et les extrémités dénudées, non. Une sonde immergée
jusqu'au câble finit par prendre l'eau par capillarité.

**Le câble peut être long** — plusieurs mètres passent sans problème. Au-delà,
ou avec un câble non blindé près d'un moteur, les mesures deviennent
fantaisistes : on descend alors la résistance de tirage vers 2,2 kΩ.

**Elle est lente.** L'inox et l'air autour de la puce mettent du temps à prendre
la température du milieu : comptez plusieurs secondes après l'immersion avant
que la valeur se stabilise. Ce n'est pas un défaut de la puce, c'est la masse à
chauffer ou refroidir.

## Programme

Rigoureusement identique à celui du boîtier TO-92 : voyez les exemples Arduino
et MicroPython de la [fiche du DS18B20](../ds18b20/fr.md). Les deux versions
peuvent même partager le même fil, chacune avec son adresse.

## Simulation

En simulation, le composant affiche un curseur **Température**, de −55 à
+125 °C. Ce que vous y réglez est ce que le programme lit — le capteur répond
pour de bon au protocole 1-Wire, adresse comprise.

---

*Dessin et fiche : Frank Sauret. Référence : [Analog Devices DS18B20](https://www.analog.com/en/products/ds18b20.html).*
