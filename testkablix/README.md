# testkablix — tests manuels par composant

Un test = un programme + un projet `.projix` (schéma câblé prêt à simuler).

- **Sketchs Arduino (`.ino`)** : un dossier par sketch (convention Arduino), le
  `.projix` est **dans le même dossier** que le `.ino`.
- **Scripts MicroPython (`.py`)** : à la racine, le `.projix` porte le même nom.

## Utilisation

1. Ouvrir le simulateur Kablix (icône de la barre d'activité).
2. `📂 Ouvrir` → choisir le `.projix` du test : le schéma, la carte **et le
   fichier de code** sont restaurés (le workspace doit être la racine du dépôt
   pour que la référence au fichier de code se résolve).
3. `▶ Démarrer` : compile et exécute le programme du test.
4. Agir sur le composant (curseur, bouton, survol…) et observer le moniteur série.

## Couverture

Chaque carte de dev a son projix : `blink-uno`, `blink-nano`, `blink-mega`,
`blink-pico`, `blink-picow` (LED embarquée).

Chaque composant du catalogue a deux tests : `<composant>-uno` (Arduino, C) et
`<composant>-pico` (MicroPython) — sauf le HC-SR04, simulé sur AVR uniquement.

| Composant | Test Uno | Test Pico | Observable |
|---|---|---|---|
| LED (+ résistance) | `led-uno` | `led-pico` | clignote 1 Hz |
| LED RGB | `rgb-led-uno` | `rgb-led-pico` | fondu R, V, B puis blanc |
| Bouton poussoir | `button-uno` | `button-pico` | appui → « APPUYE » + LED |
| Bouton 6 mm | `button-6mm-uno` | `button-6mm-pico` | idem |
| Résistance | `resistor-uno` | `resistor-pico` | LED allumée (continuité) |
| Buzzer | `buzzer-uno` | `buzzer-pico` | halo actif + tone/PWM |
| Potentiomètre | `pot-uno` | `pot-pico` | valeur suit le curseur |
| Potentiomètre à glissière | `slide-pot-uno` | `slide-pot-pico` | idem |
| Afficheur 7 segments | `7seg-uno` | `7seg-pico` | compte 0→9 |
| Barre de 10 LED | `led-bar-uno` | `led-bar-pico` | vumètre monte/descend |
| Interrupteur à glissière | `slide-switch-uno` | `slide-switch-pico` | position 1/3 |
| DIP switch ×8 | `dip-switch-uno` | `dip-switch-pico` | 8 canaux 0/1 |
| Joystick analogique | `joystick-uno` | `joystick-pico` | X/Y + bouton |
| Capteur de lumière (LDR) | `photoresistor-uno` | `photoresistor-pico` | AO + DO (actif bas) |
| Capteur PIR | `pir-uno` | `pir-pico` | survol = mouvement |
| Capteur d'inclinaison | `tilt-uno` | `tilt-pico` | clic maintenu = incliné |
| Servomoteur | `servo-uno` | `servo-pico` | 0° / 90° / 180° |
| LCD 16×2 I²C | `lcd-uno` | `lcd-pico` | texte + compteur |
| OLED SSD1306 I²C | `oled-ssd1306-uno` | `oled-ssd1306-pico` | cadre + dessin |
| TFT ILI9341 SPI | `ili9341-uno` | `ili9341-pico` | aplats de couleur |
| Carte microSD SPI | `microsd-uno` | `microsd-pico` | init OK (pas de FAT) |
| NeoPixel (1 px) | `neopixel-uno` | `neopixel-pico` | rouge/vert/bleu |
| Matrice NeoPixel 8×8 | `neopixel-matrix-uno` | `neopixel-matrix-pico` | diagonale + dégradé |
| Anneau NeoPixel 16 | `led-ring-uno` | `led-ring-pico` | chenillard bleu |
| Température NTC | `ntc-temp-uno` | `ntc-temp-pico` | valeur suit le curseur |
| Capteur de gaz (MQ) | `gas-sensor-uno` | `gas-sensor-pico` | AOUT + DOUT |
| Capteur de pouls | `heartbeat-uno` | `heartbeat-pico` | signal qui bat |
| Capteur de flamme | `flame-uno` | `flame-pico` | AOUT + DOUT |
| Capteur de son | `sound-uno` | `sound-pico` | AOUT + DOUT |
| HC-SR04 (ultrason) | `hcsr04-uno` | — (AVR seulement) | distance en cm |
| DHT22 (temp/humidité) | `dht22-uno` | `dht22-pico` | T + H toutes les 2 s |
| Clavier matriciel 4×4 | `keypad-uno` | `keypad-pico` | touche affichée |

Libs Arduino requises (installées via `arduino-cli lib install`) : Servo,
LiquidCrystal I2C, Adafruit SSD1306, Adafruit ILI9341, Adafruit NeoPixel, SD,
DHT sensor library, Keypad.

## Maintenance et vérification automatique

- `_spec.mjs` — **source de vérité** : schémas, câblages, programmes, attentes.
- `_generate.mjs` — régénère tous les fichiers : `node testkablix/_generate.mjs`.
  Ne pas retoucher les `.ino`/`.py`/`.projix` à la main : modifier la spec puis régénérer.
- `_verify.mjs` — vérifie tout : `node testkablix/_verify.mjs` (ou `--quick`
  pour sauter compilations et exécutions) :
  1. chaque `.projix` (archive, manifeste, composants, broches, bindings du moteur) ;
  2. compilation réelle de chaque `.ino` (arduino-cli) ;
  3. syntaxe de chaque `.py` (`python -m py_compile`) ;
  4. bout en bout : blink Uno/Mega dans avr8js, LED Pico dans PicoEngine
     avec le vrai firmware MicroPython.
