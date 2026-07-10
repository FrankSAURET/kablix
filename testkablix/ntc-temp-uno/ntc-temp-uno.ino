// Test capteur de température NTC : lecture analogique sur A0
// (en simulation, la température se règle avec le curseur du capteur).
void setup() {
  Serial.begin(115200);
}

void loop() {
  Serial.print("A0 = ");
  Serial.println(analogRead(A0));
  delay(300);
}
