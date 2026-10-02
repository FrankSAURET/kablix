# Scenario autonomie (Pico sur LiPo 1S, capacite reduite a 1 mAh).
# Cycle : 1 s de mesure (LED GP15 allumee), puis 4 s d'attente.
#   VEILLE = True  : attente par machine.lightsleep() -> 21 mA puis 1,3 mA.
#   VEILLE = False : attente par time.sleep() -> 21 mA en permanence.
# Au traceur : Bat1: voltage descend de 4,2 V a 3,0 V ; vide, la carte
# s'eteint et la barre d'etat dit au bout de combien de temps.
from machine import Pin, lightsleep
import time

VEILLE = False

led = Pin(15, Pin.OUT)
cycles = 0
print("Attente en veille profonde" if VEILLE else "Attente eveillee")
while True:
    led.on()                 # mesure
    cycles += 1
    print("cycle", cycles)
    time.sleep(1)
    led.off()
    if VEILLE:
        lightsleep(4000)
    else:
        time.sleep(4)
