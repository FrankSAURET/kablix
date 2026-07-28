# Test joystick analogique : X/Y sur les ADC, bouton SEL en pull-up.
from machine import ADC, Pin
import time

axe_y = ADC(27)
axe_x = ADC(26)
bouton = Pin(22, Pin.IN, Pin.PULL_UP)
while True:
    b = "APPUYE" if bouton.value() == 0 else "relache"
    pos_x=axe_x.read_u16()
    pos_y=axe_y.read_u16()
    print("Y =", pos_y, " X =", pos_x, " bouton =", b)
    time.sleep(0.25)
