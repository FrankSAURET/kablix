// Test barrière optique : en simulation, cocher « Obstacle » fait monter la
// barre entre les deux boîtiers et coupe le faisceau.
// Sortie à collecteur ouvert : rappel de 10 kohms vers 5 V.
// Faisceau libre -> sortie à 0 ; faisceau coupé -> sortie à 1.
const int BARRIERE = 2;

void setup() {
  pinMode(BARRIERE, INPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool obstacle = digitalRead(BARRIERE) == HIGH;
  digitalWrite(LED_BUILTIN, obstacle ? HIGH : LOW);
  Serial.println(obstacle ? "OBSTACLE" : "libre");
  delay(300);
}
