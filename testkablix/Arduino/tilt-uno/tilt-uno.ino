// Test capteur d'inclinaison : en simulation, maintenir le clic incline le capteur.
void setup() {
  pinMode(2, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.println(digitalRead(2) == HIGH ? "INCLINE" : "droit");
  delay(300);
}
