# Test ruban APA102 (SPI mode 0, 30 LED) : chenillard vert.
# Trame : début (32 bits à 0), 30 x [111 + luminosité 5 bits, Bleu, Vert, Rouge], fin.
from machine import Pin, SPI
import time

N = 30
spi = SPI(0, baudrate=1000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(19))

def envoyer(allumee):
    trame = bytearray(4)
    for i in range(N):
        on = i == allumee
        trame += bytes((0xE0 | 16, 60 if on else 0, 255 if on else 0, 0))
    trame += b'\xff\xff\xff\xff'
    spi.write(trame)

while True:
    for i in range(N):
        envoyer(i)
        time.sleep(0.06)
