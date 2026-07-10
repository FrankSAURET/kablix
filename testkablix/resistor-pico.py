# Test résistance : en série avec une LED sur GP16 (continuité du courant).
from machine import Pin
import time

sortie = Pin(16, Pin.OUT)
while True:
    sortie.value(1)
    print("LED allumee a travers la resistance")
    time.sleep(0.7)
    sortie.value(0)
    time.sleep(0.3)
