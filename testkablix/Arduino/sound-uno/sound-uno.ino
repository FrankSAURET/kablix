// Test capteur de son : AOUT analogique + DOUT numérique (actif bas).
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.print("AOUT = ");
  Serial.print(analogRead(A0));
  Serial.print("  DOUT = ");
  Serial.println(digitalRead(2) == LOW ? "SON DETECTE" : "silence");
  delay(300);
}
