from machine import Pin
import time

PATTE_BOUTON = 7
PATTE_LED_ROUGE = 8
PATTE_LED_VERTE = 13
DUREE_ANTI_REBOND_MS = 30

PATTE_BOUTON = Pin(PATTE_BOUTON, Pin.IN, Pin.PULL_UP)
led_rouge = Pin(PATTE_LED_ROUGE, Pin.OUT)
led_verte = Pin(PATTE_LED_VERTE, Pin.OUT)
compteur = 0
etat_led_rouge = 0 # on garde l'état en mémoire (ne pas relire une sortie)
led_rouge.value(etat_led_rouge)

led_verte.value(1)
time.sleep(0.5)
led_verte.value(0)
time.sleep(0.5)
led_verte.value(1)

etat_precedent = PATTE_BOUTON.value()
etat_stable = etat_precedent
instant_dernier_changement = time.ticks_ms()

while True:
    instant_actuel = time.ticks_ms()
    etat_brut = PATTE_BOUTON.value()
    compteur=compteur +1

    if etat_brut != etat_precedent:
        etat_precedent = etat_brut
        instant_dernier_changement = instant_actuel

    if time.ticks_diff(instant_actuel, instant_dernier_changement) >= DUREE_ANTI_REBOND_MS and etat_stable != etat_precedent:
        etat_stable = etat_precedent

        if etat_stable == 0:                 # appui détecté (actif bas)
            etat_led_rouge = 0 if etat_led_rouge else 1
            led_rouge.value(etat_led_rouge)

    time.sleep_ms(5)
