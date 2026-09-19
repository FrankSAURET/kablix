// Test capteur de pouls : le signal analogique bat au rythme cardiaque.
void setup() {
  Serial.begin(115200);
}

void loop() {
  int v = analogRead(A0);
  Serial.print("pouls = ");
  Serial.println(v);
  delay(50);
}
