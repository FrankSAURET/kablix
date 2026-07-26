// Test carte microSD (SPI) : initialisation, écriture d'un fichier, relecture.
// La carte simulée est livrée FORMATÉE en FAT16, comme une carte du commerce.
#include <SD.h>

const int BROCHE_CS = 4;

void setup() {
  Serial.begin(115200);

  if (!SD.begin(BROCHE_CS)) {
    Serial.println("ECHEC de l'init SD");
    return;
  }
  Serial.println("Carte SD detectee : init OK");

  // Écriture (le fichier est créé s'il n'existe pas, sinon on ajoute à la fin).
  File f = SD.open("essai.txt", FILE_WRITE);
  if (f) {
    f.println("Bonjour depuis Kablix !");
    f.print("Duree depuis le demarrage : ");
    f.print(millis());
    f.println(" ms");
    f.close();
    Serial.println("Ecriture de essai.txt : OK");
  } else {
    Serial.println("ECHEC de l'ouverture en ecriture");
  }

  // Relecture, caractère par caractère, comme l'exemple ReadWrite d'Arduino.
  f = SD.open("essai.txt");
  if (f) {
    Serial.println("--- contenu de essai.txt ---");
    while (f.available()) {
      Serial.write(f.read());
    }
    f.close();
    Serial.println("--- fin ---");
  } else {
    Serial.println("ECHEC de l'ouverture en lecture");
  }
}

void loop() {
  delay(1000);
}
