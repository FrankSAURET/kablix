// Test NeoPixel (1 pixel WS2812) : rouge, vert, bleu en boucle.
#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel pixel(1, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  pixel.begin();
  Serial.begin(115200);
}

void couleur(uint32_t c, const char* nom) {
  pixel.setPixelColor(0, c);
  pixel.show();
  Serial.println(nom);
  delay(600);
}

void loop() {
  couleur(pixel.Color(255, 0, 0), "Rouge");
  couleur(pixel.Color(0, 255, 0), "Vert");
  couleur(pixel.Color(0, 0, 255), "Bleu");
}
