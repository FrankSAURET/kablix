# Test interrupteur à glissière : le commun (2) est à GND, le côté connecté = 0.
from machine import Pin
import time

cote1 = Pin(14, Pin.IN, Pin.PULL_UP)
cote3 = Pin(13, Pin.IN, Pin.PULL_UP)
while True:
    if cote1.value() == 0:
        print("Position 1")
    elif cote3.value() == 0:
        print("Position 3")
    else:
        print("(milieu / non connecte)")
    time.sleep(0.3)
