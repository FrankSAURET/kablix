// Test bouton poussoir : appui = LOW (pull-up interne), recopié sur la LED D13.
bool appuye;
bool appuye2;

void setup(){
  pinMode(2, INPUT_PULLUP);
  pinMode(1, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  appuye = (digitalRead(2) == LOW);
  appuye2 = (digitalRead(1) == LOW);
  digitalWrite(13, appuye || appuye2 ? HIGH : LOW);
  Serial.println(appuye || appuye2 ? "APPUYE" : "relache");
  delay(200);
}
