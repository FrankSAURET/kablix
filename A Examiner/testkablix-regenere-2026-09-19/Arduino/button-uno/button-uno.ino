// Test bouton poussoir : appui = LOW (pull-up interne), recopié sur la LED D13.
void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool appuye = (digitalRead(2) == LOW);
  digitalWrite(13, appuye ? HIGH : LOW);
  Serial.println(appuye ? "APPUYE" : "relache");
  delay(200);
}
