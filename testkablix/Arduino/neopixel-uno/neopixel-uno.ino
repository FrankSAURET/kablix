// Test NeoPixel (3 pixels WS2812) : allumage successif en boucle.
#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel pixel(3, 6, NEO_GRB + NEO_KHZ800);

void setup() {
  pixel.begin();
  Serial.begin(115200);
}

void allumerSuccessif(uint8_t index, uint32_t c) {
  pixel.clear();
  pixel.setPixelColor(index, c);
  pixel.show();
  Serial.print("LED ");
  Serial.println(index + 1);
  delay(400);
}

void loop() {
  allumerSuccessif(0, pixel.Color(0, 0, 255));
  allumerSuccessif(1, pixel.Color(0, 0, 255));
  allumerSuccessif(2, pixel.Color(0, 0, 255));
}
