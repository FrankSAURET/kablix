# Sensor de temperatura NTC

![Sensor de temperatura NTC](../../img/composants/ntc-temp.webp)

Termistor NTC: resistencia en función de la temperatura. Salida analógica.

## Pines

| Pin | Función |
|--------|------|
| **VCC** | Alimentación (+) |
| **OUT** | Salida analógica |
| **GND** | Masa |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `value` | Temperatura simulada (%) | 50 |

## Uso

- OUT a una entrada analógica.
- Convierta el valor del ADC a °C con la ecuación de Steinhart-Hart.

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-ntc-temperature-sensor) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
