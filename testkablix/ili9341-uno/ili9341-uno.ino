// Test écran TFT ILI9341 (SPI) : aplats de couleur + texte.
#include <Adafruit_ILI9341.h>

Adafruit_ILI9341 tft(10, 9, 8);   // CS, D/C, RST

void setup() {
  tft.begin();
  tft.fillScreen(ILI9341_RED);
  delay(300);
  tft.fillScreen(ILI9341_GREEN);
  delay(300);
  tft.fillScreen(ILI9341_BLUE);
  delay(300);
  tft.fillScreen(ILI9341_BLACK);
  tft.setTextColor(ILI9341_WHITE);
  tft.setTextSize(3);
  tft.setCursor(40, 140);
  tft.print("Kablix");
}

void loop() {
  delay(1000);
}
