# Test ruban de LED en spirale (30 LED, un fil) : chenillard vert.
from machine import Pin
import neopixel
import time

ruban = neopixel.NeoPixel(Pin(28), 30)
while True:
    for i in range(30):
        ruban.fill((0, 0, 0))
        ruban[i] = (0, 255, 60)
        ruban.write()
        time.sleep(0.06)
