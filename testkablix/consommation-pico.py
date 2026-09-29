# Test consommation : 2 s eveillee (LED GP25 allumee), 2 s en veille
# profonde (machine.lightsleep). Au traceur, le courant de la carte passe de
# 21 mA a 1,3 mA. time.sleep() ne compte PAS comme veille : la puce reste
# eveillee. La batterie (1 mAh) dure bien plus longtemps que sur une Uno.
from machine import Pin, lightsleep
import time

led = Pin(25, Pin.OUT)
while True:
    led.on()
    print("eveillee")
    time.sleep(2)
    led.off()
    print("veille")
    lightsleep(2000)
