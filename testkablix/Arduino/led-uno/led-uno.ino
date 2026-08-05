// Test LED : clignote sur D13 (via une résistance de 220 ohms).
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(13, HIGH);   // LED allumée
  Serial.println("LED ON");
  delay(500);
  digitalWrite(13, LOW);    // LED éteinte
  Serial.println("LED OFF");
  delay(500);
}
