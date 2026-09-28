# NeoPixel

![NeoPixel](../../img/composants/neopixel.webp)

LED RGB direccionable (WS2812). Encadenable: la salida de un LED alimenta la entrada del siguiente.

## Pines

| Pin | Función |
|--------|------|
| **VDD** | Alimentación (+) |
| **VSS** | Masa |
| **DIN** | Entrada de datos |
| **DOUT** | Salida de datos (hacia el píxel siguiente) |

## Uso

- DIN a un pin digital (el primer píxel).
- Bibliotecas Adafruit_NeoPixel / FastLED.

## En simulación: se sigue la cadena

Conecte el **DOUT** de un píxel al **DIN** del siguiente: Kablix sigue la cadena y reparte la trama. El primer píxel conectado al pin del microcontrolador muestra `pixel[0]`, el siguiente `pixel[1]`, y así sucesivamente. Un anillo o una matriz insertados en la cadena consumen tantos colores como LED tienen.

Declare por tanto en su programa el número **total** de LED de la cadena:

```python
import neopixel
from machine import Pin
chain = neopixel.NeoPixel(Pin(0), 3)   # 3 píxeles en serie en GP0
chain[2] = (0, 0, 255)                 # el TERCER píxel se pone azul
chain.write()
```

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-neopixel) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
