// Test Grove Shield (Uno) : RIEN n'est piqué dans les rangées de la carte, tout
// passe par les prises de la carte fille. LED sur la prise D4 (patte 4), bouton
// sur la prise D2 (patte 2), afficheur LCD sur une prise I2C (A4/A5).
#include <LiquidCrystal_I2C.h>

#define LED 4
#define BOUTON 2

LiquidCrystal_I2C lcd(0x27, 16, 2);
int appuis = 0;
bool avant = false;

void setup() {
  pinMode(LED, OUTPUT);
  pinMode(BOUTON, INPUT_PULLUP);
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Grove Shield Uno");
}

void loop() {
  bool appuye = (digitalRead(BOUTON) == LOW);
  digitalWrite(LED, appuye ? HIGH : LOW);   // le bouton allume la LED
  if (appuye && !avant) appuis++;
  avant = appuye;
  lcd.setCursor(0, 1);
  lcd.print("appuis: ");
  lcd.print(appuis);
  Serial.println(appuye ? "APPUYE" : "relache");
  delay(200);
}
