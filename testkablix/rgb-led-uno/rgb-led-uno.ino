// Test LED RGB (cathode commune) : fondu sur chaque canal PWM.
const int R = 9, G = 10, B = 11;

void setup() {
  Serial.begin(115200);
}

void fondu(int broche, const char* nom) {
  Serial.println(nom);
  for (int v = 0; v <= 255; v += 5) { analogWrite(broche, v); delay(10); }
  analogWrite(broche, 0);
}

void loop() {
  fondu(R, "Rouge");
  fondu(G, "Vert");
  fondu(B, "Bleu");
  // Blanc : les trois canaux ensemble.
  analogWrite(R, 255); analogWrite(G, 255); analogWrite(B, 255);
  Serial.println("Blanc");
  delay(800);
  analogWrite(R, 0); analogWrite(G, 0); analogWrite(B, 0);
}
