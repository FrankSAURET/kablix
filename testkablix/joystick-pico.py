# Test joystick analogique : X/Y sur les ADC, bouton SEL en pull-up.
from machine import ADC, Pin
import time

axe_y = ADC(26)
axe_x = ADC(27)
bouton = Pin(14, Pin.IN, Pin.PULL_UP)
while True:
    b = "APPUYE" if bouton.value() == 0 else "relache"
    print("Y =", axe_y.read_u16(), " X =", axe_x.read_u16(), " bouton =", b)
    time.sleep(0.25)
