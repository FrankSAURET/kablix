# Test phototransistor : 3V3 -> collecteur, émetteur -> GP26 -> 1 kΩ -> GND.
# La résistance est OBLIGATOIRE : sans elle, rien ne transforme le courant du
# phototransistor en tension lisible.
# En simulation, le curseur de luminosité fait monter la lecture.
from machine import ADC
import time

photo = ADC(26)
while True:
    brut = photo.read_u16()
    print("ADC0 =", brut, "(bien eclaire)" if brut > 45000 else "(sombre)")
    time.sleep(0.3)
