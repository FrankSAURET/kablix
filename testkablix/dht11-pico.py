# Test DHT11 : meme module MicroPython que le DHT22, mais des valeurs
# ENTIERES (pas de dixieme), 20 a 90 % HR et 0 a 50 degres C.
from machine import Pin
import dht
import time

capteur = dht.DHT11(Pin(14))
while True:
    time.sleep(1.1)   # le DHT11 ne repond qu'une fois par seconde
    try:
        capteur.measure()
        print("T =", capteur.temperature(), "C   H =", capteur.humidity(), "%")
    except OSError as e:
        print("lecture ratee :", e)
