# Test ventilateur. Le premier tourne : il est branche sur l'alimentation de
# laboratoire (5 V, 1 A), qui fournit largement ses 850 mA.
# Le second est cable sur GP15 en PWM : il ne demarre JAMAIS, une sortie du Pico
# ne debite que quelques milliamperes. En vrai comme en simulation, il faut un
# transistor (ou un MOSFET) commande par la broche pour piloter un moteur.
from machine import Pin, PWM
import time

commande = PWM(Pin(15))
commande.freq(1000)
print("Le ventilateur de GP15 ne tournera pas : courant insuffisant.")

while True:
    for v in range(0, 65536, 1024):
        commande.duty_u16(v)
        time.sleep(0.04)
    for v in range(65535, -1, -1024):
        commande.duty_u16(max(0, v))
        time.sleep(0.04)
