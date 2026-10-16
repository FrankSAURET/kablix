// Test ruban de LED en spirale (30 LED, un fil) : chenillard vert.
#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel ruban(30, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  ruban.begin();
  ruban.setBrightness(80);
}

void loop() {
  for (int i = 0; i < 30; i++) {
    ruban.clear();
    ruban.setPixelColor(i, ruban.Color(0, 255, 60));
    ruban.show();
    delay(60);
  }
}
