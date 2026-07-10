# Test capteur de son : AOUT analogique + DOUT numérique (actif bas).
from machine import ADC, Pin
import time

aout = ADC(26)
dout = Pin(14, Pin.IN)
while True:
    etat = "SON DETECTE" if dout.value() == 0 else "silence"
    print("AOUT =", aout.read_u16(), " DOUT =", etat)
    time.sleep(0.3)
