# Test pile pile-cr2032 : 3 V sur VSYS : la Pico tourne jusqu'a ce que la pile soit vide.
# La LED GP25 clignote et la console compte les secondes tant que la carte tourne.
from machine import Pin
import time

led = Pin(25, Pin.OUT)
secondes = 0
while True:
    led.toggle()
    time.sleep(0.5)
    led.toggle()
    time.sleep(0.5)
    secondes += 1
    print(secondes)
