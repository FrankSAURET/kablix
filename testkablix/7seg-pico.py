# Test afficheur 7 segments multiplexe.
# Segments A..G sur GP2..GP8.
# Digits 1..4 sur GP10..GP13.
from machine import Pin
import time

K = 1  # Cathode commune : segment allumé à 1.
A = 0  # Anode commune : segment allumé à 0.
COMMUNE = K  # Remplacer par A pour un afficheur à anode commune.

NB_DIGITS = 4 # Mettre 1, 2 ou 4 selon l'afficheur câblé.

SEGS = [Pin(n, Pin.OUT) for n in range(2, 9)]
DIGITS = [Pin(n, Pin.OUT) for n in range(10, 14)]
# Bits A..G : bit 0 = A, ..., bit 6 = G.
CHIFFRES = (0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F)

SEG_ON = COMMUNE
SEG_OFF = 1 - COMMUNE
DIGIT_ON = 1 - COMMUNE
DIGIT_OFF = COMMUNE
DELAIS=100


def eteindre_tous_les_digits():
    for digit in DIGITS:
        digit.value(DIGIT_OFF)


def afficher_segments(motif):
    for segment in range(7):
        SEGS[segment].value(((motif >> segment) & 1) == SEG_ON)


def afficher_un_digit(index_digit, valeur):
    eteindre_tous_les_digits()
    if valeur is None:
        afficher_segments(0)
    else:
        afficher_segments(CHIFFRES[valeur])
    DIGITS[index_digit].value(DIGIT_ON)
    time.sleep(0.002)
    DIGITS[index_digit].value(DIGIT_OFF)


def afficher_nombre(nombre):
    limite = 10 ** NB_DIGITS
    valeur = nombre % limite
    chiffres = [None] * NB_DIGITS

    for index in range(NB_DIGITS - 1, -1, -1):
        chiffres[index] = valeur % 10
        valeur //= 10

    for index_digit, chiffre in enumerate(chiffres):
        afficher_un_digit(index_digit, chiffre)


eteindre_tous_les_digits()

while True:
    for nombre in range(10 ** NB_DIGITS):
        debut = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), debut) < DELAIS:
            afficher_nombre(nombre)
        print(nombre)
