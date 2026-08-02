# Test du composant « Transistor » : un seul item de bibliotheque, le modele
# se choisit dans les proprietes. Ici cinq references du selecteur, une par
# famille. Les deux premieres commandent le MEME ventilateur 5 V / 40 mA a
# travers la MEME resistance de base 10 kOhm.
#   GP15 : BC547  (NPN, gain 200)        -> Ic max = 200 x 0,26 mA = 52 mA
#   GP14 : 2N3904 (NPN, gain 100)        -> Ic max = 100 x 0,26 mA = 26 mA
#   GP13 : BC557  (PNP, gain 200)        -> LED cote HAUT, logique INVERSEE
#   GP12 : BC517  (darlington, β 30 000) -> base 100 kOhm et pourtant 0,57 A
#   GP11 : BS170  (MOSFET canal N)       -> grille DIRECTE, sans resistance
# Le premier ventilateur tourne, le second ne demarre JAMAIS : a montage egal,
# c'est le gain qui decide. Le troisieme tourne avec DIX FOIS moins de courant
# de base : c'est tout l'interet du darlington.
#
# Les transistors n'ont PAS le meme brochage (BC547 et BC557 = C-B-E, 2N3904 =
# E-B-C), et pourtant les fils sont identiques : les broches gardent toujours
# les noms E, B et C, seule la patte qui les porte change. Le MOSFET, lui,
# porte G, D et S : il se commande en TENSION, sa grille ne consomme rien.
from machine import Pin
import time

fort = Pin(15, Pin.OUT)
faible = Pin(14, Pin.OUT)
inverse = Pin(13, Pin.OUT, value=1)   # PNP : conduit quand la broche est a 0
darlington = Pin(12, Pin.OUT)         # base 100 kOhm : un NPN ne suivrait pas
grille = Pin(11, Pin.OUT)             # MOSFET : commande en tension
print("GP14 : gain deux fois plus faible, son ventilateur ne tournera pas.")
print("GP13 : PNP, sa LED s'allume quand les ventilateurs sont commandes.")
print("GP12 : darlington, base 100 kOhm, son ventilateur tourne quand meme.")

while True:
    fort.value(1)
    faible.value(1)
    inverse.value(0)   # base tiree en bas : PNP sature, LED allumee
    darlington.value(1)
    grille.value(1)    # canal ouvert : LED verte allumee
    time.sleep(2)
    fort.value(0)
    faible.value(0)
    inverse.value(1)   # base au 3,3 V : PNP bloque, LED eteinte
    darlington.value(0)
    grille.value(0)
    time.sleep(1)
