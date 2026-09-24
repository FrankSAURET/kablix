# DS18B20 temperature sensor

![DS18B20 temperature sensor](ds18b20.webp)

A thermometer. It does not return a voltage that would need converting: it returns **a number**, already in degrees. And it does so over **a single wire**, which lets it do something the other sensors cannot — share the same pin with others.

Measures from **−55 to +125 °C**, to within **±0.5 °C** between −10 and +85 °C.

Library part: it is installed through the component manager, it is not in the built-in palette.

It comes in two versions, same chip and same program: this bare **TO-92** package, and a stainless-steel [waterproof probe](ds18b20-etanche.md) at the end of a lead.

## Pins

| Pin               | Role                                             |
| ----------------- | ------------------------------------------------ |
| **GND** (black)   | Ground                                           |
| **Data** (yellow) | The data wire, to connect to a digital pin       |
| **VDD** (red)     | Power, 3.3 V or 5 V                              |

Mind the orientation: the three legs come out on the same side, and swapping them heats the part for good. Flat side facing you, legs down, you read **GND – Data – VDD** from left to right.

## A pull-up resistor is required

You need a **4.7 kΩ resistor between `Data` and `VDD`**. Without it nothing works — and it is by far the first cause of “my sensor returns −127”.

## Several sensors on a single wire

That is the point of the DS18B20. Each unit leaves the factory with a unique 64-bit **address** burnt into it. You can therefore connect five of them to the same pin — `Data` to `Data`, a single 4.7 kΩ resistor for all of them — and query them one by one by their address.

The program finds them with `search()`, which returns the addresses one at a time.

## Arduino side

Two libraries to install: **OneWire** and **DallasTemperature**.

```cpp
#include <OneWire.h>
#include <DallasTemperature.h>

OneWire wire(2);                 // Data on pin 2
DallasTemperature sensors(&wire);

void setup() {
  Serial.begin(9600);
  sensors.begin();
}

void loop() {
  sensors.requestTemperatures();             // ask for a measurement
  float t = sensors.getTempCByIndex(0);      // the first sensor on the wire
  Serial.println(t);
  delay(1000);
}
```

If the reading is **−127**, the sensor did not answer: check the 4.7 kΩ resistor, the power supply, and the orientation of the legs.

## Pico side (MicroPython)

Both modules are already in MicroPython, nothing to install.

```python
import machine, onewire, ds18x20, time

wire = onewire.OneWire(machine.Pin(2))
sensor = ds18x20.DS18X20(wire)
addresses = sensor.scan()          # the sensors found on the wire

while True:
    sensor.convert_temp()          # ask for a measurement
    time.sleep_ms(750)             # the time it takes
    for a in addresses:
        print(sensor.read_temp(a))
    time.sleep(1)
```

The `750 ms` are not a precaution: it is the time the chip takes to convert at 12 bits. Reading earlier means reading the previous measurement.

## Simulation

In simulation, the part shows a **T°** slider, from −55 to +125 °C. What you set there is what the program reads — the sensor really answers the 1-Wire protocol, address included, just as the chip would. Move the slider while the program runs: the next reading gives the new value.

### Slider all the way left: “read failed”

At **exactly −55 °C**, an Arduino program using **DallasTemperature** shows “read failed” (`DEVICE_DISCONNECTED_C`) instead of the temperature. It is not a defect of the simulation: this library uses −55 °C as a sentinel value meaning “sensor missing”, so it mistakes the lower limit of the sensor for a failure. A real DS18B20 at −55 °C gives exactly the same result.

Set the slider to **−54.5 °C** to see the reading go through. In MicroPython (`ds18x20`), the problem does not arise: −55 °C is read like any other value.

---

*Drawing and sheet: Frank Sauret. Reference: [Analog Devices DS18B20](https://www.analog.com/en/products/ds18b20.html).*
