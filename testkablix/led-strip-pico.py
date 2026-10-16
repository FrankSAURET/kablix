# Test ruban de LED en spirale (30 LED, un fil) : chenillard vert.
from machine import Pin
import neopixel
import time

ruban = neopixel.NeoPixel(Pin(28), 300)
while True:
    for i in range(300):
        ruban.fill((0, 0, 0))
        ruban[i] = (0, 255, 60)
        ruban.write()
        time.sleep(0.06)
