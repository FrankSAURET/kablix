// Test potentiomètre ajustable (trimmer 100 kΩ) : lecture 0-1023 sur A0.
void setup() {
  Serial.begin(115200);
}

void loop() {
  int valeur = analogRead(A0);
  Serial.print("A0 = ");
  Serial.println(valeur);
  delay(250);
}
