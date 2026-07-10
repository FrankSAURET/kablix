# Test LED : clignote sur GP15 (via une résistance de 220 ohms).
from machine import Pin
import time

led = Pin(15, Pin.OUT)
while True:
    led.value(1)
    print("LED ON")
    time.sleep(0.5)
    led.value(0)
    print("LED OFF")
    time.sleep(0.5)
