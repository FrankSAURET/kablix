// Test buzzer : niveau haut simple puis tone() (halo actif sur le buzzer).
void setup() {
  pinMode(8, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(8, HIGH);           // buzzer actif (niveau haut)
  Serial.println("Buzzer ON");
  delay(400);
  digitalWrite(8, LOW);
  Serial.println("Buzzer OFF");
  delay(400);
  tone(8, 440, 300);               // la 440 Hz pendant 300 ms
  Serial.println("tone(440 Hz)");
  delay(600);
}
