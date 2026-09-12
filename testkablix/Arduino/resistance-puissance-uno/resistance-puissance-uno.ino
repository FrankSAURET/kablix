// Test resistances de puissance : les deux sont branchees en direct sur
// l'alimentation de laboratoire reglee a 12 V.
//   RP1 (4,7 ohms, boitier aluminium 10 W) dissipe 30 W : elle explose.
//   RP2 (470 ohms, boitier ceramique 10 W) dissipe 0,3 W : elle tient.
// La LED clignote pour que la carte fasse quelque chose pendant ce temps.
void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(115200);
  Serial.println("resistances de puissance sous 12 V");
}

void loop() {
  digitalWrite(9, HIGH);
  delay(500);
  digitalWrite(9, LOW);
  delay(500);
}
