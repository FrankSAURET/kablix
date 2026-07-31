# Test diode : les deux broches passent au niveau haut en meme temps.
# Seule la LED verte s'allume — la diode de la branche rouge est montee a
# l'envers (cathode cote GP14) et bloque le passage du courant.
from machine import Pin
import time

passante = Pin(15, Pin.OUT)
bloquee = Pin(14, Pin.OUT)

while True:
    passante.value(1)
    bloquee.value(1)
    time.sleep(1)
    passante.value(0)
    bloquee.value(0)
    time.sleep(1)
