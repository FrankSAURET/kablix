# Test bouton poussoir : appui = 0 (pull-up interne), recopié sur la LED GP25.
from machine import Pin
import time

bouton = Pin(14, Pin.IN, Pin.PULL_UP)
bouton6 = Pin(16, Pin.IN, Pin.PULL_UP)
led = Pin(25, Pin.OUT)
while True:
    appuye = bouton.value() == 0
    appuye6 = bouton6.value() == 0
    led.value(1 if appuye or appuye6 else 0)
    print("APPUYE" if appuye else "relache")
    print("APPUYE6" if appuye6 else "relache6")
    time.sleep(0.2)
