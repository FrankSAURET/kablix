# Test resistances de puissance : les deux sont branchees en direct sur
# l'alimentation de laboratoire reglee a 12 V.
#   RP2 (4,7 ohms, boitier ceramique 10 W) dissipe 30 W : elle explose.
#   RP1 (1000 ohms, boitier aluminium 10 W) dissipe 0,14 W : elle tient.
# La LED clignote pour que la carte fasse quelque chose pendant ce temps.
from machine import Pin
import time

led = Pin(15, Pin.OUT)
print("resistances de puissance sous 12 V")

while True:
    led.value(1)
    time.sleep(0.5)
    led.value(0)
    time.sleep(0.5)
