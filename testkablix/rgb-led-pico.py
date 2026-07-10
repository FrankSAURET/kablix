# Test LED RGB (cathode commune) : fondu PWM sur chaque canal.
from machine import Pin, PWM
import time

canaux = {"Rouge": PWM(Pin(13)), "Vert": PWM(Pin(14)), "Bleu": PWM(Pin(15))}
for p in canaux.values():
    p.freq(1000)
    p.duty_u16(0)

while True:
    for nom, pwm in canaux.items():
        print(nom)
        for v in range(0, 65536, 4096):
            pwm.duty_u16(v)
            time.sleep(0.02)
        pwm.duty_u16(0)
