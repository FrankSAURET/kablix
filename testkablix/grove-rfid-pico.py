# Test lecteur RFID Grove 125 kHz : mode Wiegand (cavalier a droite).
# Les deux fils restent hauts au repos. Un zero = une courte descente sur DATA0,
# un un = une courte descente sur DATA1 : 50 microsecondes chacune, 2 ms entre
# deux, 26 impulsions par badge, du bit de poids fort au bit de poids faible.
# Trop bref pour une boucle de lecture : on compte les descentes par INTERRUPTION.
# En simulation, la fleche du dessin fait entrer et sortir le badge de la boucle.
from machine import Pin
import time

BITS = 26

d0 = Pin(16, Pin.IN)   # les zeros
d1 = Pin(17, Pin.IN)   # les uns

recus = []


def front0(broche):
    recus.append(0)


def front1(broche):
    recus.append(1)


d0.irq(trigger=Pin.IRQ_FALLING, handler=front0)
d1.irq(trigger=Pin.IRQ_FALLING, handler=front1)

print("Approchez un badge de la boucle.")

while True:
    if len(recus) >= BITS:
        mot = 0
        for b in recus[:BITS]:
            mot = (mot << 1) | b
        del recus[:BITS]
        print("badge = {:07X}".format(mot))
    time.sleep_ms(50)
