# Transistor

![Transistor](../../img/composants/transistor.webp)

Transistor bipolaire en boîtier TO-92. En Kablix il sert d'**interrupteur
commandé** : un petit courant de base laisse passer un courant de collecteur
bien plus grand, dans le rapport du **gain** du modèle.

La bibliothèque n'a qu'un seul « Transistor » : le **modèle se choisit dans les
propriétés**, parmi une liste qui se réduit au fur et à mesure des critères.

## Choisir son modèle

À la pose, l'inspecteur affiche le **sélecteur** :

| Critère | Effet |
|---------|-------|
| **Type** | NPN ou PNP |
| **Boîtier** | TO-92 (d'autres viendront) |
| **Ic max d'au moins** | ne garde que les modèles capables de ce courant |
| **Vce max d'au moins** | ne garde que les modèles tenant cette tension |
| **Gain d'au moins** | ne garde que les modèles d'au moins ce gain |

En dessous, la liste des **modèles correspondants** : un clic pose la référence
et l'inspecteur revient à l'affichage normal. Le bouton
**Changer de transistor…** rouvre le sélecteur à tout moment.

Modèles proposés : PN2222A, 2N3904, 2N4401, 2N5551, BC337, S8050, BC547, BC548
(NPN) ; 2N2907A, 2N3906, 2N4403, 2N5401, BC327, S8550, BC557, BC558 (PNP).

Le dernier choix de la liste est toujours **NPN personnalisé** (ou **PNP
personnalisé**) : les critères déjà demandés y sont pré-remplis, et **tout reste
réglable** ensuite — gain, Vce max, Ic max, inscription du boîtier, affectation
des électrodes.

## Broches

| Broche | Rôle |
|--------|------|
| **E** | Émetteur — à la masse dans le montage NPN classique |
| **B** | Base — commande, TOUJOURS derrière une résistance |
| **C** | Collecteur — la charge à commander (relais, moteur, LED) |

Les noms de broches ne changent **jamais**, quel que soit le modèle : changer de
référence ne laisse donc aucun fil orphelin. Ce qui change, c'est la **patte
physique** qui porte chaque électrode — la famille BC5xx est câblée C-B-E là où
les 2Nxxxx sont E-B-C, vues de face plate. L'inspecteur rappelle ce brochage
sous les caractéristiques, et le fil suit son électrode.

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `ref` | Modèle choisi | *(vide : sélecteur ouvert)* |
| `gain` | Gain en courant (β) — modèle personnalisé | 100 |
| `vcemax` | Vce max (V) — modèle personnalisé | 40 |
| `icmax` | Ic max (A) — modèle personnalisé | 0,6 |
| `text` | Inscription du boîtier — modèle personnalisé | NPN |
| `e` / `b` / `c` | Patte portant chaque électrode — modèle personnalisé | 1 / 2 / 3 |
| `angle` | Orientation (0/90/180/270°) | 0 |

Sur une référence du commerce, ces valeurs viennent de la fiche du fabricant et
ne sont pas modifiables : passer par le **modèle personnalisé** pour les régler.

## Simulation

- Un NPN conduit quand la **base est haute et l'émetteur bas** ; un PNP, quand la
  base est basse et l'émetteur haut.
- Le courant transmis est plafonné à **Gain × Ib** : c'est tout le modèle. On
  vise donc la **saturation** — si le montage aval demande plus, il ne
  fonctionne pas (le ventilateur ne démarre pas, le relais ne colle pas).
- Vbe = 0,7 V, Vce(sat) = 0,2 V. Une base câblée **sans résistance** sature à
  coup sûr… et ferait chauffer un vrai transistor : mettre une résistance.

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
