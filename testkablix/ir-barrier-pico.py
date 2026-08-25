# Test barrière optique : en simulation, cocher « Obstacle » fait monter la
# barre entre les deux boîtiers et coupe le faisceau.
# Sortie à collecteur ouvert : ici c'est le rappel interne du Pico.
# Faisceau libre -> sortie à 0 ; faisceau coupé -> sortie à 1.
from machine import Pin
import time

barriere = Pin(16, Pin.IN, Pin.PULL_UP)
led = Pin(25, Pin.OUT)
while True:
    obstacle = barriere.value() == 1
    led.value(1 if obstacle else 0)
    print("OBSTACLE" if obstacle else "libre")
    time.sleep(0.3)
