# Test carte Raspberry Pi Pico : la LED embarquée (GP25) clignote.
from machine import Pin
import time

# Pico W utilise souvent "LED", Pico classique utilise GP25.
try:
    led = Pin("LED", Pin.OUT)
except Exception:
    led = Pin(25, Pin.OUT)

state = False
while True:
    state = not state
    led.value(state)
    print("LED", "ON" if state else "OFF")
    time.sleep(0.5)
