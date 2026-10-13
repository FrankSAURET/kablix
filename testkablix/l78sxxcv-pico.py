# Test régulateur L78SxxCV (5 V) : sortie lue sur GP27 (ADC1) par un pont
# diviseur 20 kΩ / 10 kΩ (1/3 de la sortie, soit 1,67 V attendus).
from machine import ADC
import time

capteur = ADC(27)

while True:
    volts = capteur.read_u16() * 3.3 / 65535 * 3
    print("sortie =", round(volts, 2), "V")
    time.sleep(0.5)
