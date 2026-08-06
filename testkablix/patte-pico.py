# Test patte d'araignee : hanche (canal 0) et genou (canal 1) du PCA9685
# balaient chacun 0, 90 puis 180 degres, alimentes par la powerbank (V+/GND.2).
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=400000)
PCA = 0x40

def pca_ecrit(reg, val):
    i2c.writeto_mem(PCA, reg, bytes([val]))

# Impulsion du canal : creneau demarre a 0, coupe a duree/20 ms x 4096 pas.
def pca_impulsion(canal, microsecondes):
    off = microsecondes * 4096 // 20000
    i2c.writeto_mem(PCA, 0x06 + 4 * canal, bytes([0x00, 0x00, off & 0xFF, off >> 8]))

pca_ecrit(0x00, 0x10)  # MODE1 : sleep pour regler le prescaler
pca_ecrit(0xFE, 121)   # prescale 50 Hz (25 MHz / (4096 x 50) - 1)
pca_ecrit(0x00, 0x20)  # MODE1 : reveil + auto-increment

while True:
    pca_impulsion(0, 500);  pca_impulsion(1, 500);  print("0 degres");   time.sleep(1)
    pca_impulsion(0, 1500); pca_impulsion(1, 1500); print("90 degres");  time.sleep(1)
    pca_impulsion(0, 2500); pca_impulsion(1, 2500); print("180 degres"); time.sleep(1)
