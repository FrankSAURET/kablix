# Transistor NPN (générique)

![Transistor NPN générique](../../img/composants/npn.webp)

Prototype de transistor bipolaire **NPN** : le boîtier, l'inscription, le gain et le brochage se règlent dans les propriétés. À utiliser pour tout modèle qui n'a pas encore sa fiche dédiée (BC547, 2N3904, S8050…).

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
| `text` | Inscription du boîtier (une ligne par ligne saisie) | NPN |
| `vcemax` | Vce max (V) | 40 |
| `icmax` | Ic max (A) | 0,6 |

Une patte ne porte **qu'une** électrode : poser l'émetteur sur la patte déjà prise par le collecteur **échange** les deux.

## Simulation

- Conduit quand la **base est haute et l'émetteur bas**.
- Courant transmis plafonné à **Gain × Ib** : on vise la saturation, sinon le montage aval ne fonctionne pas.
- Le brochage réel dépend du modèle : sur un BC547 vu de face, c'est C-B-E (1-2-3), sur un 2N2222 en TO-92 c'est E-B-C. C'est justement le rôle des propriétés `e`, `b`, `c`.

## Utilisation

- Écrire la référence sur le boîtier avec `text` : une ligne par ligne saisie (« BC » puis « 547 » donne deux lignes sur le composant).
- Pour importer son propre dessin, passer par le **créateur de composant** (modèle de simulation « Transistor bipolaire »).

---

*Composant maison Kablix — dessin de Frank Sauret.*
