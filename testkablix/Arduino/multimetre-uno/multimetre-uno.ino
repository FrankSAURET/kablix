// Test multimetre : les deux appareils de la planche mesurent en meme temps.
// M1 est un VOLTMETRE, branche EN PARALLELE sur le pont diviseur
// D13 -> R1 1 kohm -> point A -> R2 1 kohm -> masse : il lit environ 2,5 V
// quand D13 est haut, 0 V quand D13 est bas.
// M2 est un AMPEREMETRE, branche EN SERIE dans la branche 5V -> R3 1 kohm ->
// masse : il lit environ 5 mA en permanence (5 V / 1 kohm).
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(13, HIGH);
  Serial.println("D13 haut -> voltmetre ~2,5 V");
  delay(1000);
  digitalWrite(13, LOW);
  Serial.println("D13 bas  -> voltmetre ~0 V");
  delay(1000);
}
