# Multimètre

![Multimètre](../../img/composants/multimetre.webp)

Appareil de mesure à deux prises banane. L'**inter à bascule** choisit ce qu'il mesure : levier **en haut** = **courant continu** (ampèremètre), levier **en bas** = **tension continue** (voltmètre). L'écran affiche la mesure avec son unité, comme un vrai appareil.

Catégorie de la palette : **Appareils de mesure**.

## Broches

| Borne | Rôle |
|-------|------|
| **+** | Prise banane **rouge** — borne d'entrée du courant, ou point le plus haut de la tension mesurée |
| **GND** | Prise banane **noire** — borne de retour |

Les deux prises sont espacées de 20 px (deux pas de grille). Si la mesure sort **négative**, c'est que les deux fils sont inversés — comme sur un vrai appareil, ce n'est pas une erreur de câblage, juste un signe.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `mode` | Mesure : `voltage` (tension continue) ou `current` (courant continu) | `voltage` |

Le mode se choisit dans le panneau **à tout moment**, ou d'un clic sur l'inter à bascule **pendant la simulation**. Changer de mode remet l'écran à zéro : des ampères lus comme des volts ne veulent rien dire.

## Voltmètre : en parallèle

Le voltmètre mesure une **différence de hauteur électrique** entre ses deux prises. Il se branche **en travers** de ce qu'on veut mesurer, sans rien couper :

- aux bornes d'une résistance, d'une LED, d'une pile ;
- entre une broche de la carte et la masse.

Il ne consomme rien : le montage se comporte exactement comme si l'appareil n'était pas là. On peut donc le laisser branché sans jamais rien fausser.

## Ampèremètre : en série

L'ampèremètre compte ce qui **traverse** ses prises. Il faut donc **ouvrir le circuit** et l'insérer dans la coupure, dans la branche dont on veut le courant :

```
+5 V ──── R 1 kΩ ──── [+ multimètre GND] ──── GND
```

Électriquement, l'ampèremètre est un **simple fil** : ses deux prises ne font qu'un seul point du montage. C'est ce qui permet au courant de le traverser sans que la mesure change quoi que ce soit.

> **Attention — le piège classique.** Un ampèremètre posé **en travers** d'une alimentation (comme on poserait un voltmètre) la met en **court-circuit** : un fil relie directement le plus au moins. Kablix encadre alors le composant en rouge et le dit dans la barre d'état. Sur un vrai appareil, c'est le fusible qui saute.

## Ce que l'écran affiche

- **Tension** : `12,3 V`, `0,00 V`, `-5,00 V`.
- **Courant** : en **milliampères** sous l'ampère (`4,99 mA`), en ampères au-delà (`1,25 A`).
- Quatre chiffres utiles au plus : sous 10 deux décimales, sous 100 une seule, au-delà aucune — comme un appareil à trois chiffres et demi.
- Prises **en l'air** (rien de câblé) : l'écran reste à zéro.

## Utilisation

- Pour **relever une tension**, laissez le montage tel quel et posez les deux prises aux points à comparer.
- Pour **relever un courant**, coupez le fil de la branche visée et remettez le multimètre à la place du morceau enlevé.
- La mesure se rafraîchit à chaque image de la simulation : elle suit une LED qui s'allume, un moteur qui démarre, un potentiomètre qu'on tourne.
- Hors simulation, l'écran est éteint et l'inter ne bascule pas — le clic sert alors à sélectionner et déplacer l'appareil.

---

*Dessin de l'appareil réalisé par Frank pour Kablix.*
