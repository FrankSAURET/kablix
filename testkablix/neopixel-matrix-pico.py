# Test matrice NeoPixel 8x8 (64 pixels) : diagonale blanche + dégradé.
from machine import Pin
import neopixel
import time

matrice = neopixel.NeoPixel(Pin(0), 64)
for y in range(8):
    for x in range(8):
        if x == y:
            matrice[y * 8 + x] = (255, 255, 255)
        else:
            matrice[y * 8 + x] = (x * 32, 0, y * 32)
matrice.write()
print("Matrice remplie")
