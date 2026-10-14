// Test régulateur L78SxxCV (5 V) : sortie lue sur A0.
// Entrée : pile 9 V (9,5 V). Sortie attendue : 5 V, soit 1023 pas.
// Essais : mettre la tension sur 12 V dans l'inspecteur (la pile ne donne que
// 9,5 V : la sortie tombe à 7,5 V, marge de 2 V) ; ajouter une charge qui tire
// plus que le courant max : la tension s'effondre.
const int SORTIE = A0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  float volts = analogRead(SORTIE) * 5.0 / 1023.0;
  Serial.print("sortie = ");
  Serial.print(volts, 2);
  Serial.println(" V");
  delay(500);
}
