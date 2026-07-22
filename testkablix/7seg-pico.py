# Test afficheur 7 segments : compte de 0 à 9.
# Segments A..G,DP sur GP2..GP9.
from machine import Pin
import time

K = 1  # Cathode commune : segment allumé à 1.
A = 0  # Anode commune : segment allumé à 0.
COMMUNE = K  # Remplacer par A pour un afficheur à anode commune.

SEGS = [Pin(n, Pin.OUT) for n in range(2, 10)]
# Bits A..G : bit 0 = A, ..., bit 6 = G.
CHIFFRES = (0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F)

while True:
    for nombre in range(10):
        for segment in range(7):
            SEGS[segment].value(((CHIFFRES[nombre] >> segment) & 1) == COMMUNE)
        SEGS[7].value((nombre % 2) == COMMUNE)  # Point décimal sur les impairs.
        print(nombre)
        time.sleep(0.5)
