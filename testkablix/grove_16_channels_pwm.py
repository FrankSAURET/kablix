"""
grove_16_channels_pwm - Bibliothèque MicroPython pour la carte
Grove 16-Channel PWM Driver (PCA9685) - Réf. 108020102

Carte basée sur le NXP PCA9685 : 16 canaux PWM 12 bits, interface I2C.
Conçue pour piloter des servomoteurs ou des LEDs.

Particularités :
    - Adresse I2C par défaut : 0x7F (tous pads d'adresse en position haute).
      Cette adresse est dans la plage réservée I2C (0x78-0x7F), invisible
      au scan classique. La détection se fait par lecture directe du registre MODE1.
    - Alimentation 5V externe obligatoire sur le bornier Power In pour les servos.
    - 16 ports de sortie PWM numérotés P1 à P16 (canaux PCA9685 0 à 15).

Utilisation basique :
    from machine import I2C, Pin
    from grove_16_channels_pwm import Grove16PWM

    i2c = I2C(0, sda=Pin(8), scl=Pin(9), freq=100_000)
    pwm = Grove16PWM(i2c)

    pwm.servo_angle(8, 90)    # Canal 8 (port P9) à 90°
    pwm.servo_angle(8, 0)     # Canal 8 à 0°
    pwm.all_off()             # Coupe tous les signaux
"""

import time


class Grove16PWM:
    """Pilote pour la carte Grove 16-Channel PWM Driver (PCA9685)."""

    # Registres PCA9685
    _MODE1     = 0x00
    _PRESCALE  = 0xFE
    _LED0_ON_L = 0x06   # 4 octets par canal : ON_L, ON_H, OFF_L, OFF_H

    def __init__(self, i2c, addr=0x7F, freq=50,
                 servo_min_us=500, servo_max_us=2500):
        """
        Initialise le pilote Grove 16-Channel PWM.

        Args:
            i2c:          Instance machine.I2C ou machine.SoftI2C déjà configurée.
            addr:         Adresse I2C du PCA9685 (défaut 0x7F, tous pads high).
            freq:         Fréquence PWM en Hz (défaut 50 Hz pour servos).
            servo_min_us: Durée de pulse minimale en µs pour 0° (défaut 500).
            servo_max_us: Durée de pulse maximale en µs pour 180° (défaut 2500).
        """
        self._i2c = i2c
        self._addr = addr
        self._freq = freq
        self._servo_min_us = servo_min_us
        self._servo_max_us = servo_max_us

        self._detect()
        self._init_pca9685()

    def _detect(self):
        """Vérifie la présence du PCA9685 par lecture du registre MODE1."""
        try:
            self._i2c.readfrom_mem(self._addr, self._MODE1, 1)
        except OSError:
            raise RuntimeError(
                f"PCA9685 non trouvé à 0x{self._addr:02X}. "
                "Vérifiez le câblage et l'alimentation 5V externe."
            )

    def _init_pca9685(self):
        """Configure le PCA9685 : reset, prescaler, auto-incrément."""
        # Software reset via General Call
        try:
            self._i2c.writeto(0x00, bytes([0x06]))
            time.sleep_ms(10)
        except OSError:
            pass

        # Mode sleep pour écrire le prescaler
        self._i2c.writeto_mem(self._addr, self._MODE1, bytes([0x10]))
        time.sleep_ms(5)

        # Prescaler : f_osc / (4096 × freq) - 1   (f_osc = 25 MHz)
        prescale = int(round(25_000_000 / (4096 * self._freq)) - 1)
        self._i2c.writeto_mem(self._addr, self._PRESCALE, bytes([prescale]))

        # Sortie du mode sleep + activation auto-incrément
        self._i2c.writeto_mem(self._addr, self._MODE1, bytes([0x20]))
        time.sleep_ms(5)

    @property
    def address(self):
        """Adresse I2C du PCA9685."""
        return self._addr

    @property
    def freq(self):
        """Fréquence PWM actuelle en Hz."""
        return self._freq

    @freq.setter
    def freq(self, value):
        """Change la fréquence PWM (remet le PCA9685 en sleep temporairement)."""
        self._freq = value
        self._i2c.writeto_mem(self._addr, self._MODE1, bytes([0x10]))
        time.sleep_ms(5)
        prescale = int(round(25_000_000 / (4096 * value)) - 1)
        self._i2c.writeto_mem(self._addr, self._PRESCALE, bytes([prescale]))
        self._i2c.writeto_mem(self._addr, self._MODE1, bytes([0x20]))
        time.sleep_ms(5)

    def set_pwm(self, channel, off, on=0):
        """
        Définit les compteurs ON et OFF (12 bits) pour un canal.

        Args:
            channel: Numéro du canal (0-15).
            off:     Valeur du compteur OFF (0-4095).
            on:      Valeur du compteur ON (0-4095, défaut 0).
        """
        if not 0 <= channel <= 15:
            raise ValueError("Canal hors limites (0-15)")
        reg = self._LED0_ON_L + 4 * channel
        self._i2c.writeto_mem(self._addr, reg,
                              bytes([on & 0xFF, on >> 8, off & 0xFF, off >> 8]))

    def duty(self, channel, value):
        """
        Définit le rapport cyclique d'un canal (0-4095).

        Args:
            channel: Numéro du canal (0-15).
            value:   Rapport cyclique (0 = éteint, 4095 = 100%).
        """
        self.set_pwm(channel, int(value))

    def servo_angle(self, channel, angle):
        """
        Positionne un servo entre 0° et 180°.

        Args:
            channel: Numéro du canal (0-15).
            angle:   Angle souhaité (0-180°).
        """
        angle = max(0, min(180, angle))
        pulse_us = self._servo_min_us + \
                   (self._servo_max_us - self._servo_min_us) * angle / 180
        ticks = int(pulse_us * 4096 * self._freq / 1_000_000)
        self.set_pwm(channel, ticks)

    def servo_us(self, channel, pulse_us):
        """
        Positionne un servo avec une largeur de pulse en µs.

        Args:
            channel:  Numéro du canal (0-15).
            pulse_us: Durée de pulse en µs.
        """
        ticks = int(pulse_us * 4096 * self._freq / 1_000_000)
        self.set_pwm(channel, ticks)

    def channel_off(self, channel):
        """Coupe le signal PWM sur un canal."""
        self.set_pwm(channel, 0)

    def all_off(self):
        """Coupe le signal PWM sur tous les canaux (0-15)."""
        for ch in range(16):
            self.set_pwm(ch, 0)
