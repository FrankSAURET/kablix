# Barrera infrarroja de haz

![Barrera infrarroja de haz](ir-barrier.webp)

Dos cajas enfrentadas. La de la derecha emite un haz infrarrojo — invisible a simple vista — y la de la izquierda lo recibe. Mientras la luz pasa, la barrera dice «no pasa nada». En cuanto un objeto corta el haz, también lo dice. Es el sensor de las puertas automáticas, los ascensores y los contadores de piezas.

Componente de biblioteca: se instala con el gestor de componentes, no está en la paleta de origen.

## Pines

| Pin | Función |
|--------|------|
| **Vcc.e** (rojo, emisor) | Alimentación del emisor, 5 V |
| **GND.e** (negro, emisor) | Masa del emisor |
| **Vcc.r** (rojo, receptor) | Alimentación del receptor, 5 V |
| **GND.r** (negro, receptor) | Masa del receptor |
| **Out** (amarillo, receptor) | Salida, a conectar a un pin digital |

Hay que alimentar **las dos** cajas. Un emisor sin alimentación no ilumina nada: el receptor cree entonces que hay un obstáculo todo el tiempo.

## La resistencia de pull-up es obligatoria

La salida es de **colector abierto**: dentro solo hay un interruptor hacia masa. Puede tirar del hilo hacia ABAJO, nunca hacia arriba. Por sí sola, se queda en 0 pase lo que pase.

Alguien tiene que volver a subirla. Dos maneras:

- una **resistencia de 10 kΩ** entre `Out` y los 5 V (el «pull-up»);
- o el pull-up **interno** de la placa, activado por el programa: `pinMode(2, INPUT_PULLUP)` en Arduino, `Pin(2, Pin.IN, Pin.PULL_UP)` en el Pico.

Sin ninguno de los dos, Kablix enmarca el componente en rojo y lo dice. Y sobre todo, nunca conecte `Out` directamente a los 5 V sin resistencia: en cuanto el sensor tira, es la alimentación la que queda en cortocircuito.

## Qué vale la salida

| Haz | Transistor de salida | `Out` |
|----------|----------------------|-------|
| Pasa (nada entre las dos cajas) | conduce, tira hacia masa | **0** |
| Cortado (hay un objeto) | bloqueado, el pull-up sube el hilo | **1** |

La salida está, por tanto, **activa a nivel alto** cuando pasa un objeto. Un `digitalRead()` que devuelve 1 = obstáculo.

## Simulación

En simulación, el componente muestra una casilla **Obstáculo**. Marcada, la barra amarilla sube entre las dos cajas y corta el haz: `Out` pasa a 1. Desmarcada, la barra baja, la luz vuelve a pasar y `Out` vuelve a 0.

Kablix comprueba el cableado: alimentación de las dos cajas, presencia de un pull-up (externo o interno) y ausencia de cortocircuito en la salida. Cada fallo se nombra.

---

*Dibujo y ficha: Frank Sauret. Referencia: [DFRobot SEN0499](https://www.dfrobot.com/product-2388.html).*
