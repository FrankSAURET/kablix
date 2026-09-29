// Test pile pile-9v : 9,5 V neuve sur VIN : la Uno tourne jusqu'à ce que la pile passe sous 6,2 V.
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
