# Test potentiomètre à glissière : lecture analogique sur GP27 (ADC1).
from machine import ADC
import time

pot = ADC(27)
while True:
    print("ADC1 =", pot.read_u16())
    time.sleep(0.25)
