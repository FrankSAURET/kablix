# Test capteur de pouls : le signal analogique bat au rythme cardiaque.
from machine import ADC
import time

pouls = ADC(26)
while True:
    print("pouls =", pouls.read_u16())
    time.sleep(0.05)
