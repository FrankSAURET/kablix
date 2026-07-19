// Test PCA9685 : le servo branché sur P1 (canal 0) balaie 0°, 90° puis 180°.
// SANS l'alimentation de laboratoire réglée sur 5 V (courant suffisant) sur le
// bornier V+/GND du module, les sorties ne bougent pas.
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

void setup() {
  Serial.begin(115200);
  Wire.begin();
  pcaEcrit(0x00, 0x10);  // MODE1 : sleep pour régler le prescaler
  pcaEcrit(0xFE, 121);   // prescale 50 Hz (25 MHz / (4096 x 50) - 1)
  pcaEcrit(0x00, 0x20);  // MODE1 : réveil + auto-incrément
}

void loop() {
  pcaImpulsion(0, 500);  Serial.println("0 degres");   delay(1000);
  pcaImpulsion(0, 1500); Serial.println("90 degres");  delay(1000);
  pcaImpulsion(0, 2500); Serial.println("180 degres"); delay(1000);
}
