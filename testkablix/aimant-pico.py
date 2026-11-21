# Test aimant (Beta) : l'aimant est fixe sur le palonnier du servo (canal 0
# du PCA9685). Le servo balaie 0, 90 puis 180 degres ; le capteur a effet Hall,
# pose en face de la position 90 degres, ne doit voir l'aimant qu'a 90 degres.
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=400000)
PCA = 0x40
hall = Pin(16, Pin.IN, Pin.PULL_UP)  # sortie a drain ouvert, active basse
led = Pin(25, Pin.OUT)

def pca_ecrit(reg, val):
    i2c.writeto_mem(PCA, reg, bytes([val]))

def pca_impulsion(canal, microsecondes):
    off = microsecondes * 4096 // 20000
    i2c.writeto_mem(PCA, 0x06 + 4 * canal, bytes([0x00, 0x00, off & 0xFF, off >> 8]))

pca_ecrit(0x00, 0x10)  # MODE1 : sleep pour regler le prescaler
pca_ecrit(0xFE, 121)   # prescale 50 Hz
pca_ecrit(0x00, 0x20)  # MODE1 : reveil + auto-increment

while True:
    for angle, us in ((0, 500), (90, 1500), (180, 2500)):
        pca_impulsion(0, us)
        time.sleep(1)
        aimant = hall.value() == 0
        led.value(1 if aimant else 0)
        print(angle, "degres :", "AIMANT" if aimant else "rien")
