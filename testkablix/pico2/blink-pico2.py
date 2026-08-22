# Test carte Raspberry Pi Pico 2 : la LED embarquee (GP25) clignote.
# Meme code que sur la Pico : c'est la PUCE qui change (RP2350, deux coeurs
# Cortex-M33 a 150 MHz au lieu du RP2040 a 125). machine.freq() le montre.
from machine import Pin
import machine
import time

print("FREQ", machine.freq())
led = Pin(25, Pin.OUT)
while True:
    led.toggle()
    print("LED", "ON" if led.value() else "OFF")
    time.sleep(0.5)
