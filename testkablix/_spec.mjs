// Source de vérité des tests testkablix : chaque entrée décrit UN test =
// un programme (.ino ou .py) + un schéma (.projix) + les vérifications attendues.
// Consommée par _generate.mjs (écrit les fichiers) et _verify.mjs (contrôle tout).
//
// Convention : la carte est toujours le composant `mcu1` ; les fils vont du
// composant vers la carte. Les couleurs suivent l'éditeur (rouge = VCC,
// noir = GND, autres couleurs libres).

// --- Broches connues de chaque type de composant (contrôle de validité) -------
export const PART_PINS = {
  led: ['A', 'C'],
  'rgb-led': ['R', 'COM', 'G', 'B'],
  button: ['1.l', '2.l', '1.r', '2.r'],
  'button-6mm': ['1.l', '2.l', '1.r', '2.r'],
  resistor: ['1', '2'],
  buzzer: ['1', '2'],
  pot: ['GND', 'SIG', 'VCC'],
  'slide-pot': ['GND', 'SIG', 'VCC'],
  '7seg': ['COM.1', 'COM.2', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'],
  'led-bar': [
    'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
    'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10',
  ],
  'slide-switch': ['1', '2', '3'],
  'dip-switch': ['1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '1b', '2b', '3b', '4b', '5b', '6b', '7b', '8b'],
  joystick: ['VCC', 'VERT', 'HORZ', 'SEL', 'GND'],
  photoresistor: ['VCC', 'GND', 'DO', 'AO'],
  pir: ['VCC', 'OUT', 'GND'],
  tilt: ['GND', 'VCC', 'OUT'],
  servo: ['GND', 'V+', 'PWM'],
  lcd: ['GND', 'VCC', 'SDA', 'SCL'],
  'oled-ssd1306': ['SDA', 'SCL', 'SA0', 'RST', 'CS', 'VDD', 'VIN', 'GND'],
  ili9341: ['VCC', 'GND', 'CS', 'RST', 'D/C', 'MOSI', 'SCK', 'LED', 'MISO'],
  microsd: ['CD', 'DO', 'GND', 'SCK', 'VCC', 'DI', 'CS'],
  neopixel: ['VDD', 'DOUT', 'VSS', 'DIN'],
  'neopixel-matrix': ['GND', 'VCC', 'DIN', 'DOUT'],
  'led-ring': ['GND', 'VCC', 'DIN', 'DOUT'],
  'ntc-temp': ['GND', 'VCC', 'OUT'],
  'gas-sensor': ['AOUT', 'DOUT', 'GND', 'VCC'],
  heartbeat: ['GND', 'VCC', 'OUT'],
  flame: ['VCC', 'GND', 'DOUT', 'AOUT'],
  sound: ['AOUT', 'DOUT', 'GND', 'VCC'],
  hcsr04: ['VCC', 'TRIG', 'ECHO', 'GND'],
  dht22: ['VCC', 'DATA', 'NC', 'GND'],
  keypad: ['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'],
  // Module Grove PCA9685 : bus Grove + bornier alim servo + 16 colonnes servo.
  pca9685: [
    'GND', 'VCC', 'SDA', 'SCL', 'GND.2', 'V+',
    ...Array.from({ length: 16 }, (_, i) => `PWM${i}`),
    ...Array.from({ length: 16 }, (_, i) => `P${i + 1}.5V`),
    ...Array.from({ length: 16 }, (_, i) => `P${i + 1}.GND`),
  ],
  alim: ['V+', 'GND'],
};

// --- Helpers -------------------------------------------------------------------
let wireSeq = 0;
/** Fil composant(pin) → carte/autre composant. `to` = [partId, pin]. */
function w(fromId, fromPin, toId, toPin, color) {
  wireSeq++;
  const wire = { id: `w${wireSeq}`, a: { partId: fromId, pin: fromPin }, b: { partId: toId, pin: toPin } };
  if (color) wire.color = color;
  return wire;
}

/** Fabrique un test : remet le compteur de fils à zéro pour des ids stables. */
function test(def) {
  wireSeq = 0;
  const built = typeof def.wires === 'function' ? { ...def, wires: def.wires() } : def;
  return built;
}

const MCU = (board, x = 40, y = 60) => ({ id: 'mcu1', type: board, x, y });

// ================================================================================
// Partie AVR — Arduino Uno (un test .ino par composant, dossier par sketch)
// ================================================================================
const AVR_TESTS = [
  test({
    name: 'led-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'r1', type: 'resistor', x: 480, y: 90, attrs: { value: '220' } }, { id: 'led1', type: 'led', x: 620, y: 60, attrs: { color: 'red' } }],
    wires: () => [w('r1', '1', 'mcu1', '13', 'green'), w('led1', 'A', 'r1', '2', 'green'), w('led1', 'C', 'mcu1', 'GND.1', 'black')],
    expect: { kind: 'led', partId: 'led1', mcuPin: '13' },
    code: `// Test LED : clignote sur D13 (via une résistance de 220 ohms).
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(13, HIGH);   // LED allumée
  Serial.println("LED ON");
  delay(500);
  digitalWrite(13, LOW);    // LED éteinte
  Serial.println("LED OFF");
  delay(500);
}
`,
  }),

  test({
    name: 'rgb-led-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'rgb1', type: 'rgb-led', x: 620, y: 80, attrs: { common: 'cathode' } }],
    wires: () => [
      w('rgb1', 'R', 'mcu1', '9', 'orange'),
      w('rgb1', 'G', 'mcu1', '10', 'green'),
      w('rgb1', 'B', 'mcu1', '11', 'blue'),
      w('rgb1', 'COM', 'mcu1', 'GND.1', 'black'),
    ],
    expect: { kind: 'rgb-led', partId: 'rgb1', r: '9', g: '10', b: '11' },
    code: `// Test LED RGB (cathode commune) : fondu sur chaque canal PWM.
const int R = 9, G = 10, B = 11;

void setup() {
  Serial.begin(115200);
}

void fondu(int broche, const char* nom) {
  Serial.println(nom);
  for (int v = 0; v <= 255; v += 5) { analogWrite(broche, v); delay(10); }
  analogWrite(broche, 0);
}

void loop() {
  fondu(R, "Rouge");
  fondu(G, "Vert");
  fondu(B, "Bleu");
  // Blanc : les trois canaux ensemble.
  analogWrite(R, 255); analogWrite(G, 255); analogWrite(B, 255);
  Serial.println("Blanc");
  delay(800);
  analogWrite(R, 0); analogWrite(G, 0); analogWrite(B, 0);
}
`,
  }),

  test({
    name: 'button-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'btn1', type: 'button', x: 620, y: 100, attrs: { color: 'green' } }],
    wires: () => [w('btn1', '1.l', 'mcu1', '2', 'yellow'), w('btn1', '2.l', 'mcu1', 'GND.1', 'black')],
    expect: { kind: 'button', partId: 'btn1', mcuPin: '2' },
    code: `// Test bouton poussoir : appui = LOW (pull-up interne), recopié sur la LED D13.
void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool appuye = (digitalRead(2) == LOW);
  digitalWrite(13, appuye ? HIGH : LOW);
  Serial.println(appuye ? "APPUYE" : "relache");
  delay(200);
}
`,
  }),

  test({
    name: 'button-6mm-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'btn1', type: 'button-6mm', x: 620, y: 100, attrs: { color: 'red' } }],
    wires: () => [w('btn1', '1.l', 'mcu1', '3', 'yellow'), w('btn1', '2.l', 'mcu1', 'GND.1', 'black')],
    expect: { kind: 'button', partId: 'btn1', mcuPin: '3' },
    code: `// Test bouton 6 mm : identique au bouton standard, sur D3.
void setup() {
  pinMode(3, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool appuye = (digitalRead(3) == LOW);
  digitalWrite(13, appuye ? HIGH : LOW);
  Serial.println(appuye ? "APPUYE" : "relache");
  delay(200);
}
`,
  }),

  test({
    name: 'resistor-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'r1', type: 'resistor', x: 480, y: 90, attrs: { value: '220' } }, { id: 'led1', type: 'led', x: 620, y: 60, attrs: { color: 'yellow' } }],
    wires: () => [w('r1', '1', 'mcu1', '8', 'green'), w('led1', 'A', 'r1', '2', 'green'), w('led1', 'C', 'mcu1', 'GND.2', 'black')],
    expect: { kind: 'led', partId: 'led1', mcuPin: '8' },
    code: `// Test résistance : en série avec une LED sur D8 (continuité du courant).
void setup() {
  pinMode(8, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(8, HIGH);
  Serial.println("LED allumee a travers la resistance");
  delay(700);
  digitalWrite(8, LOW);
  delay(300);
}
`,
  }),

  test({
    name: 'buzzer-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'bz1', type: 'buzzer', x: 620, y: 90 }],
    wires: () => [w('bz1', '1', 'mcu1', '8', 'purple'), w('bz1', '2', 'mcu1', 'GND.1', 'black')],
    expect: { kind: 'buzzer', partId: 'bz1', mcuPin: '8' },
    code: `// Test buzzer : niveau haut simple puis tone() (halo actif sur le buzzer).
void setup() {
  pinMode(8, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(8, HIGH);           // buzzer actif (niveau haut)
  Serial.println("Buzzer ON");
  delay(400);
  digitalWrite(8, LOW);
  Serial.println("Buzzer OFF");
  delay(400);
  tone(8, 440, 300);               // la 440 Hz pendant 300 ms
  Serial.println("tone(440 Hz)");
  delay(600);
}
`,
  }),

  test({
    name: 'pot-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'pot1', type: 'pot', x: 620, y: 90, attrs: { min: '0', max: '100', value: '50' } }],
    wires: () => [
      w('pot1', 'VCC', 'mcu1', '5V', 'red'),
      w('pot1', 'SIG', 'mcu1', 'A0', 'green'),
      w('pot1', 'GND', 'mcu1', 'GND.1', 'black'),
    ],
    expect: { kind: 'pot', partId: 'pot1', mcuPin: 'A0' },
    code: `// Test potentiomètre : lecture analogique 0-1023 sur A0.
void setup() {
  Serial.begin(115200);
}

void loop() {
  int valeur = analogRead(A0);
  Serial.print("A0 = ");
  Serial.println(valeur);
  delay(250);
}
`,
  }),

  test({
    name: 'slide-pot-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'pot1', type: 'slide-pot', x: 600, y: 100, attrs: { min: '0', max: '100', value: '50' } }],
    wires: () => [
      w('pot1', 'VCC', 'mcu1', '5V', 'red'),
      w('pot1', 'SIG', 'mcu1', 'A0', 'green'),
      w('pot1', 'GND', 'mcu1', 'GND.1', 'black'),
    ],
    expect: { kind: 'pot', partId: 'pot1', mcuPin: 'A0' },
    code: `// Test potentiomètre à glissière : lecture analogique 0-1023 sur A0.
void setup() {
  Serial.begin(115200);
}

void loop() {
  int valeur = analogRead(A0);
  Serial.print("A0 = ");
  Serial.println(valeur);
  delay(250);
}
`,
  }),

  test({
    name: '7seg-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'seg1', type: '7seg', x: 620, y: 80, attrs: { color: 'red', common: 'cathode', digits: '1' } }],
    wires: () => [
      w('seg1', 'A', 'mcu1', '2', 'green'),
      w('seg1', 'B', 'mcu1', '3', 'green'),
      w('seg1', 'C', 'mcu1', '4', 'green'),
      w('seg1', 'D', 'mcu1', '5', 'green'),
      w('seg1', 'E', 'mcu1', '6', 'green'),
      w('seg1', 'F', 'mcu1', '7', 'green'),
      w('seg1', 'G', 'mcu1', '8', 'green'),
      w('seg1', 'DP', 'mcu1', '9', 'green'),
      w('seg1', 'COM.1', 'mcu1', 'GND.1', 'black'),
    ],
    expect: { kind: '7seg', partId: 'seg1', segments: { A: '2', B: '3', C: '4', D: '5', E: '6', F: '7', G: '8', DP: '9' } },
    code: `// Test afficheur 7 segments (cathode commune) : compte de 0 à 9.
// Segments A,B,C,D,E,F,G,DP sur D2..D9 ; commun COM sur GND.
const int SEGS[8] = {2, 3, 4, 5, 6, 7, 8, 9};
// Bits a..g (bit 0 = A, ... bit 6 = G) pour les chiffres 0..9.
const byte CHIFFRES[10] = {
  0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110,
  0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111,
};

void setup() {
  for (int i = 0; i < 8; i++) pinMode(SEGS[i], OUTPUT);
  Serial.begin(115200);
}

void loop() {
  for (int n = 0; n <= 9; n++) {
    for (int s = 0; s < 7; s++) digitalWrite(SEGS[s], (CHIFFRES[n] >> s) & 1);
    digitalWrite(SEGS[7], n % 2);   // point décimal sur les impairs
    Serial.println(n);
    delay(500);
  }
}
`,
  }),

  test({
    name: 'led-bar-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'bar1', type: 'led-bar', x: 620, y: 80, attrs: { color: 'GYR' } }],
    wires: () => [
      ...Array.from({ length: 10 }, (_, i) => w('bar1', `A${i + 1}`, 'mcu1', String(i + 2), 'green')),
      ...Array.from({ length: 10 }, (_, i) => w('bar1', `C${i + 1}`, 'mcu1', `GND.${(i % 3) + 1}`, 'black')),
    ],
    expect: { kind: 'led-bar', partId: 'bar1', firstPin: '2' },
    code: `// Test barre de 10 LED : vumètre qui monte puis descend (anodes sur D2..D11).
void setup() {
  for (int i = 2; i <= 11; i++) pinMode(i, OUTPUT);
  Serial.begin(115200);
}

void afficher(int niveau) {
  for (int i = 0; i < 10; i++) digitalWrite(2 + i, i < niveau ? HIGH : LOW);
  Serial.print("niveau = ");
  Serial.println(niveau);
}

void loop() {
  for (int n = 0; n <= 10; n++) { afficher(n); delay(150); }
  for (int n = 10; n >= 0; n--) { afficher(n); delay(150); }
}
`,
  }),

  test({
    name: 'slide-switch-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'sw1', type: 'slide-switch', x: 620, y: 100 }],
    wires: () => [
      w('sw1', '1', 'mcu1', '7', 'yellow'),
      w('sw1', '2', 'mcu1', 'GND.1', 'black'),
      w('sw1', '3', 'mcu1', '8', 'orange'),
    ],
    expect: { kind: 'slide-switch', partId: 'sw1', sides: { 1: '7', 3: '8' } },
    code: `// Test interrupteur à glissière : le commun (2) est à GND, les côtés 1 et 3
// sont lus en pull-up : le côté connecté passe à LOW.
void setup() {
  pinMode(7, INPUT_PULLUP);
  pinMode(8, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  if (digitalRead(7) == LOW) Serial.println("Position 1");
  else if (digitalRead(8) == LOW) Serial.println("Position 3");
  else Serial.println("(milieu / non connecte)");
  delay(300);
}
`,
  }),

  test({
    name: 'dip-switch-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'dip1', type: 'dip-switch', x: 620, y: 90 }],
    wires: () => [
      ...Array.from({ length: 8 }, (_, i) => w('dip1', `${i + 1}a`, 'mcu1', String(i + 2), 'yellow')),
      ...Array.from({ length: 8 }, (_, i) => w('dip1', `${i + 1}b`, 'mcu1', `GND.${(i % 3) + 1}`, 'black')),
    ],
    expect: { kind: 'dip-switch', partId: 'dip1', channels: 8 },
    code: `// Test DIP switch x8 : chaque canal fermé tire sa broche (D2..D9) à LOW.
void setup() {
  for (int i = 2; i <= 9; i++) pinMode(i, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  Serial.print("Canaux : ");
  for (int i = 0; i < 8; i++) Serial.print(digitalRead(2 + i) == LOW ? "1" : "0");
  Serial.println();
  delay(400);
}
`,
  }),

  test({
    name: 'joystick-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'joy1', type: 'joystick', x: 620, y: 80 }],
    wires: () => [
      w('joy1', 'VCC', 'mcu1', '5V', 'red'),
      w('joy1', 'VERT', 'mcu1', 'A0', 'green'),
      w('joy1', 'HORZ', 'mcu1', 'A1', 'blue'),
      w('joy1', 'SEL', 'mcu1', '2', 'yellow'),
      w('joy1', 'GND', 'mcu1', 'GND.1', 'black'),
    ],
    expect: { kind: 'joystick', partId: 'joy1', vert: 'A0', horz: 'A1', sel: '2' },
    code: `// Test joystick analogique : X/Y en analogique, bouton SEL en pull-up.
void setup() {
  pinMode(2, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  Serial.print("Y=");
  Serial.print(analogRead(A0));
  Serial.print("  X=");
  Serial.print(analogRead(A1));
  Serial.print("  bouton=");
  Serial.println(digitalRead(2) == LOW ? "APPUYE" : "relache");
  delay(250);
}
`,
  }),

  test({
    name: 'photoresistor-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'ldr1', type: 'photoresistor', x: 620, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('ldr1', 'VCC', 'mcu1', '5V', 'red'),
      w('ldr1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('ldr1', 'AO', 'mcu1', 'A0', 'green'),
      w('ldr1', 'DO', 'mcu1', '2', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'ldr1', analog: 'A0', digital: '2' },
    code: `// Test capteur de lumière (LDR) : sortie analogique AO + sortie numérique DO
// (DO est actif bas : LOW = seuil dépassé).
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.print("AO = ");
  Serial.print(analogRead(A0));
  Serial.print("  DO = ");
  Serial.println(digitalRead(2) == LOW ? "SEUIL DEPASSE" : "sous le seuil");
  delay(300);
}
`,
  }),

  test({
    name: 'pir-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'pir1', type: 'pir', x: 620, y: 90 }],
    wires: () => [
      w('pir1', 'VCC', 'mcu1', '5V', 'red'),
      w('pir1', 'OUT', 'mcu1', '2', 'yellow'),
      w('pir1', 'GND', 'mcu1', 'GND.1', 'black'),
    ],
    expect: { kind: 'digital-source', partId: 'pir1', mcuPin: '2' },
    code: `// Test capteur PIR : en simulation, survoler le capteur déclenche le mouvement.
void setup() {
  pinMode(2, INPUT);
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool mouvement = (digitalRead(2) == HIGH);
  digitalWrite(13, mouvement ? HIGH : LOW);
  Serial.println(mouvement ? "MOUVEMENT !" : "rien");
  delay(300);
}
`,
  }),

  test({
    name: 'tilt-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'tilt1', type: 'tilt', x: 620, y: 90 }],
    wires: () => [
      w('tilt1', 'VCC', 'mcu1', '5V', 'red'),
      w('tilt1', 'OUT', 'mcu1', '2', 'yellow'),
      w('tilt1', 'GND', 'mcu1', 'GND.1', 'black'),
    ],
    expect: { kind: 'digital-source', partId: 'tilt1', mcuPin: '2' },
    code: `// Test capteur d'inclinaison : en simulation, maintenir le clic incline le capteur.
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.println(digitalRead(2) == HIGH ? "INCLINE" : "droit");
  delay(300);
}
`,
  }),

  test({
    name: 'servo-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'srv1', type: 'servo', x: 620, y: 80, attrs: { horn: 'single', pulsemin: '500', pulsemax: '2500' } }],
    wires: () => [
      w('srv1', 'V+', 'mcu1', '5V', 'red'),
      w('srv1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('srv1', 'PWM', 'mcu1', '9', 'orange'),
    ],
    expect: { kind: 'servo', partId: 'srv1', mcuPin: '9' },
    code: `// Test servomoteur : le bras se positionne à 0°, 90° puis 180°.
#include <Servo.h>

Servo servo;

void setup() {
  servo.attach(9);
  Serial.begin(115200);
}

void loop() {
  servo.write(0);
  Serial.println("0 degres");
  delay(1000);
  servo.write(90);
  Serial.println("90 degres");
  delay(1000);
  servo.write(180);
  Serial.println("180 degres");
  delay(1000);
}
`,
  }),

  test({
    name: 'pca9685-uno', board: 'uno', ext: 'ino',
    parts: [
      MCU('uno'),
      { id: 'pca1', type: 'pca9685', x: 560, y: 40, attrs: { address: '0x40' } },
      { id: 'srv1', type: 'servo', x: 940, y: 40, attrs: { horn: 'single', pulsemin: '500', pulsemax: '2500' } },
      { id: 'alim1', type: 'alim', x: 940, y: 260, attrs: { voltage: '5', maxcurrent: '1' } },
    ],
    wires: () => [
      w('pca1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('pca1', 'VCC', 'mcu1', '5V', 'red'),
      w('pca1', 'SDA', 'mcu1', 'A4', 'blue'),
      w('pca1', 'SCL', 'mcu1', 'A5', 'yellow'),
      w('srv1', 'PWM', 'pca1', 'PWM0', 'orange'),
      w('srv1', 'V+', 'pca1', 'P1.5V', 'red'),
      w('srv1', 'GND', 'pca1', 'P1.GND', 'black'),
      w('alim1', 'V+', 'pca1', 'V+', 'red'),
      w('alim1', 'GND', 'pca1', 'GND.2', 'black'),
    ],
    expect: { kind: 'pca9685', partId: 'pca1', channel: 0, targetId: 'srv1', powered: true },
    code: `// Test PCA9685 : le servo branché sur P1 (canal 0) balaie 0°, 90° puis 180°.
// SANS l'alimentation de laboratoire réglée sur 5 V (courant suffisant) sur le
// bornier V+/GND du module, les sorties ne bougent pas.
#include <Wire.h>

const uint8_t PCA = 0x40;

void pcaEcrit(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(PCA);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

// Impulsion du canal : créneau démarré à 0, coupé à durée/20 ms × 4096 pas.
void pcaImpulsion(uint8_t canal, uint16_t microsecondes) {
  uint16_t off = (uint32_t)microsecondes * 4096UL / 20000UL;
  Wire.beginTransmission(PCA);
  Wire.write(0x06 + 4 * canal); // LED0_ON_L (auto-incrément)
  Wire.write(0x00); Wire.write(0x00);
  Wire.write(off & 0xFF); Wire.write(off >> 8);
  Wire.endTransmission();
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  pcaEcrit(0x00, 0x10);  // MODE1 : sleep pour régler le prescaler
  pcaEcrit(0xFE, 121);   // prescale 50 Hz (25 MHz / (4096 x 50) - 1)
  pcaEcrit(0x00, 0x20);  // MODE1 : réveil + auto-incrément
}

void loop() {
  pcaImpulsion(0, 500);  Serial.println("0 degres");   delay(1000);
  pcaImpulsion(0, 1500); Serial.println("90 degres");  delay(1000);
  pcaImpulsion(0, 2500); Serial.println("180 degres"); delay(1000);
}
`,
  }),

  test({
    name: 'lcd-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'lcd1', type: 'lcd', x: 560, y: 60, attrs: { pins: 'i2c', address: '0x27', cols: '16', rows: '2', lcdSize: '16x2' } }],
    wires: () => [
      w('lcd1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('lcd1', 'VCC', 'mcu1', '5V', 'red'),
      w('lcd1', 'SDA', 'mcu1', 'A4', 'blue'),
      w('lcd1', 'SCL', 'mcu1', 'A5', 'yellow'),
    ],
    expect: { kind: 'i2c-part', partId: 'lcd1' },
    code: `// Test LCD 16x2 en I2C (adresse 0x27) : texte + compteur.
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);
int compteur = 0;

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Kablix LCD I2C");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("compteur: ");
  lcd.print(compteur++);
  delay(500);
}
`,
  }),

  test({
    name: 'oled-ssd1306-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'oled1', type: 'oled-ssd1306', x: 600, y: 70, attrs: { pins: 'i2c' } }],
    wires: () => [
      w('oled1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('oled1', 'VDD', 'mcu1', '3.3V', 'red'),
      w('oled1', 'SDA', 'mcu1', 'A4', 'blue'),
      w('oled1', 'SCL', 'mcu1', 'A5', 'yellow'),
    ],
    expect: { kind: 'i2c-part', partId: 'oled1' },
    code: `// Test OLED SSD1306 en I2C (0x3C) : cadre, texte et diagonale.
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 ecran(128, 64, &Wire, -1);

void setup() {
  ecran.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  ecran.clearDisplay();
  ecran.drawRect(0, 0, 128, 64, SSD1306_WHITE);
  ecran.drawLine(0, 63, 127, 0, SSD1306_WHITE);
  ecran.setTextColor(SSD1306_WHITE);
  ecran.setTextSize(2);
  ecran.setCursor(16, 24);
  ecran.print("Kablix");
  ecran.display();
}

void loop() {
  delay(1000);
}
`,
  }),

  test({
    name: 'ili9341-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'tft1', type: 'ili9341', x: 560, y: 40 }],
    wires: () => [
      w('tft1', 'VCC', 'mcu1', '5V', 'red'),
      w('tft1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('tft1', 'CS', 'mcu1', '10', 'yellow'),
      w('tft1', 'RST', 'mcu1', '8', 'gray'),
      w('tft1', 'D/C', 'mcu1', '9', 'orange'),
      w('tft1', 'MOSI', 'mcu1', '11', 'blue'),
      w('tft1', 'SCK', 'mcu1', '13', 'green'),
      w('tft1', 'MISO', 'mcu1', '12', 'purple'),
      w('tft1', 'LED', 'mcu1', '3.3V', 'red'),
    ],
    expect: { kind: 'spi-device', partId: 'tft1', dcPin: '9', csPin: '10' },
    code: `// Test écran TFT ILI9341 (SPI) : aplats de couleur + texte.
#include <Adafruit_ILI9341.h>

Adafruit_ILI9341 tft(10, 9, 8);   // CS, D/C, RST

void setup() {
  tft.begin();
  tft.fillScreen(ILI9341_RED);
  delay(300);
  tft.fillScreen(ILI9341_GREEN);
  delay(300);
  tft.fillScreen(ILI9341_BLUE);
  delay(300);
  tft.fillScreen(ILI9341_BLACK);
  tft.setTextColor(ILI9341_WHITE);
  tft.setTextSize(3);
  tft.setCursor(40, 140);
  tft.print("Kablix");
}

void loop() {
  delay(1000);
}
`,
  }),

  test({
    name: 'microsd-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'sd1', type: 'microsd', x: 620, y: 90 }],
    wires: () => [
      w('sd1', 'VCC', 'mcu1', '5V', 'red'),
      w('sd1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('sd1', 'CS', 'mcu1', '4', 'yellow'),
      w('sd1', 'DI', 'mcu1', '11', 'blue'),
      w('sd1', 'DO', 'mcu1', '12', 'purple'),
      w('sd1', 'SCK', 'mcu1', '13', 'green'),
    ],
    expect: { kind: 'spi-device', partId: 'sd1', dcPin: null, csPin: '4' },
    code: `// Test carte microSD (SPI) : SD.begin doit réussir (carte détectée).
// Note : pas de système de fichiers FAT préchargé, open() échouera — c'est normal.
#include <SD.h>

void setup() {
  Serial.begin(115200);
  if (SD.begin(4)) {
    Serial.println("Carte SD detectee : init OK");
  } else {
    Serial.println("ECHEC de l'init SD");
  }
}

void loop() {
  delay(1000);
}
`,
  }),

  test({
    name: 'neopixel-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'np1', type: 'neopixel', x: 620, y: 100 }],
    wires: () => [
      w('np1', 'VDD', 'mcu1', '5V', 'red'),
      w('np1', 'VSS', 'mcu1', 'GND.1', 'black'),
      w('np1', 'DIN', 'mcu1', '6', 'green'),
    ],
    expect: { kind: 'neopixel', partId: 'np1', mcuPin: '6', count: 1 },
    code: `// Test NeoPixel (1 pixel WS2812) : rouge, vert, bleu en boucle.
#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel pixel(1, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  pixel.begin();
  Serial.begin(115200);
}

void couleur(uint32_t c, const char* nom) {
  pixel.setPixelColor(0, c);
  pixel.show();
  Serial.println(nom);
  delay(600);
}

void loop() {
  couleur(pixel.Color(255, 0, 0), "Rouge");
  couleur(pixel.Color(0, 255, 0), "Vert");
  couleur(pixel.Color(0, 0, 255), "Bleu");
}
`,
  }),

  test({
    name: 'neopixel-matrix-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'npm1', type: 'neopixel-matrix', x: 600, y: 50, attrs: { rows: '8', cols: '8' } }],
    wires: () => [
      w('npm1', 'VCC', 'mcu1', '5V', 'red'),
      w('npm1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('npm1', 'DIN', 'mcu1', '6', 'green'),
    ],
    expect: { kind: 'neopixel', partId: 'npm1', mcuPin: '6', count: 64 },
    code: `// Test matrice NeoPixel 8x8 (64 pixels) : diagonale + dégradé.
#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel matrice(64, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  matrice.begin();
  matrice.setBrightness(60);
  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 8; x++) {
      if (x == y) matrice.setPixelColor(y * 8 + x, matrice.Color(255, 255, 255));
      else matrice.setPixelColor(y * 8 + x, matrice.Color(x * 32, 0, y * 32));
    }
  }
  matrice.show();
}

void loop() {
  delay(1000);
}
`,
  }),

  test({
    name: 'led-ring-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'ring1', type: 'led-ring', x: 620, y: 60, attrs: { pixels: '16' } }],
    wires: () => [
      w('ring1', 'VCC', 'mcu1', '5V', 'red'),
      w('ring1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('ring1', 'DIN', 'mcu1', '6', 'green'),
    ],
    expect: { kind: 'neopixel', partId: 'ring1', mcuPin: '6', count: 16 },
    code: `// Test anneau NeoPixel (16 pixels) : chenillard bleu.
#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel anneau(16, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  anneau.begin();
  anneau.setBrightness(80);
}

void loop() {
  for (int i = 0; i < 16; i++) {
    anneau.clear();
    anneau.setPixelColor(i, anneau.Color(0, 80, 255));
    anneau.show();
    delay(100);
  }
}
`,
  }),

  test({
    name: 'ntc-temp-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'ntc1', type: 'ntc-temp', x: 620, y: 90, attrs: { temperature: '25' } }],
    wires: () => [
      w('ntc1', 'VCC', 'mcu1', '5V', 'red'),
      w('ntc1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('ntc1', 'OUT', 'mcu1', 'A0', 'green'),
    ],
    expect: { kind: 'analog-source', partId: 'ntc1', mcuPin: 'A0' },
    code: `// Test capteur de température NTC : lecture analogique sur A0
// (en simulation, la température se règle avec le curseur du capteur).
void setup() {
  Serial.begin(115200);
}

void loop() {
  Serial.print("A0 = ");
  Serial.println(analogRead(A0));
  delay(300);
}
`,
  }),

  test({
    name: 'gas-sensor-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'gas1', type: 'gas-sensor', x: 620, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('gas1', 'VCC', 'mcu1', '5V', 'red'),
      w('gas1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('gas1', 'AOUT', 'mcu1', 'A0', 'green'),
      w('gas1', 'DOUT', 'mcu1', '2', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'gas1', analog: 'A0', digital: '2' },
    code: `// Test capteur de gaz (MQ) : AOUT analogique + DOUT numérique (actif bas).
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.print("AOUT = ");
  Serial.print(analogRead(A0));
  Serial.print("  DOUT = ");
  Serial.println(digitalRead(2) == LOW ? "GAZ DETECTE" : "rien");
  delay(300);
}
`,
  }),

  test({
    name: 'heartbeat-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'hb1', type: 'heartbeat', x: 620, y: 90, attrs: { bpm: '72' } }],
    wires: () => [
      w('hb1', 'VCC', 'mcu1', '5V', 'red'),
      w('hb1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('hb1', 'OUT', 'mcu1', 'A0', 'green'),
    ],
    expect: { kind: 'analog-source', partId: 'hb1', mcuPin: 'A0' },
    code: `// Test capteur de pouls : le signal analogique bat au rythme cardiaque.
void setup() {
  Serial.begin(115200);
}

void loop() {
  int v = analogRead(A0);
  Serial.print("pouls = ");
  Serial.println(v);
  delay(50);
}
`,
  }),

  test({
    name: 'flame-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'fl1', type: 'flame', x: 620, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('fl1', 'VCC', 'mcu1', '5V', 'red'),
      w('fl1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('fl1', 'AOUT', 'mcu1', 'A0', 'green'),
      w('fl1', 'DOUT', 'mcu1', '2', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'fl1', analog: 'A0', digital: '2' },
    code: `// Test capteur de flamme : AOUT baisse quand la flamme approche, DOUT actif bas.
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.print("AOUT = ");
  Serial.print(analogRead(A0));
  Serial.print("  DOUT = ");
  Serial.println(digitalRead(2) == LOW ? "FLAMME !" : "rien");
  delay(300);
}
`,
  }),

  test({
    name: 'sound-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'snd1', type: 'sound', x: 620, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('snd1', 'VCC', 'mcu1', '5V', 'red'),
      w('snd1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('snd1', 'AOUT', 'mcu1', 'A0', 'green'),
      w('snd1', 'DOUT', 'mcu1', '2', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'snd1', analog: 'A0', digital: '2' },
    code: `// Test capteur de son : AOUT analogique + DOUT numérique (actif bas).
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.print("AOUT = ");
  Serial.print(analogRead(A0));
  Serial.print("  DOUT = ");
  Serial.println(digitalRead(2) == LOW ? "SON DETECTE" : "silence");
  delay(300);
}
`,
  }),

  test({
    name: 'hcsr04-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'us1', type: 'hcsr04', x: 600, y: 80, attrs: { distancemin: '2', distancemax: '400' } }],
    wires: () => [
      w('us1', 'VCC', 'mcu1', '5V', 'red'),
      w('us1', 'TRIG', 'mcu1', '2', 'yellow'),
      w('us1', 'ECHO', 'mcu1', '3', 'green'),
      w('us1', 'GND', 'mcu1', 'GND.1', 'black'),
    ],
    expect: { kind: 'ultrasonic', partId: 'us1', trig: '2', echo: '3' },
    code: `// Test HC-SR04 (ultrason) : impulsion TRIG puis mesure d'ECHO (~58 µs/cm).
const int TRIG = 2, ECHO = 3;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long duree = pulseIn(ECHO, HIGH, 30000UL);
  Serial.print("distance = ");
  Serial.print(duree / 58);
  Serial.println(" cm");
  delay(400);
}
`,
  }),

  test({
    name: 'dht22-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'dht1', type: 'dht22', x: 620, y: 90, attrs: { temperature: '22', humidity: '50' } }],
    wires: () => [
      w('dht1', 'VCC', 'mcu1', '5V', 'red'),
      w('dht1', 'DATA', 'mcu1', '2', 'green'),
      w('dht1', 'GND', 'mcu1', 'GND.1', 'black'),
    ],
    expect: { kind: 'dht22', partId: 'dht1', mcuPin: '2' },
    code: `// Test DHT22 : température et humidité sur la ligne DATA (1-wire).
#include <DHT.h>

DHT dht(2, DHT22);

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  delay(2100);   // le DHT22 ne répond qu'une fois toutes les 2 s
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) {
    Serial.println("lecture ratee");
    return;
  }
  Serial.print("T = ");
  Serial.print(t);
  Serial.print(" C   H = ");
  Serial.print(h);
  Serial.println(" %");
}
`,
  }),

  test({
    name: 'keypad-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno'), { id: 'kp1', type: 'keypad', x: 560, y: 40, attrs: { columns: '4' } }],
    wires: () => [
      w('kp1', 'R1', 'mcu1', '2', 'yellow'),
      w('kp1', 'R2', 'mcu1', '3', 'yellow'),
      w('kp1', 'R3', 'mcu1', '4', 'yellow'),
      w('kp1', 'R4', 'mcu1', '5', 'yellow'),
      w('kp1', 'C1', 'mcu1', '6', 'green'),
      w('kp1', 'C2', 'mcu1', '7', 'green'),
      w('kp1', 'C3', 'mcu1', '8', 'green'),
      w('kp1', 'C4', 'mcu1', '9', 'green'),
    ],
    expect: { kind: 'keypad', partId: 'kp1', rows: ['2', '3', '4', '5'], cols: ['6', '7', '8', '9'] },
    code: `// Test clavier matriciel 4x4 : affiche la touche pressée.
#include <Keypad.h>

const byte LIGNES = 4, COLONNES = 4;
char touches[LIGNES][COLONNES] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'},
};
byte brochesLignes[LIGNES] = {2, 3, 4, 5};
byte brochesColonnes[COLONNES] = {6, 7, 8, 9};
Keypad clavier(makeKeymap(touches), brochesLignes, brochesColonnes, LIGNES, COLONNES);

void setup() {
  Serial.begin(115200);
}

void loop() {
  char touche = clavier.getKey();
  if (touche) {
    Serial.print("Touche : ");
    Serial.println(touche);
  }
}
`,
  }),
];

// ================================================================================
// Cartes seules : blink de la LED embarquée (une carte de dev par projix)
// ================================================================================
const BOARD_TESTS = [
  test({
    name: 'blink-uno', board: 'uno', ext: 'ino',
    parts: [MCU('uno', 200, 80)],
    wires: () => [],
    expect: { kind: 'board-only' },
    code: `// Test carte Arduino Uno : la LED embarquée (D13, marquée L) clignote.
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("blink Uno");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`,
  }),

  test({
    name: 'blink-nano', board: 'nano', ext: 'ino',
    parts: [MCU('nano', 240, 120)],
    wires: () => [],
    expect: { kind: 'board-only' },
    code: `// Test carte Arduino Nano : la LED embarquée (D13) clignote.
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("blink Nano");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`,
  }),

  test({
    name: 'blink-mega', board: 'mega', ext: 'ino',
    parts: [MCU('mega', 160, 60)],
    wires: () => [],
    expect: { kind: 'board-only' },
    code: `// Test carte Arduino Mega 2560 : la LED embarquée (D13) clignote.
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("blink Mega");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`,
  }),

  test({
    name: 'blink-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico', 160, 100)],
    wires: () => [],
    expect: { kind: 'board-only' },
    code: `# Test carte Raspberry Pi Pico : la LED embarquée (GP25) clignote.
from machine import Pin
import time

led = Pin(25, Pin.OUT)
while True:
    led.toggle()
    print("LED", "ON" if led.value() else "OFF")
    time.sleep(0.5)
`,
  }),

  test({
    name: 'blink-picow', board: 'picow', ext: 'py',
    parts: [MCU('picow', 160, 100)],
    wires: () => [],
    expect: { kind: 'board-only' },
    code: `# Test carte Raspberry Pi Pico W : la LED embarquée clignote.
# En simulation Kablix la LED est sur GP25 (comme le Pico).
from machine import Pin
import time

led = Pin(25, Pin.OUT)
while True:
    led.toggle()
    print("LED", "ON" if led.value() else "OFF")
    time.sleep(0.5)
`,
  }),
];

// ================================================================================
// Partie RP2040 — Raspberry Pi Pico (MicroPython, .py + .projix côte à côte)
// ================================================================================
const PICO_TESTS = [
  test({
    name: 'led-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'r1', type: 'resistor', x: 560, y: 90, attrs: { value: '220' } }, { id: 'led1', type: 'led', x: 680, y: 60, attrs: { color: 'red' } }],
    wires: () => [w('r1', '1', 'mcu1', 'GP15', 'green'), w('led1', 'A', 'r1', '2', 'green'), w('led1', 'C', 'mcu1', 'GND.5', 'black')],
    expect: { kind: 'led', partId: 'led1', mcuPin: 'GP15' },
    code: `# Test LED : clignote sur GP15 (via une résistance de 220 ohms).
from machine import Pin
import time

led = Pin(15, Pin.OUT)
while True:
    led.value(1)
    print("LED ON")
    time.sleep(0.5)
    led.value(0)
    print("LED OFF")
    time.sleep(0.5)
`,
  }),

  test({
    name: 'rgb-led-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'rgb1', type: 'rgb-led', x: 680, y: 80, attrs: { common: 'cathode' } }],
    wires: () => [
      w('rgb1', 'R', 'mcu1', 'GP13', 'orange'),
      w('rgb1', 'G', 'mcu1', 'GP14', 'green'),
      w('rgb1', 'B', 'mcu1', 'GP15', 'blue'),
      w('rgb1', 'COM', 'mcu1', 'GND.5', 'black'),
    ],
    expect: { kind: 'rgb-led', partId: 'rgb1', r: 'GP13', g: 'GP14', b: 'GP15' },
    code: `# Test LED RGB (cathode commune) : fondu PWM sur chaque canal.
from machine import Pin, PWM
import time

canaux = {"Rouge": PWM(Pin(13)), "Vert": PWM(Pin(14)), "Bleu": PWM(Pin(15))}
for p in canaux.values():
    p.freq(1000)
    p.duty_u16(0)

while True:
    for nom, pwm in canaux.items():
        print(nom)
        for v in range(0, 65536, 4096):
            pwm.duty_u16(v)
            time.sleep(0.02)
        pwm.duty_u16(0)
`,
  }),

  test({
    name: 'button-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'btn1', type: 'button', x: 680, y: 100, attrs: { color: 'green' } }],
    wires: () => [w('btn1', '1.l', 'mcu1', 'GP14', 'yellow'), w('btn1', '2.l', 'mcu1', 'GND.5', 'black')],
    expect: { kind: 'button', partId: 'btn1', mcuPin: 'GP14' },
    code: `# Test bouton poussoir : appui = 0 (pull-up interne), recopié sur la LED GP25.
from machine import Pin
import time

bouton = Pin(14, Pin.IN, Pin.PULL_UP)
led = Pin(25, Pin.OUT)
while True:
    appuye = bouton.value() == 0
    led.value(1 if appuye else 0)
    print("APPUYE" if appuye else "relache")
    time.sleep(0.2)
`,
  }),

  test({
    name: 'button-6mm-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'btn1', type: 'button-6mm', x: 680, y: 100, attrs: { color: 'red' } }],
    wires: () => [w('btn1', '1.l', 'mcu1', 'GP13', 'yellow'), w('btn1', '2.l', 'mcu1', 'GND.5', 'black')],
    expect: { kind: 'button', partId: 'btn1', mcuPin: 'GP13' },
    code: `# Test bouton 6 mm : identique au bouton standard, sur GP13.
from machine import Pin
import time

bouton = Pin(13, Pin.IN, Pin.PULL_UP)
while True:
    print("APPUYE" if bouton.value() == 0 else "relache")
    time.sleep(0.2)
`,
  }),

  test({
    name: 'resistor-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'r1', type: 'resistor', x: 560, y: 90, attrs: { value: '220' } }, { id: 'led1', type: 'led', x: 680, y: 60, attrs: { color: 'yellow' } }],
    wires: () => [w('r1', '1', 'mcu1', 'GP16', 'green'), w('led1', 'A', 'r1', '2', 'green'), w('led1', 'C', 'mcu1', 'GND.6', 'black')],
    expect: { kind: 'led', partId: 'led1', mcuPin: 'GP16' },
    code: `# Test résistance : en série avec une LED sur GP16 (continuité du courant).
from machine import Pin
import time

sortie = Pin(16, Pin.OUT)
while True:
    sortie.value(1)
    print("LED allumee a travers la resistance")
    time.sleep(0.7)
    sortie.value(0)
    time.sleep(0.3)
`,
  }),

  test({
    name: 'buzzer-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'bz1', type: 'buzzer', x: 680, y: 90 }],
    wires: () => [w('bz1', '1', 'mcu1', 'GP16', 'purple'), w('bz1', '2', 'mcu1', 'GND.6', 'black')],
    expect: { kind: 'buzzer', partId: 'bz1', mcuPin: 'GP16' },
    code: `# Test buzzer : niveau haut simple puis « bip » en PWM.
from machine import Pin, PWM
import time

broche = Pin(16, Pin.OUT)
while True:
    broche.value(1)
    print("Buzzer ON")
    time.sleep(0.4)
    broche.value(0)
    print("Buzzer OFF")
    time.sleep(0.4)
    bip = PWM(Pin(16))
    bip.freq(440)
    bip.duty_u16(32768)
    print("bip 440 Hz")
    time.sleep(0.3)
    bip.deinit()
    broche = Pin(16, Pin.OUT)
    time.sleep(0.3)
`,
  }),

  test({
    name: 'pot-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'pot1', type: 'pot', x: 680, y: 90, attrs: { min: '0', max: '100', value: '50' } }],
    wires: () => [
      w('pot1', 'VCC', 'mcu1', '3V3', 'red'),
      w('pot1', 'SIG', 'mcu1', 'GP26', 'green'),
      w('pot1', 'GND', 'mcu1', 'GND.7', 'black'),
    ],
    expect: { kind: 'pot', partId: 'pot1', mcuPin: 'GP26' },
    code: `# Test potentiomètre : lecture analogique 0-65535 sur GP26 (ADC0).
from machine import ADC
import time

pot = ADC(26)
while True:
    print("ADC0 =", pot.read_u16())
    time.sleep(0.25)
`,
  }),

  test({
    name: 'slide-pot-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'pot1', type: 'slide-pot', x: 660, y: 100, attrs: { min: '0', max: '100', value: '50' } }],
    wires: () => [
      w('pot1', 'VCC', 'mcu1', '3V3', 'red'),
      w('pot1', 'SIG', 'mcu1', 'GP27', 'green'),
      w('pot1', 'GND', 'mcu1', 'GND.7', 'black'),
    ],
    expect: { kind: 'pot', partId: 'pot1', mcuPin: 'GP27' },
    code: `# Test potentiomètre à glissière : lecture analogique sur GP27 (ADC1).
from machine import ADC
import time

pot = ADC(27)
while True:
    print("ADC1 =", pot.read_u16())
    time.sleep(0.25)
`,
  }),

  test({
    name: '7seg-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'seg1', type: '7seg', x: 680, y: 80, attrs: { color: 'red', common: 'cathode', digits: '1' } }],
    wires: () => [
      w('seg1', 'A', 'mcu1', 'GP2', 'green'),
      w('seg1', 'B', 'mcu1', 'GP3', 'green'),
      w('seg1', 'C', 'mcu1', 'GP4', 'green'),
      w('seg1', 'D', 'mcu1', 'GP5', 'green'),
      w('seg1', 'E', 'mcu1', 'GP6', 'green'),
      w('seg1', 'F', 'mcu1', 'GP7', 'green'),
      w('seg1', 'G', 'mcu1', 'GP8', 'green'),
      w('seg1', 'DP', 'mcu1', 'GP9', 'green'),
      w('seg1', 'COM.1', 'mcu1', 'GND.3', 'black'),
    ],
    expect: { kind: '7seg', partId: 'seg1', segments: { A: 'GP2', B: 'GP3', C: 'GP4', D: 'GP5', E: 'GP6', F: 'GP7', G: 'GP8', DP: 'GP9' } },
    code: `# Test afficheur 7 segments (cathode commune) : compte de 0 à 9.
# Segments A..G,DP sur GP2..GP9 ; commun COM sur GND.
from machine import Pin
import time

segs = [Pin(n, Pin.OUT) for n in range(2, 10)]
chiffres = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F]

while True:
    for n in range(10):
        for s in range(7):
            segs[s].value((chiffres[n] >> s) & 1)
        segs[7].value(n % 2)   # point décimal sur les impairs
        print(n)
        time.sleep(0.5)
`,
  }),

  test({
    name: 'led-bar-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'bar1', type: 'led-bar', x: 680, y: 80, attrs: { color: 'GYR' } }],
    wires: () => [
      ...Array.from({ length: 10 }, (_, i) => w('bar1', `A${i + 1}`, 'mcu1', `GP${i + 2}`, 'green')),
      ...Array.from({ length: 10 }, (_, i) => w('bar1', `C${i + 1}`, 'mcu1', `GND.${(i % 4) + 1}`, 'black')),
    ],
    expect: { kind: 'led-bar', partId: 'bar1', firstPin: 'GP2' },
    code: `# Test barre de 10 LED : vumètre qui monte puis descend (anodes sur GP2..GP11).
from machine import Pin
import time

leds = [Pin(n, Pin.OUT) for n in range(2, 12)]

def afficher(niveau):
    for i, led in enumerate(leds):
        led.value(1 if i < niveau else 0)
    print("niveau =", niveau)

while True:
    for n in range(11):
        afficher(n)
        time.sleep(0.15)
    for n in range(10, -1, -1):
        afficher(n)
        time.sleep(0.15)
`,
  }),

  test({
    name: 'slide-switch-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'sw1', type: 'slide-switch', x: 680, y: 100 }],
    wires: () => [
      w('sw1', '1', 'mcu1', 'GP14', 'yellow'),
      w('sw1', '2', 'mcu1', 'GND.5', 'black'),
      w('sw1', '3', 'mcu1', 'GP13', 'orange'),
    ],
    expect: { kind: 'slide-switch', partId: 'sw1', sides: { 1: 'GP14', 3: 'GP13' } },
    code: `# Test interrupteur à glissière : le commun (2) est à GND, le côté connecté = 0.
from machine import Pin
import time

cote1 = Pin(14, Pin.IN, Pin.PULL_UP)
cote3 = Pin(13, Pin.IN, Pin.PULL_UP)
while True:
    if cote1.value() == 0:
        print("Position 1")
    elif cote3.value() == 0:
        print("Position 3")
    else:
        print("(milieu / non connecte)")
    time.sleep(0.3)
`,
  }),

  test({
    name: 'dip-switch-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'dip1', type: 'dip-switch', x: 680, y: 90 }],
    wires: () => [
      ...Array.from({ length: 8 }, (_, i) => w('dip1', `${i + 1}a`, 'mcu1', `GP${i + 2}`, 'yellow')),
      ...Array.from({ length: 8 }, (_, i) => w('dip1', `${i + 1}b`, 'mcu1', `GND.${(i % 4) + 1}`, 'black')),
    ],
    expect: { kind: 'dip-switch', partId: 'dip1', channels: 8 },
    code: `# Test DIP switch x8 : chaque canal fermé tire sa broche (GP2..GP9) à 0.
from machine import Pin
import time

canaux = [Pin(n, Pin.IN, Pin.PULL_UP) for n in range(2, 10)]
while True:
    etat = "".join("1" if c.value() == 0 else "0" for c in canaux)
    print("Canaux :", etat)
    time.sleep(0.4)
`,
  }),

  test({
    name: 'joystick-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'joy1', type: 'joystick', x: 680, y: 80 }],
    wires: () => [
      w('joy1', 'VCC', 'mcu1', '3V3', 'red'),
      w('joy1', 'VERT', 'mcu1', 'GP26', 'green'),
      w('joy1', 'HORZ', 'mcu1', 'GP27', 'blue'),
      w('joy1', 'SEL', 'mcu1', 'GP14', 'yellow'),
      w('joy1', 'GND', 'mcu1', 'GND.7', 'black'),
    ],
    expect: { kind: 'joystick', partId: 'joy1', vert: 'GP26', horz: 'GP27', sel: 'GP14' },
    code: `# Test joystick analogique : X/Y sur les ADC, bouton SEL en pull-up.
from machine import ADC, Pin
import time

axe_y = ADC(26)
axe_x = ADC(27)
bouton = Pin(14, Pin.IN, Pin.PULL_UP)
while True:
    b = "APPUYE" if bouton.value() == 0 else "relache"
    print("Y =", axe_y.read_u16(), " X =", axe_x.read_u16(), " bouton =", b)
    time.sleep(0.25)
`,
  }),

  test({
    name: 'photoresistor-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'ldr1', type: 'photoresistor', x: 680, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('ldr1', 'VCC', 'mcu1', '3V3', 'red'),
      w('ldr1', 'GND', 'mcu1', 'GND.7', 'black'),
      w('ldr1', 'AO', 'mcu1', 'GP26', 'green'),
      w('ldr1', 'DO', 'mcu1', 'GP14', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'ldr1', analog: 'GP26', digital: 'GP14' },
    code: `# Test capteur de lumière (LDR) : AO analogique + DO numérique (actif bas).
from machine import ADC, Pin
import time

ao = ADC(26)
do = Pin(14, Pin.IN)
while True:
    seuil = "SEUIL DEPASSE" if do.value() == 0 else "sous le seuil"
    print("AO =", ao.read_u16(), " DO =", seuil)
    time.sleep(0.3)
`,
  }),

  test({
    name: 'pir-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'pir1', type: 'pir', x: 680, y: 90 }],
    wires: () => [
      w('pir1', 'VCC', 'mcu1', '3V3', 'red'),
      w('pir1', 'OUT', 'mcu1', 'GP14', 'yellow'),
      w('pir1', 'GND', 'mcu1', 'GND.5', 'black'),
    ],
    expect: { kind: 'digital-source', partId: 'pir1', mcuPin: 'GP14' },
    code: `# Test capteur PIR : en simulation, survoler le capteur déclenche le mouvement.
from machine import Pin
import time

pir = Pin(14, Pin.IN)
led = Pin(25, Pin.OUT)
while True:
    mouvement = pir.value() == 1
    led.value(1 if mouvement else 0)
    print("MOUVEMENT !" if mouvement else "rien")
    time.sleep(0.3)
`,
  }),

  test({
    name: 'tilt-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'tilt1', type: 'tilt', x: 680, y: 90 }],
    wires: () => [
      w('tilt1', 'VCC', 'mcu1', '3V3', 'red'),
      w('tilt1', 'OUT', 'mcu1', 'GP14', 'yellow'),
      w('tilt1', 'GND', 'mcu1', 'GND.5', 'black'),
    ],
    expect: { kind: 'digital-source', partId: 'tilt1', mcuPin: 'GP14' },
    code: `# Test capteur d'inclinaison : maintenir le clic incline le capteur.
from machine import Pin
import time

tilt = Pin(14, Pin.IN)
while True:
    print("INCLINE" if tilt.value() == 1 else "droit")
    time.sleep(0.3)
`,
  }),

  test({
    name: 'servo-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'srv1', type: 'servo', x: 680, y: 80, attrs: { horn: 'single', pulsemin: '500', pulsemax: '2500' } }],
    wires: () => [
      w('srv1', 'V+', 'mcu1', 'VBUS', 'red'),
      w('srv1', 'GND', 'mcu1', 'GND.5', 'black'),
      w('srv1', 'PWM', 'mcu1', 'GP15', 'orange'),
    ],
    expect: { kind: 'servo', partId: 'srv1', mcuPin: 'GP15' },
    code: `# Test servomoteur : PWM 50 Hz, impulsions 500/1500/2500 µs = 0/90/180°.
from machine import Pin, PWM
import time

servo = PWM(Pin(15))
servo.freq(50)

def angle(micros):
    servo.duty_u16(int(micros * 65535 / 20000))

while True:
    angle(500)
    print("0 degres")
    time.sleep(1)
    angle(1500)
    print("90 degres")
    time.sleep(1)
    angle(2500)
    print("180 degres")
    time.sleep(1)
`,
  }),

  test({
    name: 'pca9685-pico', board: 'pico', ext: 'py',
    parts: [
      MCU('pico'),
      { id: 'pca1', type: 'pca9685', x: 620, y: 40, attrs: { address: '0x40' } },
      { id: 'srv1', type: 'servo', x: 1000, y: 40, attrs: { horn: 'single', pulsemin: '500', pulsemax: '2500' } },
      { id: 'alim1', type: 'alim', x: 1000, y: 260, attrs: { voltage: '5', maxcurrent: '1' } },
    ],
    wires: () => [
      w('pca1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('pca1', 'VCC', 'mcu1', '3V3', 'red'),
      w('pca1', 'SDA', 'mcu1', 'GP0', 'blue'),
      w('pca1', 'SCL', 'mcu1', 'GP1', 'yellow'),
      w('srv1', 'PWM', 'pca1', 'PWM0', 'orange'),
      w('srv1', 'V+', 'pca1', 'P1.5V', 'red'),
      w('srv1', 'GND', 'pca1', 'P1.GND', 'black'),
      w('alim1', 'V+', 'pca1', 'V+', 'red'),
      w('alim1', 'GND', 'pca1', 'GND.2', 'black'),
    ],
    expect: { kind: 'pca9685', partId: 'pca1', channel: 0, targetId: 'srv1', powered: true },
    code: `# Test PCA9685 : le servo branché sur P1 (canal 0) balaie 0°, 90° puis 180°.
# SANS l'alimentation de laboratoire réglée sur 5 V (courant suffisant) sur le
# bornier V+/GND du module, les sorties ne bougent pas.
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=100000)
PCA = 0x40

def pca_ecrit(reg, val):
    i2c.writeto(PCA, bytes([reg, val]))

# Impulsion du canal : créneau démarré à 0, coupé à durée/20 ms x 4096 pas.
def pca_impulsion(canal, microsecondes):
    off = microsecondes * 4096 // 20000
    i2c.writeto(PCA, bytes([0x06 + 4 * canal, 0x00, 0x00, off & 0xFF, off >> 8]))

pca_ecrit(0x00, 0x10)  # MODE1 : sleep pour régler le prescaler
pca_ecrit(0xFE, 121)   # prescale 50 Hz (25 MHz / (4096 x 50) - 1)
pca_ecrit(0x00, 0x20)  # MODE1 : réveil + auto-incrément

while True:
    for us, angle in ((500, 0), (1500, 90), (2500, 180)):
        pca_impulsion(0, us)
        print(angle, "degres")
        time.sleep(1)
`,
  }),

  test({
    name: 'lcd-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'lcd1', type: 'lcd', x: 620, y: 60, attrs: { pins: 'i2c', address: '0x27', cols: '16', rows: '2', lcdSize: '16x2' } }],
    wires: () => [
      w('lcd1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('lcd1', 'VCC', 'mcu1', 'VBUS', 'red'),
      w('lcd1', 'SDA', 'mcu1', 'GP0', 'blue'),
      w('lcd1', 'SCL', 'mcu1', 'GP1', 'yellow'),
    ],
    expect: { kind: 'i2c-part', partId: 'lcd1' },
    code: `# Test LCD 16x2 en I2C (PCF8574 à l'adresse 0x27) : pilote HD44780 4 bits inline.
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=100000)
ADRESSE = 0x27
RETRO = 0x08   # bit P3 = rétroéclairage

def quartet(nib, rs):
    octet = (nib << 4) | RETRO | (0x01 if rs else 0x00)
    i2c.writeto(ADRESSE, bytes([octet | 0x04]))   # E haut
    i2c.writeto(ADRESSE, bytes([octet]))          # E bas : le quartet est validé

def commande(c):
    quartet(c >> 4, False)
    quartet(c & 0x0F, False)

def donnee(c):
    quartet(c >> 4, True)
    quartet(c & 0x0F, True)

# Initialisation 4 bits (séquence HD44780)
time.sleep_ms(50)
quartet(0x03, False); time.sleep_ms(5)
quartet(0x03, False); quartet(0x03, False); quartet(0x02, False)
commande(0x28)   # 4 bits, 2 lignes
commande(0x0C)   # affichage ON, curseur OFF
commande(0x06)   # incrémentation
commande(0x01)   # effacement
time.sleep_ms(2)

for c in "Kablix LCD I2C":
    donnee(ord(c))
commande(0x80 | 0x40)   # début de la 2e ligne
for c in "sur Pico !":
    donnee(ord(c))
print("Texte envoye au LCD")
`,
  }),

  test({
    name: 'oled-ssd1306-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'oled1', type: 'oled-ssd1306', x: 660, y: 70, attrs: { pins: 'i2c' } }],
    wires: () => [
      w('oled1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('oled1', 'VDD', 'mcu1', '3V3', 'red'),
      w('oled1', 'SDA', 'mcu1', 'GP0', 'blue'),
      w('oled1', 'SCL', 'mcu1', 'GP1', 'yellow'),
    ],
    expect: { kind: 'i2c-part', partId: 'oled1' },
    code: `# Test OLED SSD1306 en I2C (0x3C) : cadre + damier, pilote minimal inline.
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=400000)
ADRESSE = 0x3C

def cmd(*octets):
    i2c.writeto(ADRESSE, bytes([0x00]) + bytes(octets))

# Initialisation classique 128x64
for c in (0xAE, 0xD5, 0x80, 0xA8, 0x3F, 0xD3, 0x00, 0x40, 0x8D, 0x14,
          0x20, 0x00, 0xA1, 0xC8, 0xDA, 0x12, 0x81, 0xCF, 0xD9, 0xF1,
          0xDB, 0x40, 0xA4, 0xA6, 0xAF):
    cmd(c)
cmd(0x21, 0, 127)   # colonnes 0..127
cmd(0x22, 0, 7)     # pages 0..7

# Tampon : cadre + damier central
tampon = bytearray(1024)
for x in range(128):
    tampon[x] |= 0x01          # ligne du haut
    tampon[896 + x] |= 0x80    # ligne du bas
for page in range(8):
    tampon[page * 128] = 0xFF        # bord gauche
    tampon[page * 128 + 127] = 0xFF  # bord droit
for page in range(2, 6):
    for x in range(32, 96):
        if (x // 8 + page) % 2 == 0:
            tampon[page * 128 + x] = 0xFF

# Envoi de la mémoire vidéo par paquets de 16 octets
for i in range(0, 1024, 16):
    i2c.writeto(ADRESSE, bytes([0x40]) + bytes(tampon[i:i + 16]))
print("Dessin envoye a l'OLED")
`,
  }),

  test({
    name: 'ili9341-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'tft1', type: 'ili9341', x: 620, y: 40 }],
    wires: () => [
      w('tft1', 'VCC', 'mcu1', '3V3', 'red'),
      w('tft1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('tft1', 'CS', 'mcu1', 'GP17', 'yellow'),
      w('tft1', 'RST', 'mcu1', 'GP21', 'gray'),
      w('tft1', 'D/C', 'mcu1', 'GP20', 'orange'),
      w('tft1', 'MOSI', 'mcu1', 'GP19', 'blue'),
      w('tft1', 'SCK', 'mcu1', 'GP18', 'green'),
      w('tft1', 'MISO', 'mcu1', 'GP16', 'purple'),
      w('tft1', 'LED', 'mcu1', '3V3', 'red'),
    ],
    expect: { kind: 'spi-device', partId: 'tft1', dcPin: 'GP20', csPin: 'GP17' },
    code: `# Test écran TFT ILI9341 (SPI) : init registres bruts + carré rouge 100x100.
from machine import Pin, SPI
import time

cs = Pin(17, Pin.OUT, value=1)
dc = Pin(20, Pin.OUT, value=0)
rst = Pin(21, Pin.OUT, value=1)
spi = SPI(0, baudrate=10_000_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))

def commande(c, donnees=b""):
    cs.value(0)
    dc.value(0)
    spi.write(bytes([c]))
    if donnees:
        dc.value(1)
        spi.write(donnees)
    cs.value(1)

# Reset matériel puis réveil
rst.value(0); time.sleep_ms(10); rst.value(1); time.sleep_ms(10)
commande(0x01); time.sleep_ms(5)    # soft reset
commande(0x11); time.sleep_ms(5)    # sortie de veille
commande(0x3A, b"\\x55")             # format de pixel RGB565
commande(0x29)                       # affichage ON

# Fenêtre 100x100 en haut à gauche puis remplissage rouge
commande(0x2A, b"\\x00\\x00\\x00\\x63")   # colonnes 0..99
commande(0x2B, b"\\x00\\x00\\x00\\x63")   # lignes 0..99
cs.value(0)
dc.value(0)
spi.write(b"\\x2C")                  # RAMWR
dc.value(1)
ligne = b"\\xF8\\x00" * 100           # rouge RGB565, une ligne
for _ in range(100):
    spi.write(ligne)
cs.value(1)
print("Carre rouge envoye au TFT")
`,
  }),

  test({
    name: 'microsd-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'sd1', type: 'microsd', x: 680, y: 90 }],
    wires: () => [
      w('sd1', 'VCC', 'mcu1', '3V3', 'red'),
      w('sd1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('sd1', 'CS', 'mcu1', 'GP17', 'yellow'),
      w('sd1', 'DI', 'mcu1', 'GP19', 'blue'),
      w('sd1', 'DO', 'mcu1', 'GP16', 'purple'),
      w('sd1', 'SCK', 'mcu1', 'GP18', 'green'),
    ],
    expect: { kind: 'spi-device', partId: 'sd1', dcPin: null, csPin: 'GP17' },
    code: `# Test carte microSD (SPI) : initialisation protocole brut (CMD0/CMD8/ACMD41).
from machine import Pin, SPI
import time

cs = Pin(17, Pin.OUT, value=1)
spi = SPI(0, baudrate=400_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))

def cmd(index, argument, crc):
    trame = bytes([
        0x40 | index,
        (argument >> 24) & 0xFF, (argument >> 16) & 0xFF,
        (argument >> 8) & 0xFF, argument & 0xFF, crc,
    ])
    spi.write(trame)
    for _ in range(8):
        r = spi.read(1, 0xFF)[0]
        if r != 0xFF:
            return r
    return 0xFF

spi.write(b"\\xFF" * 10)      # 80 coups d'horloge, CS haut : mode SPI
cs.value(0)
r0 = cmd(0, 0, 0x95)          # CMD0 : retour à l'état idle (attendu 0x01)
r8 = cmd(8, 0x1AA, 0x87)      # CMD8 : tension + motif (attendu 0x01)
spi.read(4, 0xFF)             # fin de la réponse R7
resultat = 0xFF
for _ in range(200):
    cmd(55, 0, 0x65)          # CMD55 : préfixe de commande applicative
    resultat = cmd(41, 0x40000000, 0x77)   # ACMD41 : init (attendu 0x00)
    if resultat == 0:
        break
cs.value(1)
print("CMD0 =", r0, " CMD8 =", r8)
print("Carte SD detectee : init OK" if resultat == 0 else "ECHEC de l'init SD")
`,
  }),

  test({
    name: 'neopixel-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'np1', type: 'neopixel', x: 680, y: 100 }],
    wires: () => [
      w('np1', 'VDD', 'mcu1', 'VBUS', 'red'),
      w('np1', 'VSS', 'mcu1', 'GND.1', 'black'),
      w('np1', 'DIN', 'mcu1', 'GP0', 'green'),
    ],
    expect: { kind: 'neopixel', partId: 'np1', mcuPin: 'GP0', count: 1 },
    code: `# Test NeoPixel (1 pixel WS2812) : rouge, vert, bleu en boucle.
from machine import Pin
import neopixel
import time

pixel = neopixel.NeoPixel(Pin(0), 1)
couleurs = [("Rouge", (255, 0, 0)), ("Vert", (0, 255, 0)), ("Bleu", (0, 0, 255))]
while True:
    for nom, rgb in couleurs:
        pixel[0] = rgb
        pixel.write()
        print(nom)
        time.sleep(0.6)
`,
  }),

  test({
    name: 'neopixel-matrix-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'npm1', type: 'neopixel-matrix', x: 660, y: 50, attrs: { rows: '8', cols: '8' } }],
    wires: () => [
      w('npm1', 'VCC', 'mcu1', 'VBUS', 'red'),
      w('npm1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('npm1', 'DIN', 'mcu1', 'GP0', 'green'),
    ],
    expect: { kind: 'neopixel', partId: 'npm1', mcuPin: 'GP0', count: 64 },
    code: `# Test matrice NeoPixel 8x8 (64 pixels) : diagonale blanche + dégradé.
from machine import Pin
import neopixel
import time

matrice = neopixel.NeoPixel(Pin(0), 64)
for y in range(8):
    for x in range(8):
        if x == y:
            matrice[y * 8 + x] = (255, 255, 255)
        else:
            matrice[y * 8 + x] = (x * 32, 0, y * 32)
matrice.write()
print("Matrice remplie")
`,
  }),

  test({
    name: 'led-ring-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'ring1', type: 'led-ring', x: 680, y: 60, attrs: { pixels: '16' } }],
    wires: () => [
      w('ring1', 'VCC', 'mcu1', 'VBUS', 'red'),
      w('ring1', 'GND', 'mcu1', 'GND.1', 'black'),
      w('ring1', 'DIN', 'mcu1', 'GP0', 'green'),
    ],
    expect: { kind: 'neopixel', partId: 'ring1', mcuPin: 'GP0', count: 16 },
    code: `# Test anneau NeoPixel (16 pixels) : chenillard bleu.
from machine import Pin
import neopixel
import time

anneau = neopixel.NeoPixel(Pin(0), 16)
while True:
    for i in range(16):
        anneau.fill((0, 0, 0))
        anneau[i] = (0, 80, 255)
        anneau.write()
        time.sleep(0.1)
`,
  }),

  test({
    name: 'ntc-temp-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'ntc1', type: 'ntc-temp', x: 680, y: 90, attrs: { temperature: '25' } }],
    wires: () => [
      w('ntc1', 'VCC', 'mcu1', '3V3', 'red'),
      w('ntc1', 'GND', 'mcu1', 'GND.7', 'black'),
      w('ntc1', 'OUT', 'mcu1', 'GP26', 'green'),
    ],
    expect: { kind: 'analog-source', partId: 'ntc1', mcuPin: 'GP26' },
    code: `# Test capteur de température NTC : lecture analogique sur GP26 (ADC0).
from machine import ADC
import time

capteur = ADC(26)
while True:
    print("ADC0 =", capteur.read_u16())
    time.sleep(0.3)
`,
  }),

  test({
    name: 'gas-sensor-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'gas1', type: 'gas-sensor', x: 680, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('gas1', 'VCC', 'mcu1', '3V3', 'red'),
      w('gas1', 'GND', 'mcu1', 'GND.7', 'black'),
      w('gas1', 'AOUT', 'mcu1', 'GP26', 'green'),
      w('gas1', 'DOUT', 'mcu1', 'GP14', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'gas1', analog: 'GP26', digital: 'GP14' },
    code: `# Test capteur de gaz (MQ) : AOUT analogique + DOUT numérique (actif bas).
from machine import ADC, Pin
import time

aout = ADC(26)
dout = Pin(14, Pin.IN)
while True:
    etat = "GAZ DETECTE" if dout.value() == 0 else "rien"
    print("AOUT =", aout.read_u16(), " DOUT =", etat)
    time.sleep(0.3)
`,
  }),

  test({
    name: 'heartbeat-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'hb1', type: 'heartbeat', x: 680, y: 90, attrs: { bpm: '72' } }],
    wires: () => [
      w('hb1', 'VCC', 'mcu1', '3V3', 'red'),
      w('hb1', 'GND', 'mcu1', 'GND.7', 'black'),
      w('hb1', 'OUT', 'mcu1', 'GP26', 'green'),
    ],
    expect: { kind: 'analog-source', partId: 'hb1', mcuPin: 'GP26' },
    code: `# Test capteur de pouls : le signal analogique bat au rythme cardiaque.
from machine import ADC
import time

pouls = ADC(26)
while True:
    print("pouls =", pouls.read_u16())
    time.sleep(0.05)
`,
  }),

  test({
    name: 'flame-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'fl1', type: 'flame', x: 680, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('fl1', 'VCC', 'mcu1', '3V3', 'red'),
      w('fl1', 'GND', 'mcu1', 'GND.7', 'black'),
      w('fl1', 'AOUT', 'mcu1', 'GP26', 'green'),
      w('fl1', 'DOUT', 'mcu1', 'GP14', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'fl1', analog: 'GP26', digital: 'GP14' },
    code: `# Test capteur de flamme : AOUT baisse quand la flamme approche, DOUT actif bas.
from machine import ADC, Pin
import time

aout = ADC(26)
dout = Pin(14, Pin.IN)
while True:
    etat = "FLAMME !" if dout.value() == 0 else "rien"
    print("AOUT =", aout.read_u16(), " DOUT =", etat)
    time.sleep(0.3)
`,
  }),

  test({
    name: 'sound-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'snd1', type: 'sound', x: 680, y: 90, attrs: { sensitivity: '50' } }],
    wires: () => [
      w('snd1', 'VCC', 'mcu1', '3V3', 'red'),
      w('snd1', 'GND', 'mcu1', 'GND.7', 'black'),
      w('snd1', 'AOUT', 'mcu1', 'GP26', 'green'),
      w('snd1', 'DOUT', 'mcu1', 'GP14', 'yellow'),
    ],
    expect: { kind: 'ao-do', partId: 'snd1', analog: 'GP26', digital: 'GP14' },
    code: `# Test capteur de son : AOUT analogique + DOUT numérique (actif bas).
from machine import ADC, Pin
import time

aout = ADC(26)
dout = Pin(14, Pin.IN)
while True:
    etat = "SON DETECTE" if dout.value() == 0 else "silence"
    print("AOUT =", aout.read_u16(), " DOUT =", etat)
    time.sleep(0.3)
`,
  }),

  test({
    name: 'dht22-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'dht1', type: 'dht22', x: 680, y: 90, attrs: { temperature: '22', humidity: '50' } }],
    wires: () => [
      w('dht1', 'VCC', 'mcu1', '3V3', 'red'),
      w('dht1', 'DATA', 'mcu1', 'GP14', 'green'),
      w('dht1', 'GND', 'mcu1', 'GND.5', 'black'),
    ],
    expect: { kind: 'dht22', partId: 'dht1', mcuPin: 'GP14' },
    code: `# Test DHT22 : température et humidité via le module dht de MicroPython.
from machine import Pin
import dht
import time

capteur = dht.DHT22(Pin(14))
while True:
    time.sleep(2.1)   # le DHT22 ne répond qu'une fois toutes les 2 s
    try:
        capteur.measure()
        print("T =", capteur.temperature(), "C   H =", capteur.humidity(), "%")
    except OSError as e:
        print("lecture ratee :", e)
`,
  }),

  test({
    name: 'keypad-pico', board: 'pico', ext: 'py',
    parts: [MCU('pico'), { id: 'kp1', type: 'keypad', x: 620, y: 40, attrs: { columns: '4' } }],
    wires: () => [
      w('kp1', 'R1', 'mcu1', 'GP2', 'yellow'),
      w('kp1', 'R2', 'mcu1', 'GP3', 'yellow'),
      w('kp1', 'R3', 'mcu1', 'GP4', 'yellow'),
      w('kp1', 'R4', 'mcu1', 'GP5', 'yellow'),
      w('kp1', 'C1', 'mcu1', 'GP6', 'green'),
      w('kp1', 'C2', 'mcu1', 'GP7', 'green'),
      w('kp1', 'C3', 'mcu1', 'GP8', 'green'),
      w('kp1', 'C4', 'mcu1', 'GP9', 'green'),
    ],
    expect: { kind: 'keypad', partId: 'kp1', rows: ['GP2', 'GP3', 'GP4', 'GP5'], cols: ['GP6', 'GP7', 'GP8', 'GP9'] },
    code: `# Test clavier matriciel 4x4 : balayage des lignes, colonnes en pull-up.
from machine import Pin
import time

lignes = [Pin(n, Pin.OUT, value=1) for n in (2, 3, 4, 5)]
colonnes = [Pin(n, Pin.IN, Pin.PULL_UP) for n in (6, 7, 8, 9)]
touches = [
    ["1", "2", "3", "A"],
    ["4", "5", "6", "B"],
    ["7", "8", "9", "C"],
    ["*", "0", "#", "D"],
]

while True:
    for i, ligne in enumerate(lignes):
        ligne.value(0)
        for j, colonne in enumerate(colonnes):
            if colonne.value() == 0:
                print("Touche :", touches[i][j])
        ligne.value(1)
    time.sleep(0.05)
`,
  }),
];

export const TESTS = [...BOARD_TESTS, ...AVR_TESTS, ...PICO_TESTS];
