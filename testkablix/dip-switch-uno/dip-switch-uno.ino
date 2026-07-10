// Test DIP switch x8 : chaque canal fermé tire sa broche (D2..D9) à LOW.
void setup() {
  for (int i = 2; i <= 9; i++) pinMode(i, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  Serial.print("Canaux : ");
  for (int i = 0; i < 8; i++) Serial.print(digitalRead(2 + i) == LOW ? "1" : "0");
  Serial.println();
  delay(400);
}
