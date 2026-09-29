# Batterie externe (Power bank)

![Batterie externe (Power bank)](../../img/composants/powerbank.webp)

Batterie portable USB : source de tension **fixe 5 V**, sans réglage — contrairement à l'[alimentation de laboratoire](alim.md), elle n'a pas de bouton. Elle alimente un montage **sans microcontrôleur** (une LED s'allume sur la batterie seule), fournit la puissance que la carte ne peut pas donner — servomoteurs, bornier *Power In* du [pilote PWM PCA9685](pca9685.md)… — ou **alimente la carte elle-même**, et se vide alors de sa consommation.

Catégorie de la palette : **Divers**.

## Broches

| Borne | Rôle |
|-------|------|
| **V+** | pôle positif — 5 V fixes |
| **GND** | masse (0 V, commune à tout le montage) |

Les fils câblés sur V+ et GND prennent automatiquement les couleurs rouge et noire.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `maxcurrent` | Courant maximal fourni (A), 0,1 à 10 par pas de 0,1 | `2` |
| `capacity` | Capacité (mAh), 1 à 50 000 | `10000` |

La tension n'est pas réglable : contrairement à l'alim de laboratoire, la batterie n'a ni bouton ni afficheur.

## Voyants de charge

Les quatre LED blanches du dessin forment la **jauge de charge** : pleine au lancement (les quatre allumées, avec un halo), elle perd une LED par quart de charge consommé — une LED par quart **entamé** reste allumée, comme sur une vraie batterie. Vide, plus aucune LED : sa sortie tombe à 0 V et tout ce qu'elle alimente s'éteint. Chaque lancement la remet pleine.

## Décharge et autonomie

La batterie se vide de ce qu'elle débite, en **temps de programme** (au ralenti comme en accéléré, une seconde de programme consomme la même chose) :

- ses charges directes — LED, résistances, servos branchés sur **V+** ;
- **la carte entière** quand c'est elle qui l'alimente : **V+** sur une entrée d'alimentation de la carte (**5V** d'une Arduino, **VSYS** ou **VBUS** d'une Pico — sur **VIN**, 5 V ne suffisent pas au régulateur : la carte refuse de démarrer) et **GND** sur une masse de la carte. La carte ne tire alors plus rien de l'USB : sa consommation — elle-même, plus ce que ses broches alimentent — sort de la batterie (voir *Consommation de la carte* dans le guide d'utilisation).

Le [traceur](../USAGE.md) montre deux courbes par batterie : **`Bat1 : charge`** (%) et **`Bat1 : autonomie`** (heures restantes au courant du moment). Quand la batterie qui alimente la carte est vide, **la carte s'éteint** : la simulation s'arrête et la barre d'état dit au bout de combien de temps de programme.

> Une vraie batterie de 10 000 mAh fait tourner une Uno plus de neuf jours : pour la voir se vider pendant une séance, réglez `capacity` sur **1 mAh**. Le projet de test `consommation-uno` le fait.

## Limitation de courant

Même mécanique que l'alimentation de laboratoire : Kablix estime en continu le courant débité (chemin résistif le plus direct de V+ vers la masse, LED remontant au V+, 0,2 A par servomoteur, consommation déclarée des modules alimentés…). Au-delà de `maxcurrent`, le montage se comporte comme sous-alimenté (les sorties d'un PCA9685 ne bougent plus, par exemple).

## Utilisation

- Câblez **V+** au rail positif du montage et **GND** à la masse — la masse doit être **commune** avec celle de la carte si les deux alimentent le même circuit.
- Pratique pour alimenter des servomoteurs ou un PCA9685 sans avoir à régler une tension : la batterie sort toujours 5 V.
- Vérifiez que `maxcurrent` couvre la charge (0,2 A par servo) : sinon les sorties ne bougent pas.
- Pour mesurer l'**autonomie** d'un montage, faites alimenter la carte par la batterie (V+ sur 5V ou VSYS, GND sur GND) et lisez la courbe d'autonomie au traceur : endormir le microcontrôleur la fait grimper — beaucoup sur une Pico, peu sur une Uno.

---

*Dessin de l'appareil réalisé par Frank pour Kablix.*
