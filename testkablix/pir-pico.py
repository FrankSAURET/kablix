# Test capteur PIR : en simulation, survoler le capteur déclenche le mouvement.
from machine import Pin
import time

pir = Pin(14, Pin.IN)
led = Pin(25, Pin.OUT)
while True:
    mouvement = pir.value() == 1
    led.value(1 if mouvement else 0)
    print("MOUVEMENT !" if mouvement else "rien")
    time.sleep(0.3)
