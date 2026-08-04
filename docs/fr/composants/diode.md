# Diode

![Diode](../../img/composants/diode.webp)

Diode de redressement. Elle ne laisse passer le courant que de l'anode **A** vers la cathode **K**, en perdant au passage sa tension de seuil.

## Broches

| Broche | Rôle |
|--------|------|
| **A** | Anode (+) — l'anneau du dessin est du côté opposé |
| **K** | Cathode (−) — repérée par l'anneau |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `vf` | Tension de seuil (V) | 0,6 |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Utilisation

- Polarisée : dans le sens K → A, elle bloque. Une LED en série derrière une diode montée à l'envers ne s'allume jamais — c'est le test le plus simple.
- Dans le sens passant, la tension utile en aval est diminuée de `vf` (0,6 V pour une diode silicium, 0,3 V pour une Schottky).
- Sert à protéger une entrée contre une inversion de polarité, ou à écrêter la surtension d'une bobine (relais, moteur) en la montant en roue libre.

---

*Composant maison Kablix — dessin de Frank Sauret.*
