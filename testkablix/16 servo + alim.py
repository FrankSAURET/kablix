"""
Exemple basique - Grove 16-Channel PWM Driver (PCA9685)
Utilise la bibliothèque grove_16_channels_pwm.

Matériel :
    - Pico W, I2C0 : SDA=GP8, SCL=GP9
    - Carte Grove 108020102, adresse 0x7F (config par défaut)
    - Servos sur P9 à P16 (canaux 8-15)
    - Alimentation 5V externe sur le bornier Power In

Démonstration :
    - Positionne tous les servos à 90° (centre)
    - Balaye un servo de 0° à 180° et retour
    - Coupe les signaux PWM
"""

from machine import I2C, Pin
from grove_16_channels_pwm import Grove16PWM
import time

# --- Initialisation ---
i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=100_000)
pwm = Grove16PWM(i2c)   # adresse 0x7F par défaut
print("Carte Grove 16-Channel PWM prête")

# --- Tous les servos au centre (90°) ---
print("Tous les servos à 90°")
for ch in range(0,8):
    pwm.servo_angle(ch, 90)
time.sleep(2)

# --- Tous les servos à 180° ---
print("Tous les servos à 180°")
for ch in range(0,8):
    pwm.servo_angle(ch, 180)
time.sleep(2)

# --- Tous les servos à 0° ---
print("Tous les servos à 0°")
for ch in range(0,8):
    pwm.servo_angle(ch, 0)
time.sleep(2)

# --- Fin ---
pwm.all_off()
print("Terminé.")
