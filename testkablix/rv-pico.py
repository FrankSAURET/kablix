# Test des trois résistances variables nues : chacune forme un pont
# diviseur avec une résistance fixe de sa valeur de repos.
#   ADC0/GP26 : LDR 50 kΩ à 1 lx + 50 kΩ   (curseur = éclairement)
#   ADC1/GP27 : CTN 10 kΩ à 25 °C + 10 kΩ  (curseur = température)
#   ADC2/GP28 : CTP 2 kΩ à 25 °C + 2 kΩ    (curseur = température)
# En simulation : éclairer la LDR et chauffer la CTN FAIT MONTER la lecture,
# chauffer la CTP la fait descendre.
from machine import ADC
import time

ldr = ADC(26)
ctn = ADC(27)
ctp = ADC(28)

while True:
    print("LDR ADC0 =", ldr.read_u16(),
          "| CTN ADC1 =", ctn.read_u16(),
          "| CTP ADC2 =", ctp.read_u16())
    time.sleep(0.3)
