// Test pile pile-4aa : 6,4 V neuves sur VIN : la Uno démarre, puis s'éteint sous 6,2 V (quelques secondes avec 1 mAh).
// La LED L clignote et la console compte les secondes tant que la carte tourne.
unsigned long secondes = 0;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
  secondes++;
  Serial.println(secondes);
}
