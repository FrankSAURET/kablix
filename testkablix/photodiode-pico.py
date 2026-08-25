# Test photodiode : 3V3 -> cathode, anode -> GP26 -> 100 kΩ -> GND.
# La photodiode travaille en INVERSE (cathode au plus) et laisse passer cent
# fois moins de courant qu'un phototransistor : d'où la grosse résistance.
# En simulation, le curseur de luminosité fait monter la lecture.
from machine import ADC
import time

photo = ADC(26)
while True:
    brut = photo.read_u16()
    print("ADC0 =", brut, "(bien eclaire)" if brut > 45000 else "(sombre)")
    time.sleep(0.3)
