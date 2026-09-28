# Sensor de sonido

![Sensor de sonido](../../img/composants/sound.webp)

Micrófono con comparador. Salidas analógica (nivel) y digital (umbral).

## Pines

| Pin | Función |
|--------|------|
| **VCC** | Alimentación (+) |
| **GND** | Masa |
| **AOUT** | Salida analógica |
| **DOUT** | Salida digital (umbral) |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `state` | Sonido detectado (0/1) | 0 |

## Uso

- DOUT a una entrada digital, AOUT a una analógica.
- En el módulo real, ajuste el umbral.

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-small-sound-sensor) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
