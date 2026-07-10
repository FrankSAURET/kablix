# Test LCD 16x2 en I2C (PCF8574 à l'adresse 0x27) : pilote HD44780 4 bits inline.
from machine import Pin, I2C
import time

i2c = I2C(0, sda=Pin(0), scl=Pin(1), freq=100000)
ADRESSE = 0x27
RETRO = 0x08   # bit P3 = rétroéclairage

def quartet(nib, rs):
    octet = (nib << 4) | RETRO | (0x01 if rs else 0x00)
    i2c.writeto(ADRESSE, bytes([octet | 0x04]))   # E haut
    i2c.writeto(ADRESSE, bytes([octet]))          # E bas : le quartet est validé

def commande(c):
    quartet(c >> 4, False)
    quartet(c & 0x0F, False)

def donnee(c):
    quartet(c >> 4, True)
    quartet(c & 0x0F, True)

# Initialisation 4 bits (séquence HD44780)
time.sleep_ms(50)
quartet(0x03, False); time.sleep_ms(5)
quartet(0x03, False); quartet(0x03, False); quartet(0x02, False)
commande(0x28)   # 4 bits, 2 lignes
commande(0x0C)   # affichage ON, curseur OFF
commande(0x06)   # incrémentation
commande(0x01)   # effacement
time.sleep_ms(2)

for c in "Kablix LCD I2C":
    donnee(ord(c))
commande(0x80 | 0x40)   # début de la 2e ligne
for c in "sur Pico !":
    donnee(ord(c))
print("Texte envoye au LCD")
