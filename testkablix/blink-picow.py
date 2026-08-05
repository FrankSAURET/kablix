# Test carte Raspberry Pi Pico W : la LED embarquée clignote.
# Sur une vraie carte, cette LED est câblée sur la puce Wi-Fi et s'adresse par
# son nom : Pin("LED"). Kablix la simule sur GP25 (la puce Wi-Fi n'est pas
# émulée) et accepte les DEUX écritures — c'est le code habituel qui doit
# marcher tel quel.
from machine import Pin
import time

led = Pin("LED", Pin.OUT)
while True:
    led.toggle()
    print("LED", "ON" if led.value() else "OFF")
    time.sleep(0.5)
