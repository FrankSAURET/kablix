from machine import Pin, ADC
import time

# GP13 en sortie (charge/décharge)
charge_pin = Pin(13, Pin.OUT)

# ADC1 = GP27 sur Raspberry Pi Pico
adc = ADC(1)

def read_voltage():
    # Conversion 16 bits → tension (3.3 V max)
    raw = adc.read_u16()
    voltage = raw * 3.3 / 65535
    return voltage

while True:
    print("=== CHARGE ===")
    charge_pin.value(1)  # charge
    for _ in range(20):
        print("V =", read_voltage())
        time.sleep(0.05)

    print("=== DECHARGE ===")
    charge_pin.value(0)  # décharge
    for _ in range(20):
        print("V =", read_voltage())
        time.sleep(0.05)

    time.sleep(1)
