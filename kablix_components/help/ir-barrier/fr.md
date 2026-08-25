# Barrière optique infrarouge

![Barrière optique infrarouge](ir-barrier.webp)

Deux boîtiers qui se regardent. Celui de droite envoie un faisceau infrarouge —
invisible à l'œil — celui de gauche le reçoit. Tant que la lumière arrive, la
barrière dit « rien ne passe ». Dès qu'un objet coupe le faisceau, elle le dit
aussi. C'est le capteur des portails, des ascenseurs et des compteurs de pièces.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il
n'est pas dans la palette d'origine.

## Broches

| Broche | Rôle |
|--------|------|
| **Vcc.e** (rouge, émetteur) | Alimentation de l'émetteur, 5 V |
| **GND.e** (noir, émetteur) | Masse de l'émetteur |
| **Vcc.r** (rouge, récepteur) | Alimentation du récepteur, 5 V |
| **GND.r** (noir, récepteur) | Masse du récepteur |
| **Out** (jaune, récepteur) | Sortie, à relier à une broche numérique |

Les **deux** boîtiers doivent être alimentés. L'émetteur sans courant n'éclaire
rien : le récepteur croit alors qu'un obstacle est là en permanence.

## Une résistance de rappel est obligatoire

La sortie est à **collecteur ouvert** : dedans, il n'y a qu'un interrupteur vers
la masse. Elle sait tirer le fil VERS LE BAS, jamais vers le haut. Toute seule,
elle reste donc à 0 quoi qu'il arrive.

Il faut quelqu'un pour la remonter. Deux façons :

- une **résistance de 10 kΩ** entre `Out` et le 5 V (le « rappel au plus ») ;
- ou le rappel **interne** de la carte, allumé par le programme :
  `pinMode(2, INPUT_PULLUP)` côté Arduino, `Pin(2, Pin.IN, Pin.PULL_UP)` côté
  Pico.

Sans l'un des deux, Kablix encadre le composant en rouge et le dit. Et surtout,
ne branchez jamais `Out` directement sur le 5 V sans résistance : au moment où
le capteur tire, c'est l'alimentation qui est mise en court-circuit.

## Ce que vaut la sortie

| Faisceau | Transistor de sortie | `Out` |
|----------|----------------------|-------|
| Passe (rien entre les deux boîtiers) | conduit, il tire à la masse | **0** |
| Coupé (un objet est là) | bloqué, le rappel remonte le fil | **1** |

La sortie est donc **active à l'état haut** quand un objet passe. Un
`digitalRead()` qui renvoie 1 = obstacle.

## Simulation

En simulation, le composant affiche une case **Obstacle**. Cochée, la barre
jaune monte entre les deux boîtiers et coupe le faisceau : `Out` passe à 1.
Décochée, la barre redescend, la lumière repasse, `Out` retombe à 0.

Kablix vérifie le câblage : alimentation des deux boîtiers, présence d'un rappel
au plus (externe ou interne), et absence de court-circuit sur la sortie. Chaque
défaut est nommé.

---

*Dessin et fiche : Frank Sauret. Référence : [DFRobot SEN0499](https://www.dfrobot.com/product-2388.html).*
