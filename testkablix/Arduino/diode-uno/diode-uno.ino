// Test diode : les deux broches passent au niveau haut en meme temps.
// Seule la LED verte s'allume — la diode de la branche rouge est montee a
// l'envers (cathode cote broche 9) et bloque le passage du courant.
const int BRANCHE_PASSANTE = 8;
const int BRANCHE_BLOQUEE = 9;

void setup() {
  pinMode(BRANCHE_PASSANTE, OUTPUT);
  pinMode(BRANCHE_BLOQUEE, OUTPUT);
}

void loop() {
  digitalWrite(BRANCHE_PASSANTE, HIGH);
  digitalWrite(BRANCHE_BLOQUEE, HIGH);
  delay(1000);
  digitalWrite(BRANCHE_PASSANTE, LOW);
  digitalWrite(BRANCHE_BLOQUEE, LOW);
  delay(1000);
}
