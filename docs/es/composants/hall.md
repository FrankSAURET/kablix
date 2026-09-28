# Sensor de efecto Hall

![Sensor de efecto Hall](../../img/composants/hall.webp)

Detector de campo magnético **todo o nada** en encapsulado TO-92 (A3144, A3141, US1881…). Sin imán cerca, su salida queda libre; en cuanto el campo supera su umbral, la salida **tira hacia masa**. Es el sensor de los tacómetros, los finales de carrera sin contacto y la detección de puerta cerrada.

## Pines

| Pin | Función |
|--------|------|
| **V+** | Alimentación (+) |
| **GND** | Masa |
| **S** | Salida digital, de **drenador abierto** y **activa a nivel bajo** |

El patillaje varía de una referencia a otra: las propiedades `V+`, `GND` y `S` indican en qué **patilla** (1, 2 o 3) está cada electrodo. Los nombres nunca se mueven — cambiar el patillaje nunca deja un cable huérfano.

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `text` | Inscripción del encapsulado (una línea por salto de línea) | Hall |
| `V+` | Número de la patilla de alimentación | 1 |
| `GND` | Número de la patilla de masa | 2 |
| `S` | Número de la patilla de salida | 3 |
| `trigger` | Distancia de disparo (mm) | 10 |

## Simulación

- Un **imán** aparece junto al sensor en cuanto corre la simulación: **arrástrelo con el ratón** para acercarlo o alejarlo. La cota de encima da la distancia; la línea se pone **verde** cuando el sensor conmuta.
- Por debajo de la distancia de disparo (`trigger`), la salida pasa a nivel **bajo**. Por encima, la salida queda libre — es el pull-up el que la vuelve a subir.
- **La resistencia de pull-up es obligatoria**: o la del microcontrolador (`pinMode(pin, INPUT_PULLUP)` o `Pin.IN, Pin.PULL_UP`), o una resistencia de 10 kΩ entre S y el raíl +. Sin ella, mensaje *«La salida del sensor de efecto Hall necesita una resistencia de pull-up»*, un marco rojo alrededor del culpable, y la salida se queda baja.
- La salida conectada **directamente al raíl +** (0 Ω) es un cortocircuito: el sensor tira a masa un raíl que no puede sostener. Mismo mensaje y mismo marco rojo.
- Sensor **sin alimentar** (V+ o GND al aire): mismo aviso, ninguna detección.

## Uso

- Cableado Arduino: V+ a +5 V, GND a masa, S a una entrada digital, resistencia de 10 kΩ entre S y +5 V. Lea `digitalRead(pin) == LOW` para «imán presente».
- Cableado Pico: V+ a 3V3, GND a masa, S a un GPIO declarado `Pin(n, Pin.IN, Pin.PULL_UP)` — ninguna resistencia que cablear.
- Un sensor **unipolar** (A3144) solo responde a un polo: si un imán real no dispara nada, dele la vuelta.

---

*Componente propio de Kablix — dibujo de Frank Sauret.*
