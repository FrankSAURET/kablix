# Capteur de température DS18B20

![Capteur de température DS18B20](ds18b20-etanche.webp)

Un thermomètre. Il ne rend pas une tension qu'il faudrait convertir : il rend **un nombre**, déjà en degrés. Et il le fait sur **un seul fil**, ce qui lui permet une chose que les autres capteurs ne savent pas faire — être plusieurs sur la même broche.

Il est logé dans un tube inox scellé au bout d'un câble. On peut le mettre : **dans l'eau**, dans la terre, dans un congélateur, dehors sous la pluie. C'est la sonde des aquariums, des chauffe-eau, des stations météo et des serres.

Mesure de **−55 à +125 °C**, à **±0,5 °C** près entre −10 et +85 °C.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il n'est pas dans la palette d'origine.

Il existe en deux versions, même puce et même programme : cette sonde étanche en inox au bout d'un câble et un [boîtier **TO-92**](ds18b20.md) nu.

## Broches

| Broche           | Rôle                                               |
| ---------------- | -------------------------------------------------- |
| **GND** (noir)   | Masse                                              |
| **Data** (jaune) | Le fil de données, à relier à une broche numérique |
| **VDD** (rouge)  | Alimentation, 3,3 V ou 5 V                         |

## Une résistance de tirage est obligatoire

Il faut une **résistance de 4,7 kΩ entre `Data` et `VDD`**. Sans elle, rien ne marche — et c'est de loin la première cause de « mon capteur renvoie −127 ».

## Ce qu'il faut savoir en plus

**La résistance de 4,7 kΩ entre `Data` et `VDD` reste obligatoire.** Beaucoup de sondes vendues « prêtes à brancher » l'ont déjà, cachée dans la gaine thermorétractable près des fils ou sur une petite carte fournie. Si la vôtre a quatre fils, ou un petit bloc à trois bornes, regardez avant d'en ajouter une deuxième.

**Le tube est étanche, pas les fils.** La partie inox va dans le liquide ; la partie avec les extrémités dénudées, non. Une sonde immergée jusqu'au bout du câble finit par prendre l'eau par capillarité.

**Le câble peut être long** — plusieurs mètres passent sans problème. Au-delà, ou avec un câble non blindé près d'un moteur, les mesures deviennent fantaisistes : on descend alors la résistance de tirage vers 2,2 kΩ.

**Elle est lente.** L'inox et l'air autour de la puce mettent du temps à prendre la température du milieu : comptez plusieurs secondes après l'immersion avant que la valeur se stabilise. Ce n'est pas un défaut de la puce, c'est la masse à chauffer ou refroidir.

## Plusieurs capteurs sur un seul fil

C'est l'intérêt du DS18B20. Chaque exemplaire sort d'usine avec une **adresse** unique gravée dedans, sur 64 bits. On peut donc en brancher cinq sur la même broche — `Data` avec `Data`, une seule résistance de 4,7 kΩ pour tout le monde — et les interroger un par un par leur adresse.

Le programme les trouve avec `search()`, qui rend les adresses une à une.

## Côté Arduino

Deux bibliothèques à installer : **OneWire** et **DallasTemperature**.

```cpp
#include <OneWire.h>
#include <DallasTemperature.h>

OneWire fil(2);                  // Data sur la broche 2
DallasTemperature capteurs(&fil);

void setup() {
  Serial.begin(9600);
  capteurs.begin();
}

void loop() {
  capteurs.requestTemperatures();            // demande la mesure
  float t = capteurs.getTempCByIndex(0);     // le premier capteur du fil
  Serial.println(t);
  delay(1000);
}
```

Si la lecture vaut **−127**, le capteur n'a pas répondu : vérifiez la résistance de 4,7 kΩ, l'alimentation, et le sens des pattes.

## Côté Pico (MicroPython)

Les deux modules sont déjà dans MicroPython, rien à installer.

```python
import machine, onewire, ds18x20, time

fil = onewire.OneWire(machine.Pin(2))
capteur = ds18x20.DS18X20(fil)
adresses = capteur.scan()          # les capteurs trouvés sur le fil

while True:
    capteur.convert_temp()         # demande la mesure
    time.sleep_ms(750)             # le temps qu'elle se fasse
    for a in adresses:
        print(capteur.read_temp(a))
    time.sleep(1)
```

Les `750 ms` ne sont pas une précaution : c'est le temps que met la puce à convertir en 12 bits. Lire avant, c'est lire la mesure précédente.

## Simulation

En simulation, le composant affiche un curseur **T°**, de −55 à +125 °C. Ce que vous y réglez est ce que le programme lit — le capteur répond pour de bon au protocole 1-Wire, adresse comprise, comme le ferait la puce. Bougez le curseur pendant que le programme tourne : la lecture suivante donne la nouvelle valeur.

### Curseur tout à gauche : « lecture ratée »

À **−55 °C pile**, un programme Arduino qui utilise **DallasTemperature** affiche « lecture ratée » (`DEVICE_DISCONNECTED_C`) au lieu de la température. Ce n'est pas un défaut de la simulation : cette bibliothèque se sert de −55 °C comme valeur sentinelle pour dire « capteur absent », si bien qu'elle confond la borne basse du capteur avec une panne. Un vrai DS18B20 à −55 °C donne exactement le même résultat.

Réglez le curseur sur **−54,5 °C** pour voir la lecture aboutir. En MicroPython (`ds18x20`), le problème ne se pose pas : −55 °C est lu comme n'importe quelle autre valeur.

---

*Dessin et fiche : Frank Sauret. Référence : [Analog Devices DS18B20](https://www.analog.com/en/products/ds18b20.html).*
