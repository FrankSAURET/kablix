# Test capteur de flamme : AOUT baisse quand la flamme approche, DOUT actif bas.
from machine import ADC, Pin
import time

aout = ADC(26)
dout = Pin(14, Pin.IN)
while True:
    etat = "FLAMME !" if dout.value() == 0 else "rien"
    print("AOUT =", aout.read_u16(), " DOUT =", etat)
    time.sleep(0.3)
