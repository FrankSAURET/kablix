# Test potentiomètre ajustable (trimmer 100 kΩ) : lecture sur GP28 (ADC2).
from machine import ADC
import time

pot = ADC(28)
while True:
    print("ADC2 =", pot.read_u16())
    time.sleep(0.25)
