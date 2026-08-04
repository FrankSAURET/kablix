# Test des DOUZE circuits integres logiques de la bibliotheque, en un seul
# montage. Tous sont des boitiers DIL-14 alimentes en 3,3 V : patte 14 (VDD ou
# VCC) au rail rouge, patte 7 (GND) a la masse noire. Les familles CD4000 et HC
# acceptent cette tension ; une famille TTL (LS, ALS, F...) refuserait.
#
# Les douze boitiers recoivent les MEMES deux entrees : GP2 (A) et GP3 (B). Les
# quatre portes d'un meme boitier (six pour les inverseurs) font la meme chose
# sur les memes entrees : elles sortent donc le meme niveau et se relient sans
# conflit sur UNE broche de lecture. Les 52 portes du montage sont ainsi toutes
# cablees, avec seulement quatorze broches.
#
#   GP2 = A, GP3 = B ; GP4..GP15 : lecture des douze boitiers.
#
# Le programme balaye les quatre combinaisons A/B et compare chaque sortie a la
# table de verite : « OK » ou « ERREUR ».
from machine import Pin
import time

a_pin = Pin(2, Pin.OUT)
b_pin = Pin(3, Pin.OUT)

# nom du boitier, broche de lecture, fonction logique
BOITIERS = [
    ("CD4081  ET        ", 4, "et"),
    ("CD4071  OU        ", 5, "ou"),
    ("CD4070  OU EXCLUSIF", 6, "ouex"),
    ("CD4011  NON-ET    ", 7, "nonet"),
    ("CD4001  NON-OU    ", 8, "nonou"),
    ("CD40106 NON       ", 9, "non"),
    ("74HC08  ET        ", 10, "et"),
    ("74HC32  OU        ", 11, "ou"),
    ("74HC86  OU EXCLUSIF", 12, "ouex"),
    ("74HC00  NON-ET    ", 13, "nonet"),
    ("74HC02  NON-OU    ", 14, "nonou"),
    ("74HC14  NON       ", 15, "non"),
]
lectures = [Pin(broche, Pin.IN) for (_, broche, _) in BOITIERS]


def attendu(fonction, a, b):
    if fonction == "et":
        return a & b
    if fonction == "ou":
        return a | b
    if fonction == "ouex":
        return a ^ b
    if fonction == "nonet":
        return 1 - (a & b)
    if fonction == "nonou":
        return 1 - (a | b)
    return 1 - a   # l'inverseur ne regarde que l'entree A


print("Portes logiques : A et B communes aux douze boitiers.")
while True:
    for a, b in ((0, 0), (1, 0), (0, 1), (1, 1)):
        a_pin.value(a)
        b_pin.value(b)
        time.sleep(0.2)   # laisse les sorties se propager
        print("A=%d  B=%d" % (a, b))
        for i, (nom, _, fonction) in enumerate(BOITIERS):
            lu = lectures[i].value()
            etat = "OK" if lu == attendu(fonction, a, b) else "ERREUR"
            print("  %s = %d   %s" % (nom, lu, etat))
        time.sleep(0.8)
