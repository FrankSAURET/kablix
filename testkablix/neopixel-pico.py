# Test NeoPixel (1 pixel WS2812) : rouge, vert, bleu en boucle.
from machine import Pin
import neopixel
import time

pixel = neopixel.NeoPixel(Pin(0), 1)
couleurs = [("Rouge", (255, 0, 0)), ("Vert", (0, 255, 0)), ("Bleu", (0, 0, 255))]
while True:
    for nom, rgb in couleurs:
        pixel[0] = rgb
        pixel.write()
        print(nom)
        time.sleep(0.6)
