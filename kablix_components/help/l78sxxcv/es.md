# Regulador de tensión L78SxxCV

![Regulador de tensión L78SxxCV](l78sxxcv.webp)

Un regulador lineal positivo de STMicroelectronics, en encapsulado TO-220. Transforma una tensión de entrada más alta en una **tensión de salida fija** (las «xx» del nombre), hasta **2 A**.

Componente de biblioteca: se instala con el gestor de componentes, no está en la paleta de origen.

## Pines

Visto de frente, con la inscripción hacia uno. La inscripción sigue la tensión ajustada: `78xx`, xx con dos cifras (5 V → 7805, 12 V → 7812):

| Pin | Función |
| --- | --- |
| **IN** | Entrada, al menos 2 V por encima de la salida |
| **GND** | Masa común de la entrada y la salida |
| **OUT** | Salida regulada |

## Propiedades

- **Tensión de salida (V)**: 5, 6, 8, 8,5, 9, 12, 15, 18 o 24 V.
- **Corriente máx. (A)**: 2 A por defecto. Por encima, la tensión se hunde.
- **Disipador (°C/W)**: 0 = ninguno (aire libre, 50 °C/W). Un disipador de 5 °C/W reduce la resistencia térmica a 8 °C/W (3 °C/W del encapsulado + 5).

## Margen de 2 V (caída mínima)

El regulador necesita al menos **2 V** más en la entrada que en la salida. Para un L78S05 (5 V), hacen falta por tanto 7 V en la entrada.

Por debajo de ese margen, la salida ya no se mantiene: vale **la entrada menos 2 V**. Una pila de 9 V nueva (9,5 V) en un L78S12 solo da 7,5 V.

Sin tensión en la entrada, la salida está a 0 V.

## Corriente limitada

Si la carga pide más que la corriente máxima, la tensión de salida **se hunde**: el regulador limita su corriente y la tensión baja en proporción. Una resistencia de 1 Ω en un regulador de 5 V limitado a 2 A da 2 V, no 5 V.

## En simulación

La tensión de salida se recalcula con cada cambio del montaje: ajuste, tensión de entrada, carga. La entrada puede venir de una fuente de alimentación de laboratorio, de una pila, de otro regulador en cascada o de un raíl de la placa (VIN, 5V…).

- Un **diodo** en serie en la entrada resta su umbral (0,6 V por defecto); montado al revés, no llega nada.
- Una **resistencia** en serie resta `R × I`: la corriente de entrada es la que entrega el regulador. Con demasiada resistencia, el margen de 2 V desaparece: la salida baja.
- La corriente entregada se **traslada a la fuente** de entrada (fuente de alimentación, pila o regulador anterior). Una pila se descarga así más rápido, y una fuente supera su corriente máxima.

## Corriente de reposo

El regulador consume unos **5 mA** de su entrada, incluso sin carga. Esta corriente se suma a la de la salida: se traslada a la fuente (una pila se descarga un poco más rápido) y hace caer tensión en una resistencia colocada en la entrada.

## Calentamiento

Un regulador lineal convierte en calor lo que resta a la tensión: **P = (Vin − Vout) × I + Vin × Iq**. La temperatura de la unión vale **25 °C + P × resistencia térmica** (50 °C/W sin disipador).

- Por encima de **125 °C**: aviso «demasiado caliente», la salida todavía se mantiene.
- A **150 °C**: la protección térmica **corta la salida** (0 V) y el componente se enmarca en rojo.

Ejemplo: 12 V → 5 V con 0,5 A disipa 3,6 W, es decir 205 °C sin disipador: corte. Con un disipador de 5 °C/W, la unión se queda en 53 °C.

Límite de la simulación: los condensadores recomendados en la entrada y la salida no son necesarios.
