# Test batterie externe (Power bank) : le servo branche sur P1 (canal 0) du
# PCA9685 balaie 0, 90 puis 180 degres, alimente par la powerbank (V+/GND) au
# lieu de l'alim de laboratoire. En simulation, ses 4 LED de jauge s'allument.
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
    pca_impulsion(0, 500);  print("0 degres");   time.sleep(1)
    pca_impulsion(0, 1500); print("90 degres");  time.sleep(1)
    pca_impulsion(0, 2500); print("180 degres"); time.sleep(1)
