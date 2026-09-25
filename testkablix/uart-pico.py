# Test UART : deux liaisons serie, ecoutees par l'analyseur logique.
# Les pinces (SD1, SD2) sont POSEES sur les broches d'emission, sans fil.
# RIEN A REGLER : le projet s'ouvre avec les deux decodages UART deja poses,
# les octets s'ecrivent sous les creneaux (cochez « Bits » dans le panneau P
# pour voir aussi chaque bit : start, 8 donnees poids faible d'abord, stop).
#   SD1 (GP0) : TX de l'UART0, 9600 bauds 8N1 ;
#   SD2 (GP4) : TX de l'UART1, 4800 bauds 8N1 - deux fois plus lente :
#               chaque bit y dure 208 us au lieu de 104 us.
# print() ecrit dans le moniteur serie (USB), pas sur ces broches.
from machine import UART, Pin
import time

ligne1 = UART(0, baudrate=9600, bits=8, parity=None, stop=1, tx=Pin(0), rx=Pin(1))
ligne2 = UART(1, baudrate=4800, bits=8, parity=None, stop=1, tx=Pin(4), rx=Pin(5))

compteur = 0
while True:
    compteur += 1
    ligne1.write("Bonjour %d\r\n" % compteur)
    ligne2.write("K%d\r\n" % compteur)
    print("Bonjour", compteur)
    time.sleep(0.2)
