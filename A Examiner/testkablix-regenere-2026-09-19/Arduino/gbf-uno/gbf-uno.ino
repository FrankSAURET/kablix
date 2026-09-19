// Test generateur BF : sinus de 10 Hz, 0 a 5 V (5 V crete-a-crete sur 2,5 V
// de decalage), lu sur A0. En simulation, les quatre boutons de l'appareil font
// varier forme, frequence, amplitude, decalage et rapport cyclique a la souris.
void setup() {
  Serial.begin(115200);
  Serial.println("Generateur BF sur A0");
}

void loop() {
  int brut = analogRead(A0);
  Serial.print("A0 = ");
  Serial.print(brut);
  Serial.print("  soit ");
  Serial.print(brut * 5.0 / 1023.0, 2);
  Serial.println(" V");
  delay(20);                       // ~50 points par periode a 10 Hz
}
