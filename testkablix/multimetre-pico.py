# Test multimetre : les deux appareils de la planche mesurent en meme temps.
# M1 est un VOLTMETRE, branche EN PARALLELE sur le pont diviseur
# GP15 -> R1 1 kohm -> point A -> R2 1 kohm -> masse : il lit environ 1,6 V
# quand GP15 est haut, 0 V quand GP15 est bas.
# M2 est un AMPEREMETRE, branche EN SERIE dans la branche 3V3 -> R3 1 kohm ->
# masse : il lit environ 3,3 mA en permanence (3,3 V / 1 kohm).
from machine import Pin
import time

sortie = Pin(15, Pin.OUT)
while True:
    sortie.value(1)
    print("GP15 haut -> voltmetre ~1,6 V")
    time.sleep(1)
    sortie.value(0)
    print("GP15 bas  -> voltmetre ~0 V")
    time.sleep(1)
