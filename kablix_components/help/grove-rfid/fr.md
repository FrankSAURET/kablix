# Lecteur RFID Grove 125 kHz

![Lecteur RFID Grove 125 kHz](grove-rfid.webp)

Une carte qui lit les badges sans les toucher. La grande boucle de fil, en bas,
fabrique un champ invisible. Quand un badge entre dedans, il y puise juste assez
d'énergie pour se réveiller — il n'a **pas de pile** — et il récite son numéro.
La carte écoute, et redit ce numéro au microcontrôleur. C'est le lecteur des
badges d'immeuble et des cartes de cantine.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il
n'est pas dans la palette d'origine.

## Broches

C'est une prise Grove à quatre fils :

| Broche | Rôle |
|--------|------|
| **GND** (noir) | Masse |
| **VCC** (rouge) | Alimentation, 3,3 V ou 5 V |
| **Rx** | Entrée du module — sert de **DATA1** en mode Wiegand |
| **Tx** | Sortie du module — le numéro, ou **DATA0** en mode Wiegand |

Le module **parle**, il n'attend pas qu'on lui demande. Ses deux fils de données
vont donc sur des **entrées** de la carte.

## Le cavalier : deux langues

Le petit cavalier, en haut à gauche, choisit comment la carte raconte le numéro.
Cliquez dessus pour le déplacer.

**À gauche — UART.** Le numéro part en clair sur **Tx**, comme un texte, à
**9600 bauds**, suivi d'un retour à la ligne. Un seul fil suffit. Côté Arduino,
une liaison série logicielle le lit :

```c
#include <SoftwareSerial.h>
SoftwareSerial rfid(2, 3);   // 2 = Rx de l'Arduino, relié au Tx du module

void setup() { Serial.begin(9600); rfid.begin(9600); }
void loop() {
  if (rfid.available()) Serial.write(rfid.read());
}
```

**À droite — Wiegand.** Le numéro part en **impulsions** sur deux fils, **Tx** =
DATA0 et **Rx** = DATA1. Les deux fils restent hauts au repos ; un **0** est une
courte descente sur DATA0, un **1** une courte descente sur DATA1 — 50 µs
chacune, 2 ms entre deux. Il y a **26 impulsions**, du bit de poids fort au bit
de poids faible. On les compte avec des interruptions :

```c
volatile unsigned long mot = 0;
volatile int nb = 0;
void zero() { mot = (mot << 1);     nb++; }
void un()   { mot = (mot << 1) | 1; nb++; }

void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP); pinMode(3, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), zero, FALLING);
  attachInterrupt(digitalPinToInterrupt(3), un,   FALLING);
}
void loop() {
  if (nb >= 26) { Serial.println(mot, HEX); nb = 0; mot = 0; }
}
```

Le Wiegand marche partout. L'UART, lui, demande une liaison série côté carte :
sur Arduino, une liaison **logicielle** convient, et c'est elle qui lit le fil.
**Sur une Pico, choisissez le Wiegand** : la liaison série matérielle de la puce
n'écoute pas les broches en simulation, le mode UART y resterait muet.

## Simulation

La **flèche** verte et bleue, sous la boucle, déplace le badge. Cliquez : le
badge glisse dans la boucle et la flèche se retourne. Cliquez encore : il
ressort.

Tant que le badge est **dans la boucle**, le module redit son numéro **une fois
par seconde**, exactement comme le vrai. Le numéro envoyé s'affiche dans la
petite fenêtre **CodeRFID** du dessin. Il est tiré au sort parmi trois badges,
comme si vous en aviez trois dans la poche :

| Cavalier | Badges |
|----------|--------|
| UART | `0F0034AB12` · `0F00A17C45` · `0F0059D3E8` |
| Wiegand | `1A34B12` · `0C71D9E` · `23F80A5` |

Badge sorti de la boucle, la fenêtre se vide et les fils redeviennent muets.

Le cavalier se change **pendant** la simulation : le montage se relit tout seul,
sans arrêter le programme.

## Attention

- Le vrai module ajoute autour du numéro deux caractères de repérage et une
  somme de contrôle. Ici le numéro part seul, suivi d'un retour à la ligne :
  c'est plus simple à lire pour apprendre, mais un programme écrit pour le vrai
  module cherchera ces caractères en plus.
- Ces badges-là sont en **lecture seule** et leur numéro se recopie sans peine :
  c'est bon pour ouvrir un tiroir, pas pour garder un secret.
- Un badge ne se lit qu'à quelques centimètres de la boucle, et le métal juste
  derrière la boucle gêne la lecture.
- Sur Arduino, seules les broches **2** et **3** savent réveiller le programme
  par interruption : c'est là qu'il faut brancher les deux fils Wiegand.

---

*Dessin et fiche : Frank Sauret. Référence : [Grove - 125KHz RFID Reader](https://wiki.seeedstudio.com/Grove-125KHz_RFID_Reader/).*
