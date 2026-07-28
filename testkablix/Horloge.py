from machine import Pin
import time

# Afficheur 4 digits 7 segments cathode commune.
# Segments a..g : GP2..GP8
# Digits 1..4   : GP10..GP13

SEG_PINS = (2, 3, 4, 5, 6, 7, 8)   # a, b, c, d, e, f, g
DIGIT_PINS = (10, 11, 12, 13)       # digit1, digit2, digit3, digit4

# Cathode commune : segment allume a 1.
SEG_ON = 1
SEG_OFF = 0

# En general, sur un multiplex cathode commune, un digit est actif a 0.
# Si ton cablage est inverse, mets DIGIT_ON = 1 et DIGIT_OFF = 0.
DIGIT_ON = 0
DIGIT_OFF = 1

# Encodage des chiffres (bits a..g, bit0=a, bit6=g).
CHIFFRES = (
	0x3F,  # 0
	0x06,  # 1
	0x5B,  # 2
	0x4F,  # 3
	0x66,  # 4
	0x6D,  # 5
	0x7D,  # 6
	0x07,  # 7
	0x7F,  # 8
	0x6F,  # 9
)

segments = [Pin(pin, Pin.OUT) for pin in SEG_PINS]
digits = [Pin(pin, Pin.OUT) for pin in DIGIT_PINS]


def eteindre_tous_les_digits():
	for d in digits:
		d.value(DIGIT_OFF)


def afficher_motif(motif: int) -> None:
	for i, seg in enumerate(segments):
		bit = (motif >> i) & 1
		seg.value(SEG_ON if bit else SEG_OFF)


def afficher_un_digit(index_digit: int, valeur: int) -> None:
	eteindre_tous_les_digits()
	afficher_motif(CHIFFRES[valeur])
	digits[index_digit].value(DIGIT_ON)
	time.sleep(0.002)
	digits[index_digit].value(DIGIT_OFF)


def rafraichir_affichage(h: int, m: int) -> None:
	d0 = h // 10
	d1 = h % 10
	d2 = m // 10
	d3 = m % 10

	afficher_un_digit(0, d0)
	afficher_un_digit(1, d1)
	afficher_un_digit(2, d2)
	afficher_un_digit(3, d3)


def horloge(start_h: int = 12, start_m: int = 0, start_s: int = 0) -> None:
	h = start_h % 24
	m = start_m % 60
	s = start_s % 60

	t0 = time.time()

	while True:
		# Multiplexage permanent.
		rafraichir_affichage(h, m)

		# Avance de l'heure chaque seconde.
		now = time.time()
		if now - t0 >= 1:
			t0 += 1
			s += 1
			if s >= 60:
				s = 0
				m += 1
				if m >= 60:
					m = 0
					h = (h + 1) % 24


eteindre_tous_les_digits()
horloge(12, 0, 0)
