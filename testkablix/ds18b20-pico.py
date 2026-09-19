# Test DS18B20 : sonde etanche sur GP14 (1-Wire Dallas).
# En simulation, le curseur « Temperature » du composant donne la valeur lue.
# Resistance de 4,7 kohms entre Data et 3,3 V : obligatoire.
from machine import Pin
import onewire
import ds18x20
import time

fil = onewire.OneWire(Pin(14))
capteurs = ds18x20.DS18X20(fil)
adresses = capteurs.scan()
print("capteurs trouves :", len(adresses))

while True:
    capteurs.convert_temp()
    time.sleep(0.75)   # 750 ms de conversion en 12 bits
    for numero, adresse in enumerate(adresses):
        print("T{} =".format(numero), capteurs.read_temp(adresse), "C")
    time.sleep(0.25)
