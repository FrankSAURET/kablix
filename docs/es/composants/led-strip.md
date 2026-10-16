# Tira de LED

![Tira de LED](../../img/composants/led-strip.webp)

Tira de LED RGB direccionables, **extensible**: el número de LED es una propiedad. Para caber en la hoja, la tira se dibuja **enrollada en espiral**, con su entrada en el exterior, unida por tres o cuatro hilos a la conexión. La **conexión es fija**, arriba a la izquierda: cuando cambia el número de LED, la espiral crece hacia abajo y hacia la derecha, la conexión no se mueve.

## Pines

La conexión depende del protocolo.

| Pin | Función | Protocolo |
|--------|------|-----------|
| **GND** | Masa | todos |
| **5V** | Alimentación (+) | todos |
| **DIN** | Datos de entrada (un solo hilo) | WS2811, WS2812(B) / SK6812 |
| **DI** | Datos | APA102, WS2801 |
| **CI** | Reloj | APA102, WS2801 |

## Propiedades

| Propiedad | Función | Valor por defecto |
|-----------|------|--------|
| `leds` | Número de LED (mínimo 1, sin máximo) | 10 |
| `protocol` | Protocolo de la tira, véase abajo | WS2812(B) / SK6812 |
| `colorOrder` | Orden de los colores en el hilo: RGB, BRG, GRB (solo WS2801) | RGB |

Los cuatro protocolos disponibles:

- **Un hilo — WS2811**: 3 pines (GND, 5V, DIN). Orden de colores **RGB**, pausa de **300 µs** al final de la trama.
- **Un hilo — WS2812(B) / SK6812 (NeoPixel)**: 3 pines (GND, 5V, DIN). Orden de colores **GRB**, pausa de **300 µs** al final de la trama.
- **SPI — APA102 (DotStar)**: 4 pines (GND, 5V, DI, CI). SPI modo 0: trama de inicio (32 bits a 0), luego 32 bits por LED (`111` + brillo de 5 bits, azul, verde, rojo), luego trama de fin.
- **SPI — WS2801**: 4 pines (GND, 5V, DI, CI). SPI modo 0: 24 bits por LED, sin trama de inicio. Una pausa de reloj **> 500 µs** fija los colores. El orden de colores es ajustable (RGB por defecto, BRG, GRB).

Cambiar de protocolo cambia la conexión: los hilos ya colocados en un pin que desaparece se pierden.

## Uso

- DIN a un pin digital de la placa, 5V y GND a la alimentación.
- En simulación, un LED **apagado se queda blanco** y un LED **encendido lleva un halo** de su color, tanto más ancho cuanto más brilla.
- Los LED se numeran desde la **entrada** (exterior de la espiral) hasta el **final** (centro): el LED 0 es el más exterior.
- **Un hilo**: bibliotecas NeoPixel (`Adafruit_NeoPixel`, `neopixel`), en cualquier pin digital.
- **SPI**: la tira escucha el **bus SPI de hardware** de la placa (DI en MOSI, CI en SCK), por ejemplo `machine.SPI` en MicroPython o `SPI.transfer` en Arduino. Un SPI emulado por software (pines accionados a mano) no se decodifica. Sin encadenado de tiras SPI.
- La tira se **encadena** como un anillo: consume `leds` colores de la trama común.
