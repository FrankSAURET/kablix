# Test carte Raspberry Pi Pico 2 W : la LED embarquee clignote.
# Comme sur la Pico W, cette LED est cablee sur la puce Wi-Fi de la vraie carte
# et s'adresse par son nom : Pin("LED"). Kablix la simule sur GP25 (la puce
# Wi-Fi n'est pas emulee) et accepte les DEUX ecritures.
from machine import Pin
import machine
import time

print("FREQ", machine.freq())
led = Pin("LED", Pin.OUT)
while True:
    led.toggle()
    print("LED", "ON" if led.value() else "OFF")
    time.sleep(0.5)
