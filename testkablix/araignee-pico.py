# Test robot araignee : les 8 articulations (4 pattes) sont pilotees par le
# PCA9685 embarque a l'adresse 0x40. Canaux 0/1 = hanche/genou avant-gauche,
# 2/3 avant-droite, 4/5 arriere-gauche, 6/7 arriere-droite.
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

# 500 us = 0 degre, 1500 us = 90 (patte tendue), 2500 us = 180.
def impulsion(degres):
    return 500 + degres * 2000 // 180

# Pose complete : le meme angle de hanche et de genou pour les 4 pattes.
def pose(hanche, genou):
    for patte in range(4):
        pca_impulsion(2 * patte, impulsion(hanche))
        pca_impulsion(2 * patte + 1, impulsion(genou))

pca_ecrit(0x00, 0x10)  # MODE1 : sleep pour regler le prescaler
pca_ecrit(0xFE, 121)   # prescale 50 Hz (25 MHz / (4096 x 50) - 1)
pca_ecrit(0x00, 0x20)  # MODE1 : reveil + auto-increment

while True:
    pose(90, 90);   print("pattes tendues");     time.sleep(1)
    pose(90, 130);  print("genoux plies");       time.sleep(1)
    pose(60, 130);  print("hanches en avant");   time.sleep(1)
    pose(120, 130); print("hanches en arriere"); time.sleep(1)
