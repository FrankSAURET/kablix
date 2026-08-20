# Test DMX512 : la carte Grove-DMX512 transforme l'UART0 (GP0) en ligne DMX,
# le projecteur PAR 38 prend la couleur envoyée sur ses trois canaux.
# Adresse du projecteur : 1 -> canal 1 = rouge, 2 = vert, 3 = bleu.
from machine import UART, Pin
import time

ADRESSE = 1
CANAUX = 512

# 250 kbauds, 8 bits, sans parité, 2 bits de stop : c'est la trame DMX512.
uart = UART(0, baudrate=250000, bits=8, parity=None, stop=2, tx=Pin(0))
trame = bytearray(CANAUX + 1)   # trame[0] = octet de départ, 0 pour l'éclairage


def envoyer():
    # Une trame DMX s'ouvre par un BREAK (ligne basse >= 88 us) puis un MAB
    # (marque >= 8 us) : ce n'est pas un octet, l'UART ne le produit qu'avec
    # sendbreak().
    uart.sendbreak()
    time.sleep_us(12)
    uart.write(trame)


COULEURS = ((255, 0, 0), (0, 255, 0), (0, 0, 255), (255,255,0))
while True:
    for rouge, vert, bleu in COULEURS:
        trame[ADRESSE] = rouge
        trame[ADRESSE + 1] = vert
        trame[ADRESSE + 2] = bleu
        envoyer()
        print("Couleur envoyée :", rouge, vert, bleu)
        time.sleep(1)
