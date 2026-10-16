// Test ruban WS2801 (SPI mode 0, 30 LED, ordre RVB) : chenillard vert.
// Trame : 30 × 24 bits, puis pause d'horloge > 500 µs qui verrouille les couleurs.
#include <SPI.h>

const int N = 30;

void envoyer(int allumee) {
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  for (int i = 0; i < N; i++) {
    SPI.transfer(0);                         // rouge
    SPI.transfer(i == allumee ? 255 : 0);    // vert
    SPI.transfer(i == allumee ? 60 : 0);     // bleu
  }
  SPI.endTransaction();
  delayMicroseconds(600);                    // pause > 500 µs
}

void setup() {
  SPI.begin();
}

void loop() {
  for (int i = 0; i < N; i++) {
    envoyer(i);
    delay(60);
  }
}
