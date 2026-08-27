# Test capteur de lumière Grove : lecture analogique sur GP27 (ADC1).
# En simulation, le curseur du capteur règle l'éclairement de 0 lx à la pleine
# échelle (500 lx par défaut) : 0 lx donne 0 V (valeur 0), la pleine échelle
# donne 3,3 V (valeur 65535).
from machine import ADC
import time

capteur = ADC(27)
SEUIL_SOMBRE = 13000

while True:
    mesure = capteur.read_u16()
    print("lumiere =", mesure, "-> SOMBRE, on allume" if mesure < SEUIL_SOMBRE else "-> assez clair")
    time.sleep(0.3)
