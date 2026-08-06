// Test robot araignée : les 8 articulations (4 pattes) sont pilotées par le
// PCA9685 embarqué à l'adresse 0x40. Canaux 0/1 = hanche/genou avant-gauche,
// 2/3 avant-droite, 4/5 arrière-gauche, 6/7 arrière-droite.
#include <Wire.h>

const uint8_t PCA = 0x40;

void pcaEcrit(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(PCA);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

// Impulsion du canal : créneau démarré à 0, coupé à durée/20 ms × 4096 pas.
void pcaImpulsion(uint8_t canal, uint16_t microsecondes) {
  uint16_t off = (uint32_t)microsecondes * 4096UL / 20000UL;
  Wire.beginTransmission(PCA);
  Wire.write(0x06 + 4 * canal); // LED0_ON_L (auto-incrément)
  Wire.write(0x00); Wire.write(0x00);
  Wire.write(off & 0xFF); Wire.write(off >> 8);
  Wire.endTransmission();
}

// 500 µs = 0°, 1500 µs = 90° (patte tendue), 2500 µs = 180°.
uint16_t impulsion(uint8_t degres) {
  return 500 + (uint16_t)degres * 2000U / 180U;
}

// Pose complète : le même angle de hanche et de genou pour les 4 pattes.
void pose(uint8_t hanche, uint8_t genou) {
  for (uint8_t patte = 0; patte < 4; patte++) {
    pcaImpulsion(2 * patte, impulsion(hanche));
    pcaImpulsion(2 * patte + 1, impulsion(genou));
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  pcaEcrit(0x00, 0x10);  // MODE1 : sleep pour régler le prescaler
  pcaEcrit(0xFE, 121);   // prescale 50 Hz (25 MHz / (4096 x 50) - 1)
  pcaEcrit(0x00, 0x20);  // MODE1 : réveil + auto-incrément
}

void loop() {
  pose(90, 90);   Serial.println("pattes tendues");  delay(1000);
  pose(90, 130);  Serial.println("genoux pliés");    delay(1000);
  pose(60, 130);  Serial.println("hanches en avant"); delay(1000);
  pose(120, 130); Serial.println("hanches en arriere"); delay(1000);
}
