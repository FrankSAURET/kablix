# Test oscilloscope : O1 (repere M1) regarde le milieu d'un pont diviseur
# GP15 -> R1 1 kohm -> point A -> R2 1 kohm -> masse. GP15 bascule toutes les
# 500 ms : l'ecran dessine un creneau entre 0 V et environ 1,6 V.
# Les deux boutons se tournent A LA SOURIS pendant la simulation :
#   Volts/Div (gauche) : hauteur d'un carreau, cinq crans avec butee ;
#   s/Div (droite)     : largeur d'un carreau, sans butee, un tour = x10.
# Depart : 1 V par carreau, 0,5 s par carreau -> une periode = deux carreaux.
from machine import Pin
import time

sortie = Pin(15, Pin.OUT)
while True:
    sortie.value(1)
    print("GP15 haut -> environ 1,6 V a l'ecran")
    time.sleep(0.01)
    sortie.value(0)
    print("GP15 bas  -> retour a 0 V")
    time.sleep(0.01)
