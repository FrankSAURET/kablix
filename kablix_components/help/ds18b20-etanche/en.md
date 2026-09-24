# DS18B20 temperature sensor

![DS18B20 temperature sensor](ds18b20-etanche.webp)

A thermometer. It does not return a voltage that would need converting: it returns **a number**, already in degrees. And it does so over **a single wire**, which lets it do something the other sensors cannot — share the same pin with others.

It is housed in a sealed stainless-steel tube at the end of a lead. You can put it **in water**, in the soil, in a freezer, outdoors in the rain. It is the probe of aquariums, water heaters, weather stations and greenhouses.

Measures from **−55 to +125 °C**, to within **±0.5 °C** between −10 and +85 °C.

Library part: it is installed through the component manager, it is not in the built-in palette.

It comes in two versions, same chip and same program: this stainless-steel waterproof probe at the end of a lead, and a bare [**TO-92** package](ds18b20.md).

## Pins

| Pin               | Role                                             |
| ----------------- | ------------------------------------------------ |
| **GND** (black)   | Ground                                           |
| **Data** (yellow) | The data wire, to connect to a digital pin       |
| **VDD** (red)     | Power, 3.3 V or 5 V                              |

## A pull-up resistor is required

You need a **4.7 kΩ resistor between `Data` and `VDD`**. Without it nothing works — and it is by far the first cause of “my sensor returns −127”.

## What else you need to know

**The 4.7 kΩ resistor between `Data` and `VDD` is still required.** Many probes sold “ready to plug” already have it, hidden in the heat-shrink sleeve near the wires or on a small board supplied with them. If yours has four wires, or a small block with three terminals, look before adding a second one.

**The tube is waterproof, not the wires.** The stainless-steel part goes into the liquid; the part with the stripped ends does not. A probe immersed up to the end of its lead ends up letting water in by capillarity.

**The lead can be long** — several metres work without trouble. Beyond that, or with an unshielded cable near a motor, the readings become erratic: the pull-up resistor is then lowered towards 2.2 kΩ.

**It is slow.** The stainless steel and the air around the chip take time to reach the temperature of the medium: allow several seconds after immersion before the value settles. It is not a defect of the chip, it is the mass to be heated or cooled.

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

If the reading is **−127**, the sensor did not answer: check the 4.7 kΩ resistor, the power supply, and the orientation of the wires.

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
