# Test potentiomètre : lecture analogique 0-65535 sur GP26 (ADC0).
from machine import ADC
import time

pot = ADC(0)
pot2 = ADC(1)
while True:
    print("Pot Tot=", pot.read_u16())
    print("Pot Lin=", pot2.read_u16())
    time.sleep(0.25)
