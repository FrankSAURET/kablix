# Test analyseur logique : les pinces (SD1..SD4) sont POSEES sur des
# pastilles de la carte, il n'y a AUCUN fil a tirer vers elles.
# GP14 bat vite, GP15 bat deux fois moins vite : dans l'onglet de l'analyseur,
# deux creneaux decales, chacun de la couleur de sa pince sur la planche.
# RIEN A CLIQUER : au demarrage de la simulation, l'onglet de l'analyseur
# s'ouvre tout seul parce qu'il y a au moins une pince sur la planche.
#   SD1 (GP14) : cas normal, nommee « horloge » ;
#   SD2 (GP15) : voie suivante, sans etiquette (elle s'appellera « GP15 ») ;
#   SD3 (GP17) : broche que le programme ne pilote pas — la voie est tracee
#                mais reste plate, l'analyseur dit « aucun front capture » ;
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
