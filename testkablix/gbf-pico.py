# Test generateur BF : triangle de 20 Hz, rapport cyclique 30 % (montee
# courte, descente longue), 0,15 a 3,15 V pour rester dans la plage de l'ADC
# du Pico. Lecture sur GP26 (ADC0).
from machine import ADC
import time

entree = ADC(26)
while True:
    brut = entree.read_u16()
    print("ADC0 =", brut, " soit %.2f V" % (brut * 3.3 / 65535))
    time.sleep(0.01)              # ~5 points par periode a 20 Hz
