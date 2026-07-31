// Test résistance : en série avec une LED sur D8 (continuité du courant).
void setup() {
  pinMode(8, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(8, HIGH);
  Serial.println("LED allumee a travers la resistance");
  delay(700);
  digitalWrite(8, LOW);
  delay(300);
}
