# Test relais OMRON G5V. Trois cablages sur la meme carte :
#   Rl1 : CORRECT — bobine 5 V prise sur l'alimentation de laboratoire (une
#         sortie du Pico ne sort que 3,3 V, un G5V 5 V ne collerait pas) et
#         commandee par un PN2222A sature, diode de roue libre entre B1 et B2,
#         cathode vers le +. Il colle et allume la LED cablee sur NO.
#   Rl2 : bobine sur GP13 SANS diode de roue libre -> interdit.
#   Rl3 : diode montee a l'envers (anode vers le +) -> interdit aussi.
# Une bobine est une self : a la coupure elle renvoie une surtension qui detruit
# le transistor de commande. La diode de roue libre l'absorbe — elle n'est pas
# facultative.
from machine import Pin
import time

commande = Pin(15, Pin.OUT)          # Rl1, via le transistor
sans_diode = Pin(13, Pin.OUT)        # Rl2
diode_inversee = Pin(12, Pin.OUT)    # Rl3

while True:
    commande.value(1)
    sans_diode.value(1)
    diode_inversee.value(1)
    print("Seul Rl1 colle : les autres sont mal cables.")
    time.sleep(1.5)
    commande.value(0)
    sans_diode.value(0)
    diode_inversee.value(0)
    time.sleep(1.5)
