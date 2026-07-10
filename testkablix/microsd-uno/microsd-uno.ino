// Test carte microSD (SPI) : SD.begin doit réussir (carte détectée).
// Note : pas de système de fichiers FAT préchargé, open() échouera — c'est normal.
#include <SD.h>

void setup() {
  Serial.begin(115200);
  if (SD.begin(4)) {
    Serial.println("Carte SD detectee : init OK");
  } else {
    Serial.println("ECHEC de l'init SD");
  }
}

void loop() {
  delay(1000);
}
