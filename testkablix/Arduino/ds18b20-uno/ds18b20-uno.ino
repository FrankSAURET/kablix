// Test DS18B20 : deux capteurs de température sur le MÊME fil (1-Wire Dallas).
// En simulation, chaque composant porte un curseur « Température » : ce qu'on y
// règle est ce que le programme lit.
// Résistance de 4,7 kohms entre la ligne Data et 5 V : obligatoire.
#include <OneWire.h>
#include <DallasTemperature.h>

OneWire fil(2);
DallasTemperature capteurs(&fil);

void setup() {
  Serial.begin(115200);
  capteurs.begin();
  Serial.print("capteurs trouves : ");
  Serial.println(capteurs.getDeviceCount());
}

void loop() {
  capteurs.requestTemperatures();   // 750 ms de conversion en 12 bits
  for (int i = 0; i < capteurs.getDeviceCount(); i++) {
    float t = capteurs.getTempCByIndex(i);
    Serial.print("T");
    Serial.print(i);
    Serial.print(" = ");
    if (t == DEVICE_DISCONNECTED_C) Serial.println("lecture ratee");
    else {
      Serial.print(t);
      Serial.println(" C");
    }
  }
  delay(1000);
}
