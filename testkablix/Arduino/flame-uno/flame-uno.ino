// Test capteur de flamme : AOUT baisse quand la flamme approche, DOUT actif bas.
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.print("AOUT = ");
  Serial.print(analogRead(A0));
  Serial.print("  DOUT = ");
  Serial.println(digitalRead(2) == LOW ? "FLAMME !" : "rien");
  delay(300);
}
