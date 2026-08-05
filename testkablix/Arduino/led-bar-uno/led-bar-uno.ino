// Test barre de 10 LED : vumètre qui monte puis descend (anodes sur D2..D11).
void setup() {
  for (int i = 2; i <= 11; i++) pinMode(i, OUTPUT);
  Serial.begin(115200);
}

void afficher(int niveau) {
  for (int i = 0; i < 10; i++) digitalWrite(2 + i, i < niveau ? HIGH : LOW);
  Serial.print("niveau = ");
  Serial.println(niveau);
}

void loop() {
  for (int n = 0; n <= 10; n++) { afficher(n); delay(150); }
  for (int n = 10; n >= 0; n--) { afficher(n); delay(150); }
}
