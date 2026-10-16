# Test ruban WS2801 (SPI mode 0, 30 LED, ordre RVB) : chenillard vert.
# Trame : 30 x 24 bits, puis pause d'horloge > 500 µs qui verrouille les couleurs.
from machine import Pin, SPI
import time

N = 30
spi = SPI(0, baudrate=1000000, polarity=0, phase=0, sck=Pin(18), mosi=Pin(19))

def envoyer(allumee):
    trame = bytearray()
    for i in range(N):
        on = i == allumee
        trame += bytes((0, 255 if on else 0, 60 if on else 0))
    spi.write(trame)
    time.sleep_us(600)

while True:
    for i in range(N):
        envoyer(i)
        time.sleep(0.06)
