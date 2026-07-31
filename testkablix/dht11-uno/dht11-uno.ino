// Test DHT11 : meme protocole 1-wire que le DHT22, mais des valeurs ENTIERES
// (pas de dixieme), 20 a 90 % HR et 0 a 50 degres C.
#include <DHT.h>

DHT dht(2, DHT11);

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  delay(1100);   // le DHT11 ne repond qu'une fois par seconde
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) {
    Serial.println("lecture ratee");
    return;
  }
  Serial.print("T = ");
  Serial.print(t);
  Serial.print(" C   H = ");
  Serial.print(h);
  Serial.println(" %");
}
