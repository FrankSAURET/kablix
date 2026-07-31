// Test bouton 6 mm : identique au bouton standard, sur D3.
void setup() {
  pinMode(3, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool appuye = (digitalRead(3) == LOW);
  digitalWrite(13, appuye ? HIGH : LOW);
  Serial.println(appuye ? "APPUYE" : "relache");
  delay(200);
}
