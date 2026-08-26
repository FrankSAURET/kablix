# Grove Shield (Uno)

![Grove Shield (Uno)](grove-uno.webp)

Une carte qui se pose **par-dessus l'Arduino Uno**. Elle ne calcule rien : elle
remplace les fils. À la place de piquer des fils un par un dans les rangées de
l'Uno, on branche un câble Grove à quatre fils dans une prise blanche, et c'est
câblé. Impossible de se tromper de sens : la prise ne rentre que d'un côté.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il
n'est pas dans la palette d'origine.

## La poser sur l'Uno

Attrapez la carte et amenez-la sur l'Uno : quand ses pattes tombent en face des
rangées, elles s'y aimantent et Kablix pose les 31 fils d'un coup. La carte
passe alors DEVANT l'Uno, comme dans la vraie vie, et déplacer l'Uno l'emmène
avec lui.

## L'interrupteur 3,3 V / 5 V

En bas à gauche de la carte, un petit interrupteur choisit la tension envoyée
dans le fil rouge de **toutes** les prises Grove. Cliquez dessus : le bouton
glisse d'un cran et le réglage est gardé avec le schéma.

- **5 V** (position de départ) : ce qu'attendent la plupart des modules Grove.
- **3,3 V** : pour les modules qui ne supportent pas le 5 V.

Attention, l'interrupteur ne change QUE l'alimentation. Les fils de signal, eux,
restent en 5 V puisqu'ils viennent de l'Uno.

## Les prises et les pattes de l'Uno

Chaque prise porte deux fils de signal. Le nom de la prise est celui de son
premier signal ; le second est la patte juste au-dessus. Deux prises voisines
partagent donc toujours une patte : **D4** utilise 4 et 5, **D5** utilise 5 et
6 — brancher deux modules côte à côte fait travailler la patte 5 pour les deux.

| Prise | Fil 1 | Fil 2 | Pattes de l'Uno |
|-------|-------|-------|-----------------|
| **D2** | D2 | D3 | 2 et 3 |
| **D3** | D3 | D4 | 3 et 4 |
| **D4** | D4 | D5 | 4 et 5 |
| **D5** | D5 | D6 | 5 et 6 |
| **D6** | D6 | D7 | 6 et 7 |
| **D7** | D7 | D8 | 7 et 8 |
| **D8** | D8 | D9 | 8 et 9 |
| **A0** | A0 | A1 | A0 et A1 |
| **A1** | A1 | A2 | A1 et A2 |
| **A2** | A2 | A3 | A2 et A3 |
| **A3** | A3 | A4 | A3 et A4 |
| **UART** | TX | RX | 1 et 0 |
| **I2C0** à **I2C3** | SDA | SCL | A4 et A5 |

Les quatre prises **I2C** sont câblées en parallèle : c'est le même fil pour les
quatre. C'est normal — le bus I²C accepte plusieurs modules sur les deux mêmes
fils, à condition qu'ils aient chacun une adresse différente.

Deux pièges à connaître :

- la prise **A3** et les prises **I2C** se partagent A4 (SDA). Un module I²C et
  un capteur analogique en A3 ne peuvent pas travailler ensemble ;
- la prise **UART** est branchée sur les pattes 0 et 1, celles qui servent aussi
  au câble USB. Un module qui parle sur cette prise brouille le moniteur série.

Passez la souris sur une pastille : Kablix écrit dessus la patte réelle de
l'Uno. `I2C0.SDA.A4` veut dire « le fil SDA de la prise I2C0 arrive sur A4 » —
c'est **A4** qu'il faut écrire dans le programme.

## Ce que la carte ne fait pas

Le bouton **RESET** et la petite LED de la carte ne sont pas simulés : ils sont
particuliers et Kablix les laisse de côté. Tout le reste — prises, rails
d'alimentation, interrupteur — fonctionne.
