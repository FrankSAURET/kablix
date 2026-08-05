// Test OLED SSD1306 en I2C (0x3C) : cadre, texte et diagonale.
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 ecran(128, 64, &Wire, -1);

void setup() {
  ecran.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  ecran.clearDisplay();
  ecran.drawRect(0, 0, 128, 64, SSD1306_WHITE);
  ecran.drawLine(0, 63, 127, 0, SSD1306_WHITE);
  ecran.setTextColor(SSD1306_WHITE);
  ecran.setTextSize(2);
  ecran.setCursor(16, 24);
  ecran.print("Kablix");
  ecran.display();
}

void loop() {
  delay(1000);
}
