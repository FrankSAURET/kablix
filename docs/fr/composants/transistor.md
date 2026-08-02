# Transistor

![Transistor](../../img/composants/transistor.webp)

Transistor en boîtier TO-92 ou TO-220. En Kablix il sert d'**interrupteur
commandé** : un petit courant de base laisse passer un courant de collecteur
bien plus grand, dans le rapport du **gain** du modèle. Un MOSFET, lui, se
commande en **tension** : sa grille est isolée et ne consomme rien.

La bibliothèque n'a qu'un seul « Transistor » : le **modèle se choisit dans les
propriétés**, parmi une liste qui se réduit au fur et à mesure des critères.

## Choisir son modèle

À la pose, l'inspecteur affiche le **sélecteur** :

| Critère | Effet |
|---------|-------|
| **Type** | NPN, PNP, Darlington NPN, Darlington PNP, MOSFET canal N |
| **Boîtier** | TO-92 ou TO-220 |
| **Ic max d'au moins** (**Id max** sur un MOSFET) | ne garde que les modèles capables de ce courant |
| **Vce max d'au moins** (**Vds max** sur un MOSFET) | ne garde que les modèles tenant cette tension |
| **Gain d'au moins** | ne garde que les modèles d'au moins ce gain — bipolaires |
| **Rds(on) d'au plus** | ne garde que les modèles descendant sous cette résistance — MOSFET |

Les deux derniers critères ne se croisent jamais : un MOSFET n'a pas de gain, un
bipolaire pas de Rds(on). Le sélecteur n'affiche donc que celui de la famille
choisie.

En dessous, la liste des **modèles correspondants** : un clic pose la référence
et l'inspecteur revient à l'affichage normal. Le bouton
**Changer de transistor…** rouvre le sélecteur à tout moment. Les **derniers
modèles ajoutés** y apparaissent **en bleu**.

| Famille | Modèles |
|---------|---------|
| NPN | PN2222A, 2N3904, 2N4401, 2N5551, BC337, S8050, BC547, BC548, BC639, MPSA42, BD911 |
| PNP | 2N2907A, 2N3906, 2N4403, 2N5401, BC327, S8550, BC557, BC558, BC640, MPSA92, BD912 |
| Darlington NPN | BC517 |
| Darlington PNP | BC516 |
| MOSFET canal N | BS170, IRF530 |

BD911, BD912 et IRF530 sont en **TO-220** : boîtier de puissance, jusqu'à 15 A.

Le dernier choix de la liste est toujours le **modèle personnalisé** de la
famille demandée (« NPN personnalisé », « MOSFET canal N personnalisé »…) : les
critères déjà demandés y sont pré-remplis, et **tout reste réglable** ensuite —
gain ou Rds(on), tension et courant maximaux, inscription du boîtier,
affectation des électrodes.

## Broches

Un bipolaire (NPN, PNP, Darlington) porte E, B et C :

| Broche | Rôle |
|--------|------|
| **E** | Émetteur — à la masse dans le montage NPN classique |
| **B** | Base — commande, TOUJOURS derrière une résistance |
| **C** | Collecteur — la charge à commander (relais, moteur, LED) |

Un MOSFET porte G, D et S :

| Broche | Rôle |
|--------|------|
| **G** | Grille — commande en tension, isolée : aucun courant n'y entre |
| **D** | Drain — la charge à commander |
| **S** | Source — à la masse sur un canal N |

Les noms de broches ne changent **jamais** au sein d'une famille : changer de
référence ne laisse donc aucun fil orphelin. Ce qui change, c'est la **patte
physique** qui porte chaque électrode — la famille BC5xx est câblée C-B-E là où
les 2Nxxxx sont E-B-C, et un BD911 est B-C-E, vus de face plate. L'inspecteur
rappelle ce brochage sous les caractéristiques, et le fil suit son électrode.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `ref` | Modèle choisi | *(vide : sélecteur ouvert)* |
| `pkg` | Boîtier — TO-92 ou TO-220 | to92 |
| `gain` | Gain en courant (β) — bipolaire personnalisé | 100 |
| `rdson` | Rds(on) (Ω) — MOSFET personnalisé | 0,5 |
| `vcemax` | Vce max (Vds max sur un MOSFET), en V — modèle personnalisé | 40 |
| `icmax` | Ic max (Id max sur un MOSFET), en A — modèle personnalisé | 0,6 |
| `text` | Inscription du boîtier — modèle personnalisé | NPN |
| `e` / `b` / `c` | Patte portant chaque électrode — bipolaire personnalisé | 1 / 2 / 3 |
| `g` / `d` / `s` | Patte portant chaque électrode — MOSFET personnalisé | 1 / 2 / 3 |
| `angle` | Orientation (0/90/180/270°) | 0 |

Sur une référence du commerce, ces valeurs viennent de la fiche du fabricant et
ne sont pas modifiables : passer par le **modèle personnalisé** pour les régler.

## Simulation

- Un NPN conduit quand la **base est haute et l'émetteur bas** ; un PNP, quand la
  base est basse et l'émetteur haut. Un MOSFET canal N conduit comme un NPN :
  grille haute, source basse.
- Le courant transmis est plafonné à **Gain × Ib** : c'est tout le modèle. On
  vise donc la **saturation** — si le montage aval demande plus, il ne
  fonctionne pas (le ventilateur ne démarre pas, le relais ne colle pas).
- Vbe = 0,7 V, Vce(sat) = 0,2 V. Une base câblée **sans résistance** sature à
  coup sûr… et ferait chauffer un vrai transistor : mettre une résistance.
- **Darlington** : deux jonctions en série, donc **Vbe = 1,4 V** et
  **Vce(sat) = 0,9 V**. Son gain énorme (30 000) fait qu'un courant de base
  minuscule suffit — c'est tout son intérêt.
- **MOSFET** : la grille étant isolée, il n'y a **ni courant de base ni gain**.
  La tension suffit à ouvrir le canal, qui laisse alors passer jusqu'à son
  **Id max**. Une résistance de grille n'est donc pas nécessaire au
  fonctionnement (elle sert à amortir, sur un vrai montage).

## Utilisation

- Calcul type : pour commander une bobine de relais de 40 mA avec un gain de 35,
  il faut Ib ≥ 40 / 35 ≈ 1,2 mA. Sous 5 V, une résistance de base de 1 kΩ donne
  (5 − 0,7) / 1000 ≈ 4,3 mA : largement saturé.
- Résistance de base trop forte (100 kΩ) → Ib = 43 µA → Ic max ≈ 1,5 mA : la
  charge ne démarre pas. C'est l'erreur classique à voir en simulation.
- Avec un relais, la **diode de roue libre est obligatoire** (cathode vers le +) :
  sans elle, la surtension de coupure détruirait le transistor.

---

*Composant maison Kablix — dessin de Frank Sauret.*
