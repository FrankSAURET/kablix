# Test PCA9685 : le servo branché sur P1 (canal 0) balaie 0°, 90° puis 180°.
# SANS l'alimentation de laboratoire réglée sur 5 V (courant suffisant) sur le
# bornier V+/GND du module, les sorties ne bougent pas.
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=100000)
PCA = 0x40

def pca_ecrit(reg, val):
    i2c.writeto(PCA, bytes([reg, val]))

# Impulsion du canal : créneau démarré à 0, coupé à durée/20 ms x 4096 pas.
def pca_impulsion(canal, microsecondes):
    off = microsecondes * 4096 // 20000
    i2c.writeto(PCA, bytes([0x06 + 4 * canal, 0x00, 0x00, off & 0xFF, off >> 8]))

pca_ecrit(0x00, 0x10)  # MODE1 : sleep pour régler le prescaler
pca_ecrit(0xFE, 121)   # prescale 50 Hz (25 MHz / (4096 x 50) - 1)
pca_ecrit(0x00, 0x20)  # MODE1 : réveil + auto-incrément

while True:
    for us, angle in ((500, 0), (1500, 90), (2500, 180)):
        pca_impulsion(0, us)
        print(angle, "degres")
        time.sleep(1)
