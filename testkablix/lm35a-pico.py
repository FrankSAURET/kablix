# Test capteur de température LM35A : lecture analogique sur GP27 (ADC1).
# 10 mV par °C : 25 °C donne 250 mV. Le capteur est alimenté par VSYS (il lui
# faut 4 V au moins), pas par 3V3.
from machine import ADC
import time

capteur = ADC(27)

while True:
    volts = capteur.read_u16() * 3.3 / 65535
    print("temperature =", round(volts * 100, 1), "C")
    time.sleep(0.5)
