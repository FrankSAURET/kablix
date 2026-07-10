# Test clavier matriciel 4x4 : balayage des lignes, colonnes en pull-up.
from machine import Pin
import time

lignes = [Pin(n, Pin.OUT, value=1) for n in (2, 3, 4, 5)]
colonnes = [Pin(n, Pin.IN, Pin.PULL_UP) for n in (6, 7, 8, 9)]
touches = [
    ["1", "2", "3", "A"],
    ["4", "5", "6", "B"],
    ["7", "8", "9", "C"],
    ["*", "0", "#", "D"],
]

while True:
    for i, ligne in enumerate(lignes):
        ligne.value(0)
        for j, colonne in enumerate(colonnes):
            if colonne.value() == 0:
                print("Touche :", touches[i][j])
        ligne.value(1)
    time.sleep(0.05)
