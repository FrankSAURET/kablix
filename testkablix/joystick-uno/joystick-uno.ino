// Test joystick analogique : X/Y en analogique, bouton SEL en pull-up.
void setup() {
  pinMode(2, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  Serial.print("Y=");
  Serial.print(analogRead(A0));
  Serial.print("  X=");
  Serial.print(analogRead(A1));
  Serial.print("  bouton=");
  Serial.println(digitalRead(2) == LOW ? "APPUYE" : "relache");
  delay(250);
}
