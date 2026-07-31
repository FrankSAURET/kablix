# Test condensateur sur une entree a rappel interne (pull-up), sans aucune
# resistance exterieure : GP15 en sortie basse vide le condensateur, puis passe
# en entree pull-up et le rappel interne (~40 kOhm) le recharge. Le temps de
# remontee mesure la constante de temps RC (~40 ms pour 1 uF).
from machine import Pin
import time

broche = Pin(15, Pin.OUT, value=0)

while True:
    broche.init(Pin.OUT, value=0)
    time.sleep(0.3)                       # decharge complete (5 RC)
    broche.init(Pin.IN, Pin.PULL_UP)      # charge par le rappel interne
    debut = time.ticks_us()
    while broche.value() == 0 and time.ticks_diff(time.ticks_us(), debut) < 1000000:
        pass
    print("remontee :", time.ticks_diff(time.ticks_us(), debut), "us")
    time.sleep(0.5)
