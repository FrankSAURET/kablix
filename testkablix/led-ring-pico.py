# Test anneau NeoPixel (16 pixels) : chenillard bleu.
from machine import Pin
import neopixel
import time

anneau = neopixel.NeoPixel(Pin(0), 16)
while True:
    for i in range(16):
        anneau.fill((0, 0, 0))
        anneau[i] = (0, 80, 255)
        anneau.write()
        time.sleep(0.1)
