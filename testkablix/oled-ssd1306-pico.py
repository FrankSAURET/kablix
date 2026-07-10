# Test OLED SSD1306 en I2C (0x3C) : cadre + damier, pilote minimal inline.
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=400000)
ADRESSE = 0x3C

def cmd(*octets):
    i2c.writeto(ADRESSE, bytes([0x00]) + bytes(octets))

# Initialisation classique 128x64
for c in (0xAE, 0xD5, 0x80, 0xA8, 0x3F, 0xD3, 0x00, 0x40, 0x8D, 0x14,
          0x20, 0x00, 0xA1, 0xC8, 0xDA, 0x12, 0x81, 0xCF, 0xD9, 0xF1,
          0xDB, 0x40, 0xA4, 0xA6, 0xAF):
    cmd(c)
cmd(0x21, 0, 127)   # colonnes 0..127
cmd(0x22, 0, 7)     # pages 0..7

# Tampon : cadre + damier central
tampon = bytearray(1024)
for x in range(128):
    tampon[x] |= 0x01          # ligne du haut
    tampon[896 + x] |= 0x80    # ligne du bas
for page in range(8):
    tampon[page * 128] = 0xFF        # bord gauche
    tampon[page * 128 + 127] = 0xFF  # bord droit
for page in range(2, 6):
    for x in range(32, 96):
        if (x // 8 + page) % 2 == 0:
            tampon[page * 128 + x] = 0xFF

# Envoi de la mémoire vidéo par paquets de 16 octets
for i in range(0, 1024, 16):
    i2c.writeto(ADRESSE, bytes([0x40]) + bytes(tampon[i:i + 16]))
print("Dessin envoye a l'OLED")
