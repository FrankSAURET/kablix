// Test DHT22 : température et humidité sur la ligne DATA. Un seul fil de
// données, mais ce n'est PAS du 1-Wire Dallas (voir le test ds18b20-uno) : le
// DHT22 débite sa trame tout seul, sans adresse et sans dialogue.
#include <DHT.h>

DHT dht(2, DHT22);

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  delay(2100);   // le DHT22 ne répond qu'une fois toutes les 2 s
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
