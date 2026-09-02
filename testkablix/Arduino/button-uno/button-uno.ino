// Test bouton poussoir : appui = LOW (pull-up interne), recopié sur la LED D13.
bool appuye;
bool appuye2;
bool appuye3;
int BP = 3;   // BP3 : bouton vers le +5 V, rappel 10 k vers la masse

void setup(){
  pinMode(2, INPUT_PULLUP);
  pinMode(1, INPUT_PULLUP);
  pinMode(BP, INPUT);
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  appuye = (digitalRead(2) == LOW);
  appuye2 = (digitalRead(1) == LOW);
  appuye3 = (digitalRead(BP) == HIGH);
  digitalWrite(13, appuye || appuye2 || appuye3 ? HIGH : LOW);
  Serial.println(appuye || appuye2 || appuye3 ? "APPUYE" : "relache");
  delay(200);
}
