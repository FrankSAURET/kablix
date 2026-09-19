# Test potentiomètre : lecture analogique 0-65535 sur GP26 (ADC0).
from machine import ADC
import time

pot = ADC(26)
while True:
    print("ADC0 =", pot.read_u16())
    time.sleep(0.25)
