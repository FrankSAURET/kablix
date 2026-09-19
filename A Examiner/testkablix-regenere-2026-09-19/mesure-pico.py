# BANC DE MESURE : cinq montages sur une planche, six appareils dessus.
#
#   M1 VOLTMETRE   aux bornes du moteur       -> suit le rapport cyclique
#   M2 AMPEREMETRE en serie sur son alim      -> suit le rapport cyclique
#   O1 OSCILLOSCOPE sur la base du transistor -> montre le creneau, pas sa moyenne
#   M3 VOLTMETRE   aux bornes du ventilateur  -> l'alim s'affaisse sous 850 mA
#   M4 VOLTMETRE   aux bornes de la bobine    -> sur le 3,3 V de la carte
#   M5 VOLTMETRE   sur le curseur du pot      -> la moitie de la tension d'alim
#
# Regarde M1 et M2 suivre le rapport cyclique pendant que O1 garde la meme
# hauteur de creneau : le multimetre moyenne, l'oscilloscope montre.
from machine import Pin, PWM, ADC
import time

variateur = PWM(Pin(15))
variateur.freq(1000)
relais = Pin(14, Pin.OUT)
curseur = ADC(26)

relais.value(1)          # le relais colle et reste colle
print("Banc de mesure : M1/M2 suivent le rapport cyclique, O1 non.")

while True:
    for pourcent in range(0, 101, 25):
        variateur.duty_u16(pourcent * 65535 // 100)
        time.sleep_ms(1200)
        print("rapport cyclique", pourcent, "%  |  curseur =", curseur.read_u16())
