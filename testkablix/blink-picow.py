# Test carte Raspberry Pi Pico W : la LED embarquée clignote.
# En simulation Kablix la LED est sur GP25 (comme le Pico).
from machine import Pin
import time

led = Pin(25, Pin.OUT)
while True:
    led.toggle()
    print("LED", "ON" if led.value() else "OFF")
    time.sleep(0.5)
