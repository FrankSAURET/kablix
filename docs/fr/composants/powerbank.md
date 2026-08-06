# Batterie externe (Power bank)

![Batterie externe (Power bank)](../../img/composants/powerbank.webp)

Batterie portable USB : source de tension **fixe 5 V**, sans réglage — contrairement à l'[alimentation de laboratoire](alim.md), elle n'a pas de bouton. Elle alimente un montage **sans microcontrôleur** (une LED s'allume sur la batterie seule) ou fournit la puissance que la carte ne peut pas donner : servomoteurs, bornier *Power In* du [pilote PWM PCA9685](pca9685.md)…

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

La tension n'est pas réglable : contrairement à l'alim de laboratoire, la batterie n'a ni bouton ni afficheur.

## Voyants de charge

Les quatre LED blanches du dessin (jauge de charge) s'allument **ensemble, avec un halo**, dès que la simulation démarre, et s'éteignent à l'arrêt. Elles indiquent que la batterie est active — pas un niveau de charge simulé : Kablix ne modélise pas de décharge.

## Limitation de courant

Même mécanique que l'alimentation de laboratoire : Kablix estime en continu le courant débité (chemin résistif le plus direct de V+ vers la masse, LED remontant au V+, 0,2 A par servomoteur, consommation déclarée des modules alimentés…). Au-delà de `maxcurrent`, le montage se comporte comme sous-alimenté (les sorties d'un PCA9685 ne bougent plus, par exemple).

## Utilisation

- Câblez **V+** au rail positif du montage et **GND** à la masse — la masse doit être **commune** avec celle de la carte si les deux alimentent le même circuit.
- Pratique pour alimenter des servomoteurs ou un PCA9685 sans avoir à régler une tension : la batterie sort toujours 5 V.
- Vérifiez que `maxcurrent` couvre la charge (0,2 A par servo) : sinon les sorties ne bougent pas.

---

*Dessin de l'appareil réalisé par Frank pour Kablix.*
