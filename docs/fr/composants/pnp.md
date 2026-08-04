# Transistor PNP (générique)

![Transistor PNP générique](../../img/composants/pnp.webp)

Prototype de transistor bipolaire **PNP** : tout s'inverse par rapport au NPN. L'émetteur va au **+** de l'alimentation, la charge est côté collecteur, et la commande se fait en **tirant la base vers le bas**.

## Broches

Les pattes s'appellent **1**, **2** et **3**, dans l'ordre du dessin — jamais E/B/C. Changer l'affectation des électrodes ne renomme donc aucune patte, et **aucun fil ne devient orphelin**.

| Broche | Rôle |
|--------|------|
| **1** | Première patte (émetteur par défaut) |
| **2** | Deuxième patte (base par défaut) |
| **3** | Troisième patte (collecteur par défaut) |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `pkg` | Boîtier du composant | TO-92 |
| `e` | Patte portant l'émetteur (1, 2 ou 3) | 1 |
| `b` | Patte portant la base (1, 2 ou 3) | 2 |
| `c` | Patte portant le collecteur (1, 2 ou 3) | 3 |
| `gain` | Gain en courant β (1 décimale) | 100 |
| `text` | Inscription du boîtier (une ligne par ligne saisie) | PNP |
| `vcemax` | Vce max (V) | 40 |
| `icmax` | Ic max (A) | 0,6 |

Une patte ne porte **qu'une** électrode : poser l'émetteur sur la patte déjà prise par le collecteur **échange** les deux.

## Simulation

- Conduit quand la **base est basse et l'émetteur haut** (l'émetteur au +).
- Courant transmis plafonné à **Gain × Ib**, comme le NPN.
- Monté en « interrupteur haut » (high-side) : il alimente une charge dont l'autre borne est à la masse.

## Utilisation

- Attention à la commande depuis une carte 5 V : une sortie à 0 V tire bien la base vers le bas, mais une sortie « haute » à 3,3 V ne bloque pas un PNP dont l'émetteur est à 5 V. Le NPN est plus simple pour débuter.
- Pour importer son propre dessin, passer par le **créateur de composant** (modèle de simulation « Transistor bipolaire »).

---

*Composant maison Kablix — dessin de Frank Sauret.*
