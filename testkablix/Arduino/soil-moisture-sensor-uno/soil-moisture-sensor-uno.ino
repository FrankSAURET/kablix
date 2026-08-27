// Test capteur d'humidité du sol : lecture analogique sur A0.
// En simulation, le curseur du capteur règle l'humidité de 0 à 100 % :
// 0 % donne 0 V (valeur 0), 100 % donne 5 V (valeur 1023).
const int SONDE = A0;
const int SEUIL_SEC = 350;

void setup() {
  Serial.begin(115200);
}

void loop() {
  int mesure = analogRead(SONDE);
  Serial.print("humidite = ");
  Serial.print(mesure);
  Serial.println(mesure < SEUIL_SEC ? "  -> TROP SEC, il faut arroser" : "  -> ok");
  delay(300);
}
