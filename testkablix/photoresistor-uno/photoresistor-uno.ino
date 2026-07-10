// Test capteur de lumière (LDR) : sortie analogique AO + sortie numérique DO
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
