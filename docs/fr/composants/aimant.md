# Aimant

![Aimant](../../img/composants/aimant.webp)

> **Béta** — composant en cours de mise au point : dessin provisoire, comportement susceptible d'évoluer.

Petit **aimant permanent** en barreau (20 × 10 mm, pôle **N** rouge, pôle **S** bleu). Il n'a aucune broche : il ne se câble pas, il se **pose** sur la feuille ou se **fixe** sur une pièce qui bouge. Les **capteurs à effet Hall** de la feuille le détectent quand il passe devant eux.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `Fixé sur` | Repère du servo qui porte l'aimant (`Act1`…). Vide : l'aimant reste immobile. | vide |

## Fixer l'aimant sur un servo

1. **Glisser l'aimant sur le palonnier** du servo, là où il doit se trouver. Pendant le geste, un cercle vert entoure le palonnier visé ; au lâcher, `Fixé sur` reçoit le repère du servo (par exemple `Act1`).
2. On peut aussi écrire ce repère à la main dans `Fixé sur`, depuis l'inspecteur.
3. Lancer la simulation : l'aimant **tourne avec le palonnier**, autour de son axe, en suivant l'angle commandé par le programme. Rotation, miroir et zoom du servo sont pris en compte. Un petit anneau au-dessus de l'aimant rappelle qu'il est fixé.

Déplacer un aimant fixé **sur son servo** (hors palonnier) ne le détache pas. Lâché sur le palonnier d'un **autre** servo, il passe sur celui-ci ; lâché **ailleurs**, il se détache. Supprimer le servo détache aussi ses aimants (un Ctrl+Z ramène le servo et les refixe).

À l'arrêt de la simulation, l'aimant reprend sa place d'origine : le schéma n'est jamais modifié.

Un repère **absent**, ou un composant qui ne peut rien porter (seul le servo le peut pour l'instant), est signalé au lancement : message *« Aimant A1 : aucun composant « Act9 » sur lequel le fixer »*, cadre rouge autour de l'aimant, qui reste alors immobile.

## Simulation avec un capteur à effet Hall

- Dès qu'un aimant est sur la feuille, les capteurs Hall **n'affichent plus** leur aimant glissant de démonstration : ils ne voient que les vrais aimants.
- Le champ est **tout ou rien** : le capteur commute quand l'écart **bord à bord** entre l'aimant et la face du capteur est inférieur ou égal à sa distance de déclenchement (`trigger`, 10 mm par défaut). Un cercle vert pointillé sur le capteur montre qu'un aimant est à portée.
- Un seul aimant à portée suffit, qu'il soit fixé ou simplement posé.

## Utilisation

- Détecteur de position : un servo balaie de 0 à 180°, un capteur Hall posé en face d'une position précise signale le passage de l'aimant (`digitalRead(pin) == LOW`).
- Fin de course sans contact : l'aimant fixé sur le palonnier déclenche le capteur en bout de course.

---

*Composant maison Kablix.*
