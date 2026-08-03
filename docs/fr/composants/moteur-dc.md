# Moteur à courant continu

![Moteur à courant continu](../../img/composants/moteur-dc.webp)

Petit moteur à courant continu, avec son pignon de sortie. Il tourne d'autant
plus vite que la tension appliquée est élevée ; il se commande aussi en **PWM**.
Contrairement au ventilateur, il n'est **pas polarisé** : inverser ses deux fils
inverse simplement son sens de rotation.

## Broches

| Broche | Rôle |
|--------|------|
| **1** | Première borne |
| **2** | Seconde borne |

## Propriétés

| Propriété | Rôle | Défaut |
|-----------|------|--------|
| `voltage` | Tension nominale (V) | 5 |
| `current` | Courant à vide (A) | 0,2 |
| `angle` | Orientation (0/90/180/270°) | 0 |

## Simulation

- La vitesse suit la **tension** réellement appliquée : `voltage` = plein
  régime, la moitié = mi-régime.
- Physique **stricte** : le moteur est vu comme sa résistance à vide
  (`voltage` / `current`, soit 25 Ω pour un 5 V / 0,2 A). S'il demande plus de
  courant que la source ne peut en donner, il **ne démarre pas** — message
  *« L'alimentation ne peut pas fournir le courant du moteur »*.
- Sous **30 % de sa tension nominale**, il reste à l'arrêt : un vrai moteur
  ronfle sans tourner.
- Au-delà de **1,5 fois sa tension nominale**, il **grille** : explosion sur le
  schéma et message *« Surtension : le moteur a grillé »*. Arrêter puis
  relancer la simulation le remet à neuf.
- **Une broche de microcontrôleur ne suffit pas** : elle donne 40 mA au mieux,
  contre 200 mA demandés. Il faut passer par une alimentation externe, commandée
  par un transistor ou un MOSFET.
- **Diode de roue libre obligatoire** dès que le moteur est commandé par un
  transistor, **cathode vers le +**. Sans elle, c'est le **transistor** qui
  explose (message *« Une diode de roue libre est obligatoire »*) ; montée à
  l'envers, message *« Diode à l'envers »*. Un MOSFET dont le schéma interne
  porte déjà sa **diode de structure** (BS170, IRF530) en dispense.
- Chaque message **nomme le coupable** et **l'entoure d'un cadre rouge** sur le
  schéma, avec à côté une étiquette jaune sur fond rouge qui explique le
  problème. Le cadre disparaît quand le défaut est corrigé, et à l'arrêt de la
  simulation.

## Utilisation

- Montage type : broche MCU → résistance 1 kΩ → base d'un PN2222A ; émetteur à
  la masse ; collecteur sur la borne **2** du moteur ; borne **1** au + de
  l'alimentation ; diode entre la borne 1 (cathode) et la borne 2 (anode).
- Commande PWM : `analogWrite()` (Arduino) ou `PWM` (MicroPython) sur la broche
  de commande ; la vitesse suit le rapport cyclique.
- **Lecture de la vitesse à l'écran** : un moniteur ne montre qu'une image tous
  les 1/60 s. Au-delà de quelques tours par seconde, le pignon paraîtrait
  ralentir puis tourner à l'envers (l'effet « roue de charrette » des westerns).
  La rotation affichée est donc plafonnée juste avant ce décrochage, et au-dessus
  c'est le **flou du pignon** qui dit la vitesse — comme à l'œil nu sur un vrai
  moteur.

---

*Composant maison Kablix — dessin de Frank Sauret.*
