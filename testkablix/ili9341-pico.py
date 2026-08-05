from machine import Pin, SPI
import time

LARGEUR = 240
HAUTEUR = 320

NOIR = 0x0000
BLANC = 0xFFFF
ROUGE = 0xF800
VERT = 0x07E0
BLEU = 0x001F
JAUNE = 0xFFE0
CYAN = 0x07FF
MAGENTA = 0xF81F
ORANGE = 0xFD20
GRIS = 0x8410

POLICE = {
    " ": (
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
        "00000",
    ),
    "1": (
        "00100",
        "01100",
        "00100",
        "00100",
        "00100",
        "00100",
        "01110",
    ),
    "3": (
        "11110",
        "00001",
        "00001",
        "01110",
        "00001",
        "00001",
        "11110",
    ),
    "4": (
        "00010",
        "00110",
        "01010",
        "10010",
        "11111",
        "00010",
        "00010",
    ),
    "9": (
        "01110",
        "10001",
        "10001",
        "01111",
        "00001",
        "00010",
        "11100",
    ),
    "A": (
        "01110",
        "10001",
        "10001",
        "11111",
        "10001",
        "10001",
        "10001",
    ),
    "B": (
        "11110",
        "10001",
        "10001",
        "11110",
        "10001",
        "10001",
        "11110",
    ),
    "C": (
        "01110",
        "10001",
        "10000",
        "10000",
        "10000",
        "10001",
        "01110",
    ),
    "D": (
        "11110",
        "10001",
        "10001",
        "10001",
        "10001",
        "10001",
        "11110",
    ),
    "E": (
        "11111",
        "10000",
        "10000",
        "11110",
        "10000",
        "10000",
        "11111",
    ),
    "F": (
        "11111",
        "10000",
        "10000",
        "11110",
        "10000",
        "10000",
        "10000",
    ),
    "G": (
        "01110",
        "10001",
        "10000",
        "10111",
        "10001",
        "10001",
        "01111",
    ),
    "I": (
        "11111",
        "00100",
        "00100",
        "00100",
        "00100",
        "00100",
        "11111",
    ),
    "L": (
        "10000",
        "10000",
        "10000",
        "10000",
        "10000",
        "10000",
        "11111",
    ),
    "M": (
        "10001",
        "11011",
        "10101",
        "10101",
        "10001",
        "10001",
        "10001",
    ),
    "O": (
        "01110",
        "10001",
        "10001",
        "10001",
        "10001",
        "10001",
        "01110",
    ),
    "P": (
        "11110",
        "10001",
        "10001",
        "11110",
        "10000",
        "10000",
        "10000",
    ),
    "R": (
        "11110",
        "10001",
        "10001",
        "11110",
        "10100",
        "10010",
        "10001",
    ),
    "S": (
        "01111",
        "10000",
        "10000",
        "01110",
        "00001",
        "00001",
        "11110",
    ),
    "T": (
        "11111",
        "00100",
        "00100",
        "00100",
        "00100",
        "00100",
        "00100",
    ),
}

cs = Pin(17, Pin.OUT, value=1)
dc = Pin(20, Pin.OUT, value=0)
rst = Pin(21, Pin.OUT, value=1)
spi = SPI(0, baudrate=10_000_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))


def rgb565(r, g, b):
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)


def commande(c, donnees=b""):
    cs.value(0)
    dc.value(0)
    spi.write(bytes([c]))
    if donnees:
        dc.value(1)
        spi.write(donnees)
    cs.value(1)


def flux_pixels(debut=False, fin=False):
    if debut:
        cs.value(0)
        dc.value(0)
        spi.write(b"\x2C")
        dc.value(1)
    if fin:
        cs.value(1)


def fenetre(x0, y0, x1, y1):
    commande(0x2A, bytes([x0 >> 8, x0 & 0xFF, x1 >> 8, x1 & 0xFF]))
    commande(0x2B, bytes([y0 >> 8, y0 & 0xFF, y1 >> 8, y1 & 0xFF]))


def rempli_rect(x, y, largeur, hauteur, couleur):
    if largeur <= 0 or hauteur <= 0:
        return
    x1 = min(LARGEUR - 1, x + largeur - 1)
    y1 = min(HAUTEUR - 1, y + hauteur - 1)
    x = max(0, x)
    y = max(0, y)
    fenetre(x, y, x1, y1)
    bloc = bytes([couleur >> 8, couleur & 0xFF]) * (x1 - x + 1)
    flux_pixels(debut=True)
    for _ in range(y1 - y + 1):
        spi.write(bloc)
    flux_pixels(fin=True)


def hline(x, y, longueur, couleur):
    rempli_rect(x, y, longueur, 1, couleur)


def vline(x, y, hauteur, couleur):
    rempli_rect(x, y, 1, hauteur, couleur)


def contour_rect(x, y, largeur, hauteur, couleur):
    hline(x, y, largeur, couleur)
    hline(x, y + hauteur - 1, largeur, couleur)
    vline(x, y, hauteur, couleur)
    vline(x + largeur - 1, y, hauteur, couleur)


def pixel(x, y, couleur):
    if 0 <= x < LARGEUR and 0 <= y < HAUTEUR:
        fenetre(x, y, x, y)
        flux_pixels(debut=True)
        spi.write(bytes([couleur >> 8, couleur & 0xFF]))
        flux_pixels(fin=True)


def ligne(x0, y0, x1, y1, couleur):
    dx = abs(x1 - x0)
    dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        pixel(x0, y0, couleur)
        if x0 == x1 and y0 == y1:
            break
        e2 = err * 2
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def cercle(xc, yc, rayon, couleur):
    x = rayon
    y = 0
    erreur = 1 - rayon
    while x >= y:
        for px, py in (
            (xc + x, yc + y), (xc + y, yc + x),
            (xc - y, yc + x), (xc - x, yc + y),
            (xc - x, yc - y), (xc - y, yc - x),
            (xc + y, yc - x), (xc + x, yc - y),
        ):
            pixel(px, py, couleur)
        y += 1
        if erreur < 0:
            erreur += 2 * y + 1
        else:
            x -= 1
            erreur += 2 * (y - x) + 1


def disque(xc, yc, rayon, couleur):
    for y in range(-rayon, rayon + 1):
        largeur = int((rayon * rayon - y * y) ** 0.5)
        hline(xc - largeur, yc + y, largeur * 2 + 1, couleur)


def caractere(x, y, lettre, couleur, fond=None, echelle=1):
    motif = POLICE.get(lettre, POLICE[" "])
    for ligne_index, ligne_bits in enumerate(motif):
        for col_index, bit in enumerate(ligne_bits):
            px = x + col_index * echelle
            py = y + ligne_index * echelle
            if bit == "1":
                rempli_rect(px, py, echelle, echelle, couleur)
            elif fond is not None:
                rempli_rect(px, py, echelle, echelle, fond)


def texte(x, y, message, couleur, fond=None, echelle=1):
    curseur = x
    for lettre in message:
        caractere(curseur, y, lettre, couleur, fond, echelle)
        curseur += 6 * echelle


def ecran_demo():
    rempli_rect(0, 0, LARGEUR, HAUTEUR, rgb565(8, 12, 24))
    rempli_rect(0, 0, LARGEUR, 44, rgb565(30, 30, 90))
    rempli_rect(0, 44, LARGEUR, 4, CYAN)
    texte(16, 10, "DEMO", JAUNE, rgb565(30, 30, 90), 3)
    texte(120, 14, "ILI9341", BLANC, rgb565(30, 30, 90), 2)

    contour_rect(10, 58, 220, 112, BLANC)
    ligne(10, 58, 229, 169, MAGENTA)
    ligne(229, 58, 10, 169, CYAN)
    disque(62, 114, 28, ROUGE)
    cercle(62, 114, 36, JAUNE)
    rempli_rect(110, 78, 92, 24, VERT)
    rempli_rect(110, 110, 92, 24, BLEU)
    rempli_rect(110, 142, 92, 14, ORANGE)
    texte(122, 84, "PICO", NOIR, VERT, 2)
    texte(128, 116, "RGB", BLANC, BLEU, 2)

    texte(24, 188, "FORMES", BLANC, None, 3)
    rempli_rect(20, 224, 36, 36, ROUGE)
    rempli_rect(68, 224, 36, 36, VERT)
    rempli_rect(116, 224, 36, 36, BLEU)
    rempli_rect(164, 224, 36, 36, JAUNE)
    disque(38, 286, 18, CYAN)
    disque(86, 286, 18, MAGENTA)
    disque(134, 286, 18, ORANGE)
    disque(182, 286, 18, GRIS)


# Reset matériel puis réveil
rst.value(0)
time.sleep_ms(10)
rst.value(1)
time.sleep_ms(10)
commande(0x01)
time.sleep_ms(5)
commande(0x11)
time.sleep_ms(120)
commande(0x3A, b"\x55")
commande(0x36, b"\x48")
commande(0x29)
time.sleep_ms(20)

ecran_demo()
print("Affichage de demonstration envoye au TFT")
