# Test bouton poussoir : appui = 0 (pull-up interne), recopié sur la LED GP25.
from machine import Pin
import time

bouton = Pin(14, Pin.IN, Pin.PULL_UP)
led = Pin(25, Pin.OUT)
while True:
    appuye = bouton.value() == 0
    led.value(1 if appuye else 0)
    print("APPUYE" if appuye else "relache")
    time.sleep(0.2)
