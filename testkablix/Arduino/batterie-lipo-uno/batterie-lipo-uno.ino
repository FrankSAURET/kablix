// Test pile batterie-lipo : 4,2 V sur VIN : la Uno refuse de démarrer (il faut au moins 6,2 V).
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
