// Test interrupteur à glissière : le commun (2) est à GND, les côtés 1 et 3
// sont lus en pull-up : le côté connecté passe à LOW.
void setup() {
  pinMode(7, INPUT_PULLUP);
  pinMode(8, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  if (digitalRead(7) == LOW) Serial.println("Position 1");
  else if (digitalRead(8) == LOW) Serial.println("Position 3");
  else Serial.println("(milieu / non connecte)");
  delay(300);
}
