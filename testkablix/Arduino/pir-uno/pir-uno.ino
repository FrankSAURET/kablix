// Test capteur PIR : en simulation, survoler le capteur déclenche le mouvement.
void setup() {
  pinMode(2, INPUT);
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool mouvement = (digitalRead(2) == HIGH);
  digitalWrite(13, mouvement ? HIGH : LOW);
  Serial.println(mouvement ? "MOUVEMENT !" : "rien");
  delay(300);
}
