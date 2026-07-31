# Clignote la LED embarquée (GP25) du Raspberry Pi Pico et écrit sur le
# moniteur série. À exécuter avec « Kablix : Compiler & exécuter le fichier
# actif » : le firmware MicroPython (.uf2) doit être présent dans le workspace
# ou renseigné dans le réglage kablix.micropythonUf2.
from machine import Pin
import time

led = Pin(25, Pin.OUT)

for i in range(10):
    led.toggle()
    print('blink', i)
    time.sleep(0.5)

print('fini !')
