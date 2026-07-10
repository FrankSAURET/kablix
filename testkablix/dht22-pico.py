# Test DHT22 : température et humidité via le module dht de MicroPython.
from machine import Pin
import dht
import time

capteur = dht.DHT22(Pin(14))
while True:
    time.sleep(2.1)   # le DHT22 ne répond qu'une fois toutes les 2 s
    try:
        capteur.measure()
        print("T =", capteur.temperature(), "C   H =", capteur.humidity(), "%")
    except OSError as e:
        print("lecture ratee :", e)
