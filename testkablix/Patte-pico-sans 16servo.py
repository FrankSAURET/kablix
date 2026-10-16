# Test patte d'araignee : coxa (D16) et patella (D18) 
# balaient chacun 0, 90 puis 180 degres.
from machine import Pin, PWM
from time import sleep

PIN_COXA = 16
PIN_PATELLA = 18
FREQ = 50              # Hz, standard servo
IMPULSION_MIN = 500    # us, correspond a 0 degre
IMPULSION_MAX = 2500   # us, correspond a 180 degres
PAUSE = 1              # s entre deux positions


class Servo:
    def __init__(self, broche):
        self.pwm = PWM(Pin(broche))
        self.pwm.freq(FREQ)

    def angle(self, degres):
        us = IMPULSION_MIN + (IMPULSION_MAX - IMPULSION_MIN) * degres / 180
        # Periode de 20 000 us -> rapport cyclique sur 16 bits
        self.pwm.duty_u16(int(us * 65535 / 20000))

    def stop(self):
        self.pwm.deinit()


coxa = Servo(PIN_COXA)
patella = Servo(PIN_PATELLA)

try:
    while True:
        for pos in (10, 100, 180):
            print("coxa", pos)
            coxa.angle(pos)
            sleep(PAUSE)
            print("patella", pos)
            patella.angle(pos)
            sleep(PAUSE)
except KeyboardInterrupt:
    coxa.stop()
    patella.stop()