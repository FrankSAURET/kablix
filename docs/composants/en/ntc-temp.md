# NTC temperature sensor

![NTC temperature sensor](../img/ntc-temp.png)

NTC thermistor: resistance as a function of temperature. Analog output.

## Pins

| Pin | Role |
|--------|------|
| **VCC** | Power (+) |
| **OUT** | Analog output |
| **GND** | Ground |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `value` | Simulated temperature (%) | 50 |

## Usage

- OUT to an analog input.
- Convert the ADC value to °C using the Steinhart-Hart equation.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-ntc-temperature-sensor) — © Wokwi. `@wokwi/elements` components (MIT license).*
