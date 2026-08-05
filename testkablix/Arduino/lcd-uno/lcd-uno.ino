// Test LCD 16x2 en I2C (adresse 0x27) : texte + compteur.
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);
int compteur = 0;

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Kablix LCD I2C");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("compteur: ");
  lcd.print(compteur++);
  delay(500);
}
