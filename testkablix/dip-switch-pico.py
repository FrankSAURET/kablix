# Test DIP switch x8 : chaque canal fermé tire sa broche (GP2..GP9) à 0.
from machine import Pin
import time

canaux = [Pin(n, Pin.IN, Pin.PULL_UP) for n in range(2, 10)]
while True:
    etat = "".join("1" if c.value() == 0 else "0" for c in canaux)
    print("Canaux :", etat)
    time.sleep(0.4)
