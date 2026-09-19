// Test matrice NeoPixel 8x8 (64 pixels) : diagonale + dégradé.
#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel matrice(64, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  matrice.begin();
  matrice.setBrightness(60);
  for (int y = 0; y < 8; y++) {
    for (int x = 0; x < 8; x++) {
      if (x == y) matrice.setPixelColor(y * 8 + x, matrice.Color(255, 255, 255));
      else matrice.setPixelColor(y * 8 + x, matrice.Color(x * 32, 0, y * 32));
    }
  }
  matrice.show();
}

void loop() {
  delay(1000);
}
