# Test carte microSD (SPI) : initialisation protocole brut (CMD0/CMD8/ACMD41).
from machine import Pin, SPI
import time

cs = Pin(17, Pin.OUT, value=1)
spi = SPI(0, baudrate=400_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))

def cmd(index, argument, crc):
    trame = bytes([
        0x40 | index,
        (argument >> 24) & 0xFF, (argument >> 16) & 0xFF,
        (argument >> 8) & 0xFF, argument & 0xFF, crc,
    ])
    spi.write(trame)
    for _ in range(8):
        r = spi.read(1, 0xFF)[0]
        if r != 0xFF:
            return r
    return 0xFF

spi.write(b"\xFF" * 10)      # 80 coups d'horloge, CS haut : mode SPI
cs.value(0)
r0 = cmd(0, 0, 0x95)          # CMD0 : retour à l'état idle (attendu 0x01)
r8 = cmd(8, 0x1AA, 0x87)      # CMD8 : tension + motif (attendu 0x01)
spi.read(4, 0xFF)             # fin de la réponse R7
resultat = 0xFF
for _ in range(200):
    cmd(55, 0, 0x65)          # CMD55 : préfixe de commande applicative
    resultat = cmd(41, 0x40000000, 0x77)   # ACMD41 : init (attendu 0x00)
    if resultat == 0:
        break
cs.value(1)
print("CMD0 =", r0, " CMD8 =", r8)
print("Carte SD detectee : init OK" if resultat == 0 else "ECHEC de l'init SD")
