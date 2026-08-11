// Test capteur à effet Hall : en simulation, glisser l'aimant vers le capteur.
// Sortie à drain ouvert, ACTIVE BASSE : rappel de 10 kohms vers 5 V.
const int HALL = 2;

void setup() {
  pinMode(HALL, INPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool aimant = digitalRead(HALL) == LOW;
  digitalWrite(LED_BUILTIN, aimant ? HIGH : LOW);
  Serial.println(aimant ? "AIMANT" : "rien");
  delay(300);
}
