# Test carte Raspberry Pi Pico : la LED embarquée (GP25) clignote.
from machine import Pin
import time

led = Pin(25, Pin.OUT)
while True:
    led.toggle()
    print("LED", "ON" if led.value() else "OFF")
    time.sleep(0.5)
