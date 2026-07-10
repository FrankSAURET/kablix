# Test capteur de température NTC : lecture analogique sur GP26 (ADC0).
from machine import ADC
import time

capteur = ADC(26)
while True:
    print("ADC0 =", capteur.read_u16())
    time.sleep(0.3)
