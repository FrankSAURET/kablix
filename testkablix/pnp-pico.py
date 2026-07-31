# Test transistor PNP generique (prototype de l'editeur de composant) :
# commande cote HAUT. L'emetteur est au 3,3 V, la LED pend sous le collecteur.
# Un PNP conduit quand sa base est TIREE VERS LE BAS : la LED s'allume quand
# GP17 est a 0 et s'eteint quand il passe a 1 — logique inversee.
from machine import Pin
import time

commande = Pin(17, Pin.OUT, value=0)   # au repos : base en bas, LED allumee

while True:
    commande.value(0)   # transistor sature : LED allumee
    time.sleep(0.8)
    commande.value(1)   # base au 3,3 V : transistor bloque
    time.sleep(0.8)
