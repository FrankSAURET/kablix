# Test capteur d'humidité du sol : lecture analogique sur GP26 (ADC0).
# En simulation, le curseur du capteur règle l'humidité de 0 à 100 % :
# 0 % donne 0 V (valeur 0), 100 % donne 3,3 V (valeur 65535).
from machine import ADC
import time

sonde = ADC(26)
SEUIL_SEC = 22000

while True:
    mesure = sonde.read_u16()
    print("humidite =", mesure, "-> TROP SEC, il faut arroser" if mesure < SEUIL_SEC else "-> ok")
    time.sleep(0.3)
