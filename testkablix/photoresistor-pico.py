# Test capteur de lumière (LDR) : AO analogique + DO numérique (actif bas).
from machine import ADC, Pin
import time

ao = ADC(26)
do = Pin(14, Pin.IN)
while True:
    seuil = "SEUIL DEPASSE" if do.value() == 0 else "sous le seuil"
    print("AO =", ao.read_u16(), " DO =", seuil)
    time.sleep(0.3)
