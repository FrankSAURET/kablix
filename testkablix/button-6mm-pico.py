# Test bouton 6 mm : identique au bouton standard, sur GP13.
from machine import Pin
import time

bouton = Pin(13, Pin.IN, Pin.PULL_UP)
while True:
    print("APPUYE" if bouton.value() == 0 else "relache")
    time.sleep(0.2)
