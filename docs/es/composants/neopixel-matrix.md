# Matriz NeoPixel

![Matriz NeoPixel](../../img/composants/neopixel-matrix.webp)

Matriz de LED RGB direccionables (WS2812), controlada por un solo pin de datos.

## Pines

| Pin | Función |
|--------|------|
| **VCC** | Alimentación (+) |
| **GND** | Masa |
| **DIN** | Entrada de datos |
| **DOUT** | Salida de datos |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `rows` | Número de filas | 8 |
| `cols` | Número de columnas | 8 |

## Uso

- DIN a un pin digital.
- Numeración de los píxeles en serpentín según el cableado.

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-neopixel-matrix) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
