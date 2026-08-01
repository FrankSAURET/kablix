# Trois circuits RC sur la MEME broche de commande. Seule la constante de
# temps RC change : 100 kOhm x 1 uF = 0,1 s (film), 33 kOhm x 10 uF = 0,33 s
# (tantale), 10 kOhm x 100 uF = 1 s (chimique). A un RC la tension a fait
# 63 % du chemin, a 5 RC la charge est pleine — d'ou les 5 s par phase.
#
# Le TRACEUR DE COURBES affiche les trois exponentielles SANS une seule ligne
# de code : la tension du condensateur est posee sur ADC0/1/2 (GP26, GP27,
# GP28), et toute tension posee sur une entree analogique est tracee par une
# sonde interne. La console ne sert ici qu'a relire les valeurs en clair.
from machine import ADC, Pin
import time

charge = Pin(15, Pin.OUT, value=0)
mesure = [ADC(Pin(26)), ADC(Pin(27)), ADC(Pin(28))]

def phase(niveau, nom):
    charge.value(niveau)
    for _ in range(10):               # 10 x 500 ms = 5 s = 5 RC du plus lent
        time.sleep_ms(500)
        # volts = ["%.2f V" % (a.read_u16() * 3.3 / 65535) for a in mesure]
        # print(nom, "   ".join(volts))

print("          film(GP26) tantale(GP27) chimique(GP28)")
while True:
    phase(1, "charge  ")
    phase(0, "decharge")
    
