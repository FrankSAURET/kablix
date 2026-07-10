# Test buzzer : niveau haut simple puis « bip » en PWM.
from machine import Pin, PWM
import time

broche = Pin(16, Pin.OUT)
while True:
    broche.value(1)
    print("Buzzer ON")
    time.sleep(0.4)
    broche.value(0)
    print("Buzzer OFF")
    time.sleep(0.4)
    bip = PWM(Pin(16))
    bip.freq(440)
    bip.duty_u16(32768)
    print("bip 440 Hz")
    time.sleep(0.3)
    bip.deinit()
    broche = Pin(16, Pin.OUT)
    time.sleep(0.3)
