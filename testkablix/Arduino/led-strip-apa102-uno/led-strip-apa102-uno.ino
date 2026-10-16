// Test ruban APA102 (SPI mode 0, 30 LED) : chenillard vert.
// Trame : début (32 bits à 0), 30 × [111 + luminosité 5 bits, Bleu, Vert, Rouge], fin.
#include <SPI.h>

const int N = 30;

void envoyer(int allumee) {
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  for (int i = 0; i < 4; i++) SPI.transfer(0x00);
  for (int i = 0; i < N; i++) {
    SPI.transfer(0xE0 | 16);                 // luminosité 16/31
    SPI.transfer(i == allumee ? 60 : 0);     // bleu
    SPI.transfer(i == allumee ? 255 : 0);    // vert
    SPI.transfer(0);                         // rouge
  }
  for (int i = 0; i < 4; i++) SPI.transfer(0xFF);
  SPI.endTransaction();
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
