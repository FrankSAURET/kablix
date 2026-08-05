// Test des trois résistances variables nues : chacune forme un pont
// diviseur avec une résistance fixe de sa valeur de repos.
//   A0 : LDR 50 kΩ à 1 lx + 50 kΩ   (curseur = éclairement)
//   A1 : CTN 10 kΩ à 25 °C + 10 kΩ  (curseur = température)
//   A2 : CTP 2 kΩ à 25 °C + 2 kΩ    (curseur = température)
// En simulation : éclairer la LDR et chauffer la CTN FAIT MONTER la lecture,
// chauffer la CTP la fait descendre.
void setup() {
  Serial.begin(115200);
}

void loop() {
  Serial.print("LDR A0 = ");
  Serial.print(analogRead(A0));
  Serial.print(" | CTN A1 = ");
  Serial.print(analogRead(A1));
  Serial.print(" | CTP A2 = ");
  Serial.println(analogRead(A2));
  delay(300);
}
