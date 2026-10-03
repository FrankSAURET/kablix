# Batería externa

![Batería externa](../../img/composants/powerbank.webp)

Batería USB portátil: fuente de tensión **fija de 5 V**, sin ajuste — a diferencia de la [fuente de alimentación de laboratorio](alim.md), no tiene mando. Alimenta un montaje **sin microcontrolador** (un LED se enciende solo con la batería), aporta la potencia que la placa no puede dar — servomotores, borne *Power In* del [controlador PWM PCA9685](pca9685.md)… — o **alimenta la propia placa**, y se vacía entonces con su consumo.

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
| `capacity` | Capacidad (mAh), de 1 a 50 000 | `10000` |

La tensión no se puede ajustar: a diferencia de la fuente de laboratorio, la batería no tiene ni mando ni pantalla.

## Indicadores de carga

Los cuatro LED blancos del dibujo forman el **indicador de carga**: llena al arrancar (los cuatro encendidos, con halo), pierde un LED por cada cuarto de carga consumido — un LED por cuarto **empezado** sigue encendido, como en una batería real. Vacía, ningún LED: su salida cae a 0 V y todo lo que alimenta se apaga. Cada arranque la vuelve a llenar.

## Descarga y autonomía

La batería se vacía con lo que suministra, en **tiempo de programa** (a cámara lenta o acelerado, un segundo de programa consume lo mismo):

- sus cargas directas — LED, resistencias, servos conectados a **V+**;
- **la placa entera** cuando es ella quien la alimenta: **V+** en una entrada de alimentación de la placa (**5V** de una Arduino, **VSYS** o **VBUS** de una Pico — en **VIN**, 5 V no bastan para el regulador: la placa se niega a arrancar) y **GND** en una masa de la placa. La placa ya no toma nada del USB: su consumo — ella misma, más lo que alimentan sus pines — sale de la batería (vea *Consumo de la placa* en la guía de uso).

El [trazador](../USAGE.md) muestra dos curvas por batería: **`Bat1: carga`** (%) y **`Bat1: autonomía`** (horas restantes a la corriente del momento). Cuando la batería que alimenta la placa está vacía, **la placa se apaga**: la simulación se detiene y la barra de estado dice tras cuánto tiempo de programa.

> Una batería real de 10 000 mAh hace funcionar una Uno más de nueve días: para verla vaciarse durante una sesión, ajuste `capacity` a **1 mAh**. El proyecto de prueba `consommation-uno` lo hace.

## Limitación de corriente

Mismo mecanismo que la fuente de laboratorio: Kablix estima continuamente la corriente suministrada (camino resistivo más directo de V+ a masa, LED que vuelven a V+, 0,2 A por servomotor, consumo declarado de los módulos alimentados…). Por encima de `maxcurrent`, el montaje se comporta como si estuviera mal alimentado (las salidas de un PCA9685 dejan de moverse, por ejemplo).

## Uso

- Conecte **V+** al raíl positivo del montaje y **GND** a masa — la masa debe ser **común** con la de la placa si ambas alimentan el mismo circuito.
- Práctica para alimentar servomotores o un PCA9685 sin ajustar ninguna tensión: la batería siempre da 5 V.
- Compruebe que `maxcurrent` cubre la carga (0,2 A por servo): si no, las salidas no se mueven.
- Para medir la **autonomía** de un montaje, haga que la batería alimente la placa (V+ en 5V o VSYS, GND en GND) y lea la curva de autonomía en el trazador: dormir el microcontrolador la hace subir — mucho en una Pico, poco en una Uno.

---

*Dibujo del instrumento realizado por Frank para Kablix.*
