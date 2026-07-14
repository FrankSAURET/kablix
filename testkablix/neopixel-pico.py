# Test NeoPixel (1 pixel WS2812) : cycle complet des couleurs.
from machine import Pin
import neopixel
import time

pixel = neopixel.NeoPixel(Pin(0), 1)


def roue_couleurs(position):
    position = 255 - position
    if position < 85:
        return 255 - position * 3, 0, position * 3
    if position < 170:
        position -= 85
        return 0, position * 3, 255 - position * 3
    position -= 170
    return position * 3, 255 - position * 3, 0


while True:
    for position in range(256):
        pixel[0] = roue_couleurs(position)
        pixel.write()
        time.sleep(0.02)
