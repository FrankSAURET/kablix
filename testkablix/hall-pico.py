# Test capteur à effet Hall : en simulation, glisser l'aimant vers le capteur.
# Sortie à drain ouvert, ACTIVE BASSE : ici c'est le rappel interne du Pico.
from machine import Pin
import time

hall = Pin(16, Pin.IN, Pin.PULL_UP)
led = Pin(25, Pin.OUT)
while True:
    aimant = hall.value() == 0
    led.value(1 if aimant else 0)
    print("AIMANT" if aimant else "rien")
    time.sleep(0.3)
