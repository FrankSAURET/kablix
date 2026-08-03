# Test moteur a courant continu. Trois moteurs 5 V / 100 mA :
#   - GP15 : commande par un PN2222A, alimentation de laboratoire et diode de
#     roue libre en travers du moteur -> il tourne, tout est correct ;
#   - GP13 : moteur branche EN DIRECT sur la broche. Une sortie du Pico ne
#     debite que quelques milliamperes contre les 100 mA demandes : il ne
#     demarre JAMAIS ;
#   - GP14 : meme montage que le premier mais SANS diode de roue libre. Un
#     moteur est une bobine : couper son courant renvoie une surtension qui
#     detruit le transistor. Kablix le fait exploser.
from machine import Pin, PWM
import time

bon = PWM(Pin(15))
bon.freq(1000)
en_direct = PWM(Pin(13))
en_direct.freq(1000)
sans_diode = Pin(14, Pin.OUT)

print("GP13 : moteur en direct, courant insuffisant.")
print("GP14 : pas de diode de roue libre, le transistor va lacher.")

while True:
    # Montee et descente en PWM : la vitesse suit le rapport cyclique.
    for v in range(0, 65536, 1024):
        bon.duty_u16(v)
        en_direct.duty_u16(v)
        time.sleep(0.04)
    for v in range(65535, -1, -1024):
        bon.duty_u16(max(0, v))
        en_direct.duty_u16(max(0, v))
        time.sleep(0.04)
    # Tout ou rien sur la branche sans diode : c'est la COUPURE qui tue.
    sans_diode.value(1)
    time.sleep(1)
    sans_diode.value(0)
    time.sleep(1)
