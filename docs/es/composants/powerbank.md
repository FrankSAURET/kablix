# Batería externa

![Batería externa](../../img/composants/powerbank.webp)

Batería USB portátil: fuente de tensión **fija de 5 V**, sin ajuste — a diferencia de la [fuente de alimentación de laboratorio](alim.md), no tiene mando. Alimenta un montaje **sin microcontrolador** (un LED se enciende solo con la batería) o aporta la potencia que la placa no puede dar: servomotores, borne *Power In* del [controlador PWM PCA9685](pca9685.md)…

Categoría de la paleta: **Varios**.

## Pines

| Borne | Función |
|-------|------|
| **V+** | polo positivo — 5 V fijos |
| **GND** | masa (0 V, común a todo el montaje) |

Los cables conectados a V+ y GND toman automáticamente los colores rojo y negro.

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `maxcurrent` | Corriente máxima suministrada (A), de 0,1 a 10 en pasos de 0,1 | `2` |

La tensión no se puede ajustar: a diferencia de la fuente de laboratorio, la batería no tiene ni mando ni pantalla.

## Indicadores de carga

Los cuatro LED blancos del dibujo (indicador de carga) se encienden **juntos, con halo**, en cuanto arranca la simulación, y se apagan cuando se detiene. Indican que la batería está activa — no un nivel de carga simulado: Kablix no modela la descarga.

## Limitación de corriente

Mismo mecanismo que la fuente de laboratorio: Kablix estima continuamente la corriente suministrada (camino resistivo más directo de V+ a masa, LED que vuelven a V+, 0,2 A por servomotor, consumo declarado de los módulos alimentados…). Por encima de `maxcurrent`, el montaje se comporta como si estuviera mal alimentado (las salidas de un PCA9685 dejan de moverse, por ejemplo).

## Uso

- Conecte **V+** al raíl positivo del montaje y **GND** a masa — la masa debe ser **común** con la de la placa si ambas alimentan el mismo circuito.
- Práctica para alimentar servomotores o un PCA9685 sin ajustar ninguna tensión: la batería siempre da 5 V.
- Compruebe que `maxcurrent` cubre la carga (0,2 A por servo): si no, las salidas no se mueven.

---

*Dibujo del instrumento realizado por Frank para Kablix.*
