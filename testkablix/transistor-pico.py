# Test du composant « Transistor » : un seul item de bibliotheque, le modele
# se choisit dans les proprietes. Ici deux references du selecteur commandent
# le MEME ventilateur 5 V / 40 mA a travers la MEME resistance de base 10 kOhm.
#   GP15 : BC547  (gain 200) -> Ic max = 200 x 0,26 mA = 52 mA
#   GP14 : 2N3904 (gain 100) -> Ic max = 100 x 0,26 mA = 26 mA
# Le premier ventilateur tourne, le second ne demarre JAMAIS : a montage egal,
# c'est le gain qui decide.
#
# Les deux transistors n'ont PAS le meme brochage (BC547 = C-B-E, 2N3904 =
# E-B-C), et pourtant les fils sont identiques : les broches gardent toujours
# les noms E, B et C, seule la patte qui les porte change.
from machine import Pin
import time

fort = Pin(15, Pin.OUT)
faible = Pin(14, Pin.OUT)
print("GP14 : gain deux fois plus faible, son ventilateur ne tournera pas.")

while True:
    fort.value(1)
    faible.value(1)
    time.sleep(2)
    fort.value(0)
    faible.value(0)
    time.sleep(1)
