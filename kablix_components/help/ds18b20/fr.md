# Capteur de température DS18B20

![Capteur de température DS18B20](ds18b20.webp)

Un thermomètre. Il ne rend pas une tension qu'il faudrait convertir : il rend **un nombre**, déjà en degrés. Et il le fait sur **un seul fil**, ce qui lui permet une chose que les autres capteurs ne savent pas faire — être plusieurs sur la même broche.

Mesure de **−55 à +125 °C**, à **±0,5 °C** près entre −10 et +85 °C.

Composant de bibliothèque : il s'installe par le gestionnaire de composants, il n'est pas dans la palette d'origine.

Il existe en deux versions, même puce et même programme : ce boîtier **TO-92** nu, et une [sonde étanche](ds18b20-etanche.md) en inox au bout d'un câble.

## Broches

| Broche           | Rôle                                               |
| ---------------- | -------------------------------------------------- |
| **GND** (noir)   | Masse                                              |
| **Data** (jaune) | Le fil de données, à relier à une broche numérique |
| **VDD** (rouge)  | Alimentation, 3,3 V ou 5 V                         |

Attention au sens : les trois pattes sortent du même côté, et les inverser chauffe le composant pour de bon. Méplat vers soi, pattes vers le bas, on lit **GND – Data – VDD** de gauche à droite.

## Une résistance de tirage est obligatoire

Il faut une **résistance de 4,7 kΩ entre `Data` et `VDD`**. Sans elle, rien ne marche — et c'est de loin la première cause de « mon capteur renvoie −127 ».

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
