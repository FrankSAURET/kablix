# Test transistor NPN generique (prototype de l'editeur de composant) :
# commande cote BAS. La LED est cablee au 3,3 V par sa resistance, le transistor
# ferme le circuit vers la masse quand GP16 passe au niveau haut.
# Les pattes du prototype sont numerotees : ici la base est sur la patte 1, le
# collecteur sur la 2 et l'emetteur sur la 3 (proprietes b / c / e).
from machine import Pin
import time

commande = Pin(16, Pin.OUT)

while True:
    commande.value(1)   # transistor sature : LED allumee
    time.sleep(0.8)
    commande.value(0)   # transistor bloque : LED eteinte
    time.sleep(0.8)
