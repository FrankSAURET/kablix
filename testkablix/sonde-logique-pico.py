# Test analyseur logique : les pinces (SD1..SD4) sont POSEES sur des
# pastilles de la carte, il n'y a AUCUN fil a tirer vers elles.
# GP14 bat vite, GP15 bat deux fois moins vite : dans l'onglet de l'analyseur,
# deux creneaux decales, chacun de la couleur de sa pince sur la planche.
# Le bouton « Logic » de la barre ouvre l'onglet a cote du schema.
#   SD1 (GP14) : cas normal, nommee « horloge » ;
#   SD2 (GP15) : voie suivante, sans etiquette (elle s'appellera « GP15 ») ;
#   SD3 (GND)  : broche d'alimentation, l'analyseur explique qu'il n'y a
#                aucun front a montrer ;
#   SD4 (GP26) : entree ADC0, lisible en numerique — tracee, mais signalee :
#                on ne verra que 0 ou 1, pas la tension.
from machine import Pin
import time

rapide = Pin(14, Pin.OUT)
lente = Pin(15, Pin.OUT)
etat = 0
while True:
    rapide.value(1)
    time.sleep_us(200)
    rapide.value(0)
    time.sleep_us(200)
    # Un tour sur deux : GP15 bat deux fois moins vite que GP14.
    etat = 1 - etat
    lente.value(etat)
