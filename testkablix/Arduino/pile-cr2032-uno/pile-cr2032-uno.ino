// Test pile pile-cr2032 : 3 V sur la broche 5V : la Uno refuse de démarrer (il faut 4,5 à 5,5 V).
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
