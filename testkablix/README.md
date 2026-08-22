# testkablix — tests manuels par composant

Un test = un programme + un projet `.projix` (schéma câblé prêt à simuler).

- **Sketchs Arduino (`.ino`)** : rangés sous **`Arduino/`**, un dossier par
  sketch (convention arduino-cli) — `Arduino/<nom>/<nom>.ino` et son `.projix`
  dans le même dossier.
- **Scripts MicroPython (`.py`)** : à la racine, le `.projix` porte le même nom.
- **Cartes Pico 2 / Pico 2 W** : rangées à part sous **`pico2/`**, le temps que
  la puce RP2350 fasse ses preuves. Les deux `blink` y ont leur propre `.py` ;
  les autres n'ont **qu'un `.projix`** — ils rejouent le programme de leur aîné
  Pico (voir « Jumeaux Pico 2 » plus bas).

Aucun script ne code ces emplacements en dur : `_paths.mjs` retrouve un fichier
de test où qu'il soit rangé (racine puis sous-dossiers). Déplacer un test ne
casse donc ni la génération ni les vérifications.

## Utilisation

1. Ouvrir le simulateur Kablix (icône de la barre d'activité).
2. `📂 Ouvrir` → choisir le `.projix` du test : le schéma, la carte **et le
   fichier de code** sont restaurés (le workspace doit être la racine du dépôt
   pour que la référence au fichier de code se résolve).
3. `▶ Démarrer` : compile et exécute le programme du test.
4. Agir sur le composant (curseur, bouton, survol…) et observer le moniteur série.

## Couverture

Chaque carte de dev a son projix : `blink-uno`, `blink-nano`, `blink-mega`,
`blink-pico`, `blink-picow`, `blink-pico2`, `blink-pico2w` (LED embarquée). Les
deux derniers portent la puce **RP2350** (Cortex-M33) : le code est le même que
sur une Pico, seul `machine.freq()` change (150 MHz au lieu de 125).

Chaque composant du catalogue a deux tests : `<composant>-uno` (Arduino, C) et
`<composant>-pico` (MicroPython) — sauf le HC-SR04, simulé sur AVR uniquement, et
les quelques doublons marqués « (retiré) » dans le tableau, dont le montage
n'apprenait rien de plus qu'un autre déjà présent : bouton 6 mm (les deux
cartes), résistance seule, servomoteur côté Pico, résistances variables côté
Uno. La colonne « Observable » dit par quoi chacun reste couvert.

### Jumeaux Pico 2

Chaque test Pico a son jumeau RP2350 sous `pico2/` — même montage, même
programme, l'autre puce. Trois choses à savoir avant d'y toucher :

- **Le programme est PARTAGÉ, pas recopié.** Le `.projix` du jumeau référence le
  `.py` de son aîné (champ `codeFrom` de la spec) : corriger le programme corrige
  les deux tests, et aucune copie ne peut dériver.
- **Le montage vient du `.projix` de l'aîné**, pas de la spec — c'est le banc que
  Frank a redisposé à la main qui fait foi. La Pico 2 étant dessinée en
  **portrait** (90 × 220) là où la Pico est en paysage (208 × 83), le montage est
  translaté **en bloc** à droite de la carte : distances, alignements et angles
  sont conservés.
- **Les fils sont autoroutés une fois pour toutes.** Les points de passage de
  l'aîné contournaient une carte paysage ; ils traverseraient la carte portrait.
  Le tracé de remplacement est calculé par l'autoroutage du vrai éditeur et
  versionné dans `pico2/_routage.json` :

      node scripts/_router-jumeaux-pico2.mjs            (tous les jumeaux)
      node scripts/_router-jumeaux-pico2.mjs led-pico2  (ceux-là seulement)

  À relancer après tout déplacement de composant dans un banc Pico, sinon les
  fils du jumeau repartent en diagonale.

Le robot araignée n'a pas de jumeau : sa Pico W est **dans** le châssis, il n'y
a pas de carte à remplacer.

| Composant | Test Uno | Test Pico | Test Pico 2 | Observable |
|---|---|---|---|---|
| LED (+ résistance) | `led-uno` | `led-pico` | `led-pico2` | clignote 1 Hz |
| LED RGB | `rgb-led-uno` | `rgb-led-pico` | `rgb-led-pico2` | fondu R, V, B puis blanc |
| Bouton poussoir | `button-uno` | `button-pico` | `button-pico2` | appui → « APPUYE » + LED |
| Bouton 6 mm | — (retiré) | — (retiré) | — | couvert par `npm run verify:button-latch`, qui éprouve les DEUX poussoirs (souris, clavier, capuchon enfoncé, maintien Ctrl) |
| Résistance | — (retiré) | — | — | en série dans la moitié des autres montages |
| Diode | `diode-uno` | `diode-pico` | `diode-pico2` | passante / à l'envers = bloquée |
| Condensateurs | `condo-uno` | `condo-pico` | `condo-pico2` | 3 branches RC en parallèle (film 0,1 s, tantale 0,33 s, chimique 1 s) lues sur 3 ADC |
| Transistor (sélecteur) | `transistor-uno` | `transistor-pico` | `transistor-pico2` | Une branche par famille — BC547 vs 2N3904 (à montage égal, le gain décide), BC557 (PNP) côté haut, BC517 (darlington) sur 100 kΩ, BS170 (MOSFET) grille directe |
| Transistor PN2222A | `pn2222a-uno` | `pn2222a-pico` | `pn2222a-pico2` | saturé = ventilateur tourne |
| Transistor NPN (proto) | `npn-uno` | `npn-pico` | `npn-pico2` | commande côté bas d'une LED |
| Transistor PNP (proto) | `pnp-uno` | `pnp-pico` | `pnp-pico2` | commande côté haut (logique inversée) |
| Relais OMRON G5V | `relais-uno` | `relais-pico` | `relais-pico2` | seul le relais bien câblé colle |
| Batterie externe (Power bank) | `powerbank-uno` | `powerbank-pico` | `powerbank-pico2` | alimente un PCA9685 + servo, LED de jauge allumées en simulation |
| Patte d'araignée (placeholder) | `patte-uno` | `patte-pico` | `patte-pico2` | 2 articulations (coxa, patella) sur 2 canaux PCA9685 indépendants |
| Robot araignée | — | `araignee-pico` | — | Robot SEUL, sans un fil : il porte sa Pico W (carte `picow`) et son PCA9685 à 0x7F pilote ses 8 articulations. Pas de test Arduino — le robot EST la carte |
| Buzzer | `buzzer-uno` | `buzzer-pico` | `buzzer-pico2` | halo actif + tone/PWM |
| Potentiomètre | `pot-uno` | `pot-pico` | `pot-pico2` | valeur suit le curseur |
| Potentiomètre à glissière | `slide-pot-uno` | `slide-pot-pico` | `slide-pot-pico2` | idem |
| Potentiomètre ajustable | `pot-rot2-uno` | `pot-rot2-pico` | `pot-rot2-pico2` | vis tournée à la souris ; boîtier de 100 kΩ, donc « 104 » écrit dessus |
| Afficheur 7 segments | `7seg-uno` | `7seg-pico` | `7seg-pico2` | compte 0→9 |
| Barre de 10 LED | `led-bar-uno` | `led-bar-pico` | `led-bar-pico2` | vumètre monte/descend |
| Interrupteur à glissière | `slide-switch-uno` | `slide-switch-pico` | `slide-switch-pico2` | position 1/3 |
| DIP switch ×8 | `dip-switch-uno` | `dip-switch-pico` | `dip-switch-pico2` | 8 canaux 0/1 |
| Joystick analogique | `joystick-uno` | `joystick-pico` | `joystick-pico2` | X/Y + bouton |
| Capteur de lumière (LDR) | `photoresistor-uno` | `photoresistor-pico` | `photoresistor-pico2` | AO + DO (actif bas) |
| Capteur PIR | `pir-uno` | `pir-pico` | `pir-pico2` | survol = mouvement |
| Capteur d'inclinaison | `tilt-uno` | `tilt-pico` | `tilt-pico2` | clic maintenu = incliné |
| Capteur à effet Hall | `hall-uno` | `hall-pico` | `hall-pico2` | aimant glissé = sortie basse ; rappel externe 10 kΩ (Uno) ou interne (Pico) |
| Servomoteur | `servo-uno` | — (retiré) | — | 0° / 90° / 180° ; côté Pico, 16 servos et leur alim sont éprouvés par `powerbank-pico` et `patte-pico` |
| LCD 16×2 I²C | `lcd-uno` | `lcd-pico` | `lcd-pico2` | texte + compteur |
| OLED SSD1306 I²C | `oled-ssd1306-uno` | `oled-ssd1306-pico` | `oled-ssd1306-pico2` | cadre + dessin |
| TFT ILI9341 SPI | `ili9341-uno` | `ili9341-pico` | `ili9341-pico2` | aplats de couleur |
| Carte microSD SPI | `microsd-uno` | `microsd-pico` | `microsd-pico2` | init OK (pas de FAT) |
| NeoPixel (1 px) | `neopixel-uno` | `neopixel-pico` | `neopixel-pico2` | rouge/vert/bleu |
| Matrice NeoPixel 8×8 | `neopixel-matrix-uno` | `neopixel-matrix-pico` | `neopixel-matrix-pico2` | diagonale + dégradé |
| Anneau NeoPixel 16 | `led-ring-uno` | `led-ring-pico` | `led-ring-pico2` | chenillard bleu |
| Température NTC | `ntc-temp-uno` | `ntc-temp-pico` | `ntc-temp-pico2` | valeur suit le curseur |
| Résistances variables LDR + CTN + CTP | — (retiré) | `rv-pico` | `rv-pico2` | trois ponts diviseurs lus d'un coup ; éclairer la LDR ou chauffer la CTN fait monter la lecture, chauffer la CTP la fait descendre |
| Capteur de gaz (MQ) | `gas-sensor-uno` | `gas-sensor-pico` | `gas-sensor-pico2` | AOUT + DOUT |
| Capteur de pouls | `heartbeat-uno` | `heartbeat-pico` | `heartbeat-pico2` | signal qui bat |
| Capteur de flamme | `flame-uno` | `flame-pico` | `flame-pico2` | AOUT + DOUT |
| Capteur de son | `sound-uno` | `sound-pico` | `sound-pico2` | AOUT + DOUT |
| HC-SR04 (ultrason) | `hcsr04-uno` | — (AVR seulement) | — | distance en cm |
| Ventilateur | `ventilo-uno` | `ventilo-pico` | `ventilo-pico2` | tourne sur l'alim, cale sur une broche |
| Moteur à courant continu | `moteur-dc-uno` | `moteur-dc-pico` | `moteur-dc-pico2` | tourne avec sa diode, cale sur une broche, transistor détruit sans roue libre |
| DHT22 (temp/humidité) | `dht22-uno` | `dht22-pico` | `dht22-pico2` | T + H toutes les 2 s |
| DHT11 (temp/humidité) | `dht11-uno` | `dht11-pico` | `dht11-pico2` | valeurs entières, 1 lecture/s |
| Clavier matriciel 4×4 | `keypad-uno` | `keypad-pico` | `keypad-pico2` | touche affichée |
| CI logiques : ET et OU | `CI1-uno` | `CI1-pico` | `CI1-pico2` | CD4081/74HC08 et CD4071/74HC32, deux entrées communes, table de vérité comparée porte par porte |
| CI logiques : OU EXCLUSIF et NON-ET | `CI2-uno` | `CI2-pico` | `CI2-pico2` | CD4070/74HC86 et CD4011/74HC00, même principe |
| CI logiques : NON-OU et NON | `CI3-uno` | `CI3-pico` | `CI3-pico2` | CD4001/74HC02 et CD40106/74HC14 (inverseurs six portes) |
| DMX512 : carte Grove + projecteur PAR 38 | `dmx-uno` | `dmx-pico` | `dmx-pico2` | les deux composants de la bibliothèque publique (`.kompix`) ; le projecteur prend rouge, vert puis bleu — liaison simulée (broche, adresse, canaux) et continuité du câblage UART → XLR contrôlées |

Libs Arduino requises (installées via `arduino-cli lib install`) : Servo,
LiquidCrystal I2C, Adafruit SSD1306, Adafruit ILI9341, Adafruit NeoPixel, SD,
DHT sensor library, Keypad.

## Maintenance et vérification automatique

- `_spec.mjs` — **source de vérité** : schémas, câblages, programmes, attentes.
- `_paths.mjs` — où trouver un test. La lecture cherche le fichier là où il est,
  l'écriture conserve son emplacement actuel (un test nouveau naît sous
  `Arduino/` s'il est en `.ino`, à la racine s'il est en `.py`).
- `_generate.mjs` — régénère tous les fichiers : `node testkablix/_generate.mjs`.
  Ne pas retoucher les `.ino`/`.py`/`.projix` à la main : modifier la spec puis régénérer.
- `transistor.csv` — la liste de références de Frank (limites, boîtier, symbole
  interne, brochage), lue par `npm run verify:transistor` pour contrôler la base
  des modèles. Donnée de banc : elle vit ici, pas dans un dossier de tri.
- `_verify.mjs` — vérifie tout : `node testkablix/_verify.mjs` (ou `--quick`
  pour sauter compilations et exécutions) :
  1. chaque `.projix` (archive, manifeste, composants, broches, bindings du moteur) ;
  2. compilation réelle de chaque `.ino` (arduino-cli) ;
  3. syntaxe de chaque `.py` (`python -m py_compile`) ;
  4. bout en bout : blink Uno/Mega dans avr8js, LED Pico dans PicoEngine
     avec le vrai firmware MicroPython.
