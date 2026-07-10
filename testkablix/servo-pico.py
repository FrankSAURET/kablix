# Test servomoteur : PWM 50 Hz, impulsions 500/1500/2500 µs = 0/90/180°.
from machine import Pin, PWM
import time

servo = PWM(Pin(15))
servo.freq(50)

def angle(micros):
    servo.duty_u16(int(micros * 65535 / 20000))

while True:
    angle(500)
    print("0 degres")
    time.sleep(1)
    angle(1500)
    print("90 degres")
    time.sleep(1)
    angle(2500)
    print("180 degres")
    time.sleep(1)
