# Capteur de température LM35A

![Capteur de température LM35A](lm35a.webp)

Un thermomètre analogique. Il rend une **tension proportionnelle à la température** : **10 mV par °C**, soit 250 mV à 25 °C. Aucun étalonnage, aucun calcul compliqué : on lit la tension et on multiplie par 100.

Mesure de **−55 à +150 °C**, à **±0,5 °C** près à 25 °C.

> **Béta** — composant en cours de validation.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il n'est pas dans la palette d'origine.

## Broches

Vu de face, côté plat (inscription) tourné vers soi :

| Broche | Rôle |
| --- | --- |
| **Vs** | Alimentation, **4 V à 30 V** |
| **Vout** | Sortie analogique, 10 mV par °C |
| **GND** | Masse |

## Alimentation : 4 V minimum

Le LM35A ne démarre pas sous **4 V**. Le 3,3 V d'une carte ne suffit donc pas.

- **Arduino (Uno, Mega)** : le 5 V convient.
- **Raspberry Pi Pico** : ne pas utiliser **3V3**. Alimenter Vs par **VSYS** (5 V quand la carte est sur l'USB). La sortie reste en dessous de 1,5 V jusqu'à 150 °C : elle ne risque rien sur l'entrée ADC, limitée à 3,3 V.

## Températures positives seulement, ou aussi négatives

- **Entre Vs et GND** : la sortie ne descend pas sous 0 V. Le capteur ne donne que les **températures positives** (0 à 150 °C).
- **Entre Vs et −Vs**, avec une résistance de Vout vers −Vs : la sortie peut devenir négative, donc les **températures négatives** aussi (−55 à 0 °C). La résistance vaut **R = −Vs / 50 µA** : pour −Vs = −5 V, R = 100 kΩ.

## En simulation

Un curseur sur le composant règle la température de −55 à +150 °C. Sa sortie vaut `10 mV × T`.

Limites de la simulation :

- La sortie est **coupée à 0 V** : une température négative se lit comme 0 °C. Le simulateur n'a pas de tension négative, le montage Vs / −Vs n'est donc pas reproduit.
- L'alimentation n'est pas contrôlée : le capteur répond même sous 4 V. Respecter la règle ci-dessus, la vraie puce ne le ferait pas.

## Lire la température

Sur Arduino (Uno : 5 V, 1023 pas) :

```cpp
float volts = analogRead(A0) * 5.0 / 1023.0;
float degres = volts * 100.0;
```

Sur Pico (ADC 3,3 V, `read_u16` sur 65535) :

```python
volts = capteur.read_u16() * 3.3 / 65535
degres = volts * 100
```
