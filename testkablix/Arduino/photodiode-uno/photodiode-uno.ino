// Test photodiode : 5V -> cathode, anode -> A0 -> 100 kohm -> GND.
// La photodiode travaille en INVERSE (cathode au plus) et laisse passer cent
// fois moins de courant qu'un phototransistor : d'ou la grosse resistance.
// En simulation, le curseur de luminosite fait monter la lecture.
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
