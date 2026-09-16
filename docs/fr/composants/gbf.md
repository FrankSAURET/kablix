# Générateur BF

![Générateur BF](../../img/composants/gbf.webp)

Générateur de fonctions de la salle de TP : il sort un **signal qui varie tout seul**, là où l'[alimentation de laboratoire](alim.md) sort une tension fixe. Trois formes au choix — **sinus**, **triangle**, **carré** — réglables en fréquence, en amplitude, en décalage et en rapport cyclique.

C'est l'appareil à sortir dès qu'un montage doit être **attaqué par un signal** plutôt que par une tension : mesure d'un filtre RC, réponse d'un ampli, comptage de créneaux sur une entrée, échantillonnage d'un sinus par le convertisseur analogique.

Catégorie de la palette : **Appareils de mesure**.

## Broches

| Borne | Rôle |
|-------|------|
| **Vs** | Prise banane de **sortie** — le signal (rouge) |
| **GND** | Prise banane **noire** — masse, commune à tout le montage |

Les deux prises sont espacées de 20 px (deux pas de grille). Câblez **Vs** sur une **entrée analogique** de la carte (`A0`…) pour que le programme lise le signal ; **GND** doit être relié à la masse de la carte, sans quoi les deux appareils n'ont aucune référence commune et la lecture n'a pas de sens.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `waveform` | Forme : sinus, triangle ou carré | `sinus` |
| `frequency` | **Fréquence** (Hz), 1 à 1 000 000 au **Hz près** | `1000` |
| `amplitude` | **Amplitude crête** (V), 0 à 10 par pas de **0,1** | `2,5` |
| `offset` | **Décalage continu** (V), −5 à +5 par pas de **0,1** | `2,5` |
| `duty` | **Rapport cyclique** (%), 0 à 100 au **pourcent** | `50` |

> Ces valeurs sont l'état de **départ** : ce sont elles qui reviennent à chaque lancement de simulation. Les boutons tournés en cours de séance ne modifient pas le projet — l'énoncé garde ses réglages d'origine.

L'amplitude est une amplitude **crête**, pas crête-à-crête : `amplitude = 2,5` et `offset = 2,5` donnent un signal qui va de **0 à 5 V**, soit 5 V crête-à-crête.

## Régler l'appareil en cours de simulation

Les **quatre boutons** se tournent **à la souris**, comme sur un vrai appareil : appuyez sur un bouton et faites tourner autour de son centre. Course de **300°** dans le sens horaire ; les 60° restants sont une **zone morte** où le bouton reste collé à l'extrémité la plus proche. Chaque afficheur suit le bouton, avec son unité.

Le **curseur** à droite choisit la forme : **glissez-le** de haut en bas — sinus en haut, triangle au milieu, carré en bas.

Les boutons sont **inertes en édition** : ils ne répondent qu'une fois la simulation lancée (en édition, le clic sert à déplacer l'appareil). Le zoom et la rotation du composant sont pris en compte.

### Le bouton de fréquence est logarithmique

Il couvre **six décades** (1 Hz → 1 MHz) sur 300° : la course est donc **logarithmique**, comme les décades gravées sur le cadran d'un vrai GBF. Chaque cinquantaine de degrés multiplie la fréquence par dix. En course linéaire, un seul degré vaudrait 3 300 Hz et aucun réglage fin ne serait possible en bas de plage.

L'afficheur écrit l'unité qui convient : `1 Hz`, `250 Hz`, `12,5 kHz`, `1 MHz`.

### Le rapport cyclique déforme le carré ET le triangle

- **Carré** : le rapport cyclique est la part de la période passée à l'état **haut**. À 50 % le signal est symétrique ; à 10 % ce sont de brèves impulsions ; à **0 %** il reste bas en permanence, à **100 %** haut en permanence — deux façons d'obtenir une tension continue.
- **Triangle** : le rapport cyclique règle la durée de la **montée**. À 50 % le triangle est symétrique (sommet au milieu de la période) ; à 90 % la montée est lente et la descente raide — c'est une **dent de scie**. À 10 %, la dent de scie est inversée.
- **Sinus** : le rapport cyclique n'a **aucun effet** — un sinus déformé ne serait plus un sinus.

## Ce que la carte lit vraiment

Le signal est calculé **à l'instant exact de la conversion** analogique, pas une fois par image : à 1 MHz une période dure une microseconde, et une valeur posée par image serait des milliers de périodes en retard. Un programme qui lit `analogRead` en boucle voit donc bien la forme d'onde.

Attention à l'**écrêtage** : une entrée analogique ne lit ni le négatif, ni au-delà de sa tension de référence (**5 V** sur Arduino, **3,3 V** sur Pico). Un signal de 10 V crête sans décalage ressort **écrêté** — plein échelle sur les sommets, zéro sur toute l'alternance négative, et la forme lue n'a plus rien à voir avec celle du cadran. Pour rester dans la plage, décalez : par exemple `amplitude = 1,5` et `offset = 1,65` sur un Pico.

## Utilisation

- Un **filtre RC** : Vs sur l'entrée du filtre, la sortie du filtre sur `A0`, GND commun. Tournez la fréquence et lisez l'atténuation — le [traceur de courbes](../USAGE.md) montre la coupure.
- Un **compteur de créneaux** : forme carrée, quelques Hz, Vs sur une entrée numérique. Le rapport cyclique change la largeur des impulsions.
- Un **échantillonnage** : sinus à quelques dizaines de Hz, amplitude et décalage centrés dans la plage de la carte, et `analogRead` en boucle.

---

*Dessin de l'appareil réalisé par Frank pour Kablix.*
