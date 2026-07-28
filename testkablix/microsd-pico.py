# Test carte microSD (SPI) : initialisation, écriture d'un fichier, relecture.
# La carte simulée est livrée FORMATÉE en FAT16, comme une carte du commerce.
# Le pilote `sdcard.py` (micropython-lib) est dans le dossier `lib/` à côté.
from machine import Pin, SPI
import os, sdcard, time

spi = SPI(0, baudrate=1_320_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))

try:
    carte = sdcard.SDCard(spi, Pin(17))
    os.mount(carte, "/sd")
    print("Carte SD detectee : init OK")
except OSError as e:
    print("ECHEC de l'init SD :", e)
    raise SystemExit

# Écriture (le fichier est créé s'il n'existe pas, sinon on ajoute à la fin).
try:
    with open("/sd/essai.txt", "a") as f:
        f.write("Bonjour depuis Kablix !\n")
        f.write("Duree depuis le demarrage : %d ms\n" % time.ticks_ms())
    print("Ecriture de essai.txt : OK")
except OSError as e:
    print("ECHEC de l'ouverture en ecriture :", e)

# Relecture, comme l'exemple ReadWrite d'Arduino.
try:
    with open("/sd/essai.txt") as f:
        print("--- contenu de essai.txt ---")
        print(f.read(), end="")
        print("--- fin ---")
except OSError as e:
    print("ECHEC de l'ouverture en lecture :", e)

os.umount("/sd")
