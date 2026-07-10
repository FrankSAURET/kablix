// Test anneau NeoPixel (16 pixels) : chenillard bleu.
#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel anneau(16, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  anneau.begin();
  anneau.setBrightness(80);
}

void loop() {
  for (int i = 0; i < 16; i++) {
    anneau.clear();
    anneau.setPixelColor(i, anneau.Color(0, 80, 255));
    anneau.show();
    delay(100);
  }
}
