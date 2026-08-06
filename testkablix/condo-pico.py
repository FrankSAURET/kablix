# Trois circuits RC sur la MEME broche de commande. Seule la constante de
# temps RC change : 33 kOhm x 1 uF = 33 ms (film), 10 kOhm x 10 uF = 0,1 s
# (tantale), 3,3 kOhm x 100 uF = 0,33 s (chimique). A un RC la tension a fait
# 63 % du chemin, a 3 RC elle est a 95 % : la courbe est deja plate, d'ou 1 s
# par phase (un cycle charge + decharge dure 2 s).
#
# Le TRACEUR DE COURBES affiche les trois exponentielles SANS une seule ligne
# de code : la tension du condensateur est posee sur ADC0/1/2 (GP26, GP27,
# GP28), et toute tension posee sur une entree analogique est tracee par une
# sonde interne. La console ne sert qu'a relire les valeurs en clair : elle
# n'imprime qu'une mesure sur deux (la courbe, elle, reste continue).
from machine import ADC, Pin
import time

charge = Pin(15, Pin.OUT, value=0)
mesure = [ADC(Pin(26)), ADC(Pin(27)), ADC(Pin(28))]

def phase(niveau, nom):
    charge.value(niveau)
    for i in range(8):                # 8 x 125 ms = 1 s = 3 RC du plus lent
        time.sleep_ms(125)
        if i % 2 == 0:                # la premiere mesure tombe des 125 ms
            volts = ["%.2f V" % (a.read_u16() * 3.3 / 65535) for a in mesure]
            print(nom, "   ".join(volts))

print("          film(GP26) tantale(GP27) chimique(GP28)")
while True:
    phase(1, "charge  ")
    phase(0, "decharge")
