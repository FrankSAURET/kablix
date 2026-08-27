// Test capteur de lumière Grove : lecture analogique sur A1.
// En simulation, le curseur du capteur règle l'éclairement de 0 lx à la pleine
// échelle (500 lx par défaut) : 0 lx donne 0 V (valeur 0), la pleine échelle
// donne 5 V (valeur 1023).
const int CAPTEUR = A1;
const int SEUIL_SOMBRE = 200;

void setup() {
  Serial.begin(115200);
}

void loop() {
  int mesure = analogRead(CAPTEUR);
  Serial.print("lumiere = ");
  Serial.print(mesure);
  Serial.println(mesure < SEUIL_SOMBRE ? "  -> SOMBRE, on allume" : "  -> assez clair");
  delay(300);
}
