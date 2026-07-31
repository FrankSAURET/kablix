# Test condensateur sur une entree a rappel interne, SANS aucune resistance
# exterieure : le rappel du RP2040 (50 a 80 kOhm, 65 kOhm dans Kablix) sert de
# resistance de charge (PULL_UP) puis de decharge (PULL_DOWN). Avec 1 uF, la
# constante de temps vaut 65 ms : 63 % de la tension a 1 RC, tout est fini a
# 5 RC. La tension est lue sur ADC0 (GP26), cable sur la meme armature.
from machine import ADC, Pin
import time

broche = Pin(15, Pin.OUT, value=0)
mesure = ADC(Pin(26))

def trace(phase):
    for i in range(15):
        time.sleep_ms(20)
        volts = mesure.read_u16() * 3.3 / 65535
        print(phase, "t=", (i + 1) * 20, "ms  U=", "%.2f" % volts, "V")

while True:
    broche.init(Pin.OUT, value=0)
    time.sleep_ms(400)                    # decharge complete (5 RC)
    broche.init(Pin.IN, Pin.PULL_UP)      # charge par le rappel interne
    trace("charge  ")
    broche.init(Pin.IN, Pin.PULL_DOWN)    # decharge par le meme rappel
    trace("decharge")
