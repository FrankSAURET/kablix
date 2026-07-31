// Test ventilateur. Le premier tourne : il est branche sur l'alimentation de
// laboratoire (5 V, 1 A), qui fournit largement ses 850 mA.
// Le second est cable sur la broche 9 en PWM : il ne demarre JAMAIS, une sortie
// Arduino ne debite que 40 mA. En vrai comme en simulation, il faut un
// transistor (ou un MOSFET) commande par la broche pour piloter un moteur.
const int COMMANDE = 9;

void setup() {
  Serial.begin(115200);
  pinMode(COMMANDE, OUTPUT);
  Serial.println("Le ventilateur de la broche 9 ne tournera pas : courant insuffisant.");
}

void loop() {
  for (int v = 0; v <= 255; v += 5) {
    analogWrite(COMMANDE, v);
    delay(40);
  }
  for (int v = 255; v >= 0; v -= 5) {
    analogWrite(COMMANDE, v);
    delay(40);
  }
}
