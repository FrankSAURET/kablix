# Load libraries
from machine import ADC
import math
from time import sleep

# Initialization of the ADC0 (GPIO26)
adc = ADC(0)

print("KY-013 Temperature measurement")

while True:
    # Read ADC0 as a decimal number
    read = adc.read_u16()
    # Calculate voltage
    voltage = read * 3.3 / 65536
    # Conversion from voltage to temperature
    temperature = ((voltage / 3.3) * 10000) / (1 - (voltage / 3.3))
    temperature = 1 / ((1 / 298.15) + (1 / 3950) * math.log(temperature / 10000))
    temperature = temperature - 273.15
    # Serial output of the calculated temperature
    print("Temperature : " + str(temperature) + " °C")
    sleep(1)
