# Test afficheur 7 segments (cathode commune) : compte de 0 à 9.
# Segments A..G,DP sur GP2..GP9 ; commun COM sur GND.
from machine import Pin
import time

segs = [Pin(n, Pin.OUT) for n in range(2, 10)]
chiffres = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F]

while True:
    for n in range(10):
        for s in range(7):
            segs[s].value((chiffres[n] >> s) & 1)
        segs[7].value(n % 2)   # point décimal sur les impairs
        print(n)
        time.sleep(0.5)
