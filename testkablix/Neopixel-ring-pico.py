from machine import Pin
from neopixel import NeoPixel
from time import sleep_ms


NUM_LEDS = 16
PIN_NUM = 26  # DIN du ring sur GP26
STEP_DELAY_MS = 40  # rotation rapide

# Palette de couleurs (R, G, B)
COLORS = [
	(255, 0, 0),
	(0, 255, 0),
	(0, 0, 255),
	(255, 128, 0),
	(180, 0, 255),
	(0, 255, 180),
]

# Intensite de la tete puis de la trainee (4 LEDs)
TRAIL_LEVELS = [1.0, 0.45, 0.25, 0.12, 0.06]


def scale_color(color, factor):
	return (
		int(color[0] * factor),
		int(color[1] * factor),
		int(color[2] * factor),
	)


np = NeoPixel(Pin(PIN_NUM, Pin.OUT), NUM_LEDS)

pos = 0
color_index = 0

while True:
	# Eteint tout avant de dessiner la nouvelle position
	for i in range(NUM_LEDS):
		np[i] = (0, 0, 0)

	base_color = COLORS[color_index]

	# Tete + trainee sur 4 LEDs derriere
	for offset, level in enumerate(TRAIL_LEVELS):
		idx = (pos - offset) % NUM_LEDS
		np[idx] = scale_color(base_color, level)

	np.write()
	sleep_ms(STEP_DELAY_MS)

	pos = (pos + 1) % NUM_LEDS

	# Changement de couleur a chaque tour complet
	if pos == 0:
		color_index = (color_index + 1) % len(COLORS)
