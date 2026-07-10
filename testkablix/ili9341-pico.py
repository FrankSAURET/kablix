# Test écran TFT ILI9341 (SPI) : init registres bruts + carré rouge 100x100.
from machine import Pin, SPI
import time

cs = Pin(17, Pin.OUT, value=1)
dc = Pin(20, Pin.OUT, value=0)
rst = Pin(21, Pin.OUT, value=1)
spi = SPI(0, baudrate=10_000_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))

def commande(c, donnees=b""):
    cs.value(0)
    dc.value(0)
    spi.write(bytes([c]))
    if donnees:
        dc.value(1)
        spi.write(donnees)
    cs.value(1)

# Reset matériel puis réveil
rst.value(0); time.sleep_ms(10); rst.value(1); time.sleep_ms(10)
commande(0x01); time.sleep_ms(5)    # soft reset
commande(0x11); time.sleep_ms(5)    # sortie de veille
commande(0x3A, b"\x55")             # format de pixel RGB565
commande(0x29)                       # affichage ON

# Fenêtre 100x100 en haut à gauche puis remplissage rouge
commande(0x2A, b"\x00\x00\x00\x63")   # colonnes 0..99
commande(0x2B, b"\x00\x00\x00\x63")   # lignes 0..99
cs.value(0)
dc.value(0)
spi.write(b"\x2C")                  # RAMWR
dc.value(1)
ligne = b"\xF8\x00" * 100           # rouge RGB565, une ligne
for _ in range(100):
    spi.write(ligne)
cs.value(1)
print("Carre rouge envoye au TFT")
