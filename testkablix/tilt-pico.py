# Test capteur d'inclinaison : maintenir le clic incline le capteur.
from machine import Pin
import time

tilt = Pin(14, Pin.IN)
while True:
    print("INCLINE" if tilt.value() == 1 else "droit")
    time.sleep(0.3)
