# Test transistor PN2222A : le meme ventilateur 5 V / 120 mA sur les deux
# branches, commande par GP15 (base via 470 ohms) et par GP14 (base via
# 10 kOhms). Le transistor ne transmet que Gain x Ib :
#   GP15 : Ib = (3,3 - 0,7) / 470   = 5,5 mA  -> Ic max = 35 x 5,5  = 194 mA
#   GP14 : Ib = (3,3 - 0,7) / 10000 = 0,26 mA -> Ic max = 35 x 0,26 = 9 mA
# Le premier ventilateur tourne, le second ne demarre JAMAIS : on vise la
# SATURATION, sinon le montage aval ne marche pas.
from machine import Pin
import time

sature = Pin(15, Pin.OUT)
pas_sature = Pin(14, Pin.OUT)
print("GP14 : base sous-attaquee, son ventilateur ne tournera pas.")

while True:
    sature.value(1)
    pas_sature.value(1)
    time.sleep(2)
    sature.value(0)
    pas_sature.value(0)
    time.sleep(1)
