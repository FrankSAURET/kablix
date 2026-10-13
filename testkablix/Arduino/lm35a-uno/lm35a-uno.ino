// Test capteur de température LM35A : lecture analogique sur A0.
// 10 mV par °C : 25 °C donne 250 mV, soit une valeur de 51 (5 V sur 1023 pas).
const int CAPTEUR = A0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  float volts = analogRead(CAPTEUR) * 5.0 / 1023.0;
  float degres = volts * 100.0;
  Serial.print("temperature = ");
  Serial.print(degres, 1);
  Serial.println(" C");
  delay(500);
}
