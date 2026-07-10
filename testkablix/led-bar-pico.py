# Test barre de 10 LED : vumètre qui monte puis descend (anodes sur GP2..GP11).
from machine import Pin
import time

leds = [Pin(n, Pin.OUT) for n in range(2, 12)]

def afficher(niveau):
    for i, led in enumerate(leds):
        led.value(1 if i < niveau else 0)
    print("niveau =", niveau)

while True:
    for n in range(11):
        afficher(n)
        time.sleep(0.15)
    for n in range(10, -1, -1):
        afficher(n)
        time.sleep(0.15)
