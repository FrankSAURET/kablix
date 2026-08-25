// Test phototransistor : 5V -> collecteur, émetteur -> A0 -> 1 kohm -> GND.
// La résistance est OBLIGATOIRE : sans elle, rien ne transforme le courant du
// phototransistor en tension lisible.
// En simulation, le curseur de luminosité fait monter la lecture.
void setup() {
  Serial.begin(115200);
}

void loop() {
  int brut = analogRead(A0);
  Serial.print("A0 = ");
  Serial.print(brut);
  Serial.println(brut > 700 ? "  (bien eclaire)" : "  (sombre)");
  delay(300);
}
