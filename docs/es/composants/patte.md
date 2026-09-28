# Pata de araña

![Pata de araña](../../img/composants/patte.webp)

Pata de robot articulada con **2 servomotores internos independientes**: la **coxa**, que barre la pata **sobre el suelo** (adelante/atrás), y la **patella**, que la **sube y la baja**. Ambas están encajadas mecánicamente — la patella sigue la rotación de la coxa, como en una pata real. Pensada para construir un robot hexápodo o araña de varias patas, cableado a los canales de un [controlador PWM PCA9685](pca9685.md).

Es **exactamente la pata del [robot araña](araignee.md)**: el fémur y la tibia son las mismas piezas, montadas solas y vistas **en 3D** (vista isométrica) — la única forma de mostrar los dos movimientos, uno en el plano del suelo y el otro en el plano vertical. La **sombra proyectada** bajo el pie muestra su altura de un vistazo.

Categoría de la paleta: **Sistemas**.

## Pines

A la izquierda del dibujo, el **conector** lleva dos bornas de 3 hilos, una por articulación — **Coxa** (violeta) y **Patella** (verde) — como un servomotor normal. Los tres **cuadrados dorados** de cada borna son los puntos de conexión; su nombre no está escrito en el dibujo, aparece en la **burbuja de ayuda** al pasar el ratón:

| Pin             | Función                     |
| --------------- | --------------------------- |
| **coxa.GND**    | Masa de la coxa             |
| **coxa.V+**     | Alimentación de la coxa (+) |
| **coxa.PWM**    | Señal de mando de la coxa   |
| **patella.GND** | Masa de la patella          |
| **patella.V+**  | Alimentación de la patella (+) |
| **patella.PWM** | Señal de mando de la patella |

(en el orden del dibujo, de arriba abajo)

Las dos articulaciones son eléctricamente **independientes**: nada impide mandar la coxa desde un pin del microcontrolador y la patella desde un canal de un PCA9685, por ejemplo.

## Propiedades

| Propiedad     | Función                                                                              | Por defecto |
| ------------- | ------------------------------------------------------------------------------------ | --------- |
| `pulsemin`    | Anchura del pulso a 0° (µs), común a las dos articulaciones                          | `500`     |
| `pulsemax`    | Anchura del pulso a 180° (µs), común a las dos articulaciones                        | `2500`    |
| `speed`       | Tiempo para una vuelta completa de 360° a plena velocidad (s), 0 = movimiento instantáneo | `2`   |
| `revcoxa`     | Servo de la coxa montado **al revés**: la misma consigna lo gira en el otro sentido  | sin marcar |
| `revpatella`  | Servo de la patella montado **al revés**                                             | sin marcar |
| `zerocoxa`    | Ángulo **dibujado** cuando el programa envía 0° a la coxa (−360 a +360°)             | `0`       |
| `zeropatella` | Lo mismo para la patella                                                             | `0`       |

Las dos casillas de inversión son un ajuste de **montaje**, no de programa: según el lado en el que se atornille el servo, la misma consigna va en el otro sentido. Marque la casilla y la simulación aplica **180 − ángulo** a esa articulación — el código sigue enviando «30°».

Los dos **ceros** son la otra mitad del mismo ajuste: el brazo se vuelve a colocar sobre las estrías y rara vez cae exactamente donde se querría. `zerocoxa = 20` significa «cuando el programa envía 0°, la pata ya apunta a 20°». El desfase se añade **después** de la inversión: ambos se suman, uno da el sentido y el otro el origen.

### Qué dibuja cada ángulo

| Ángulo   | Coxa (barrido sobre el suelo) | Patella (altura del pie)                                  |
| -------- | -------------------------- | ----------------------------------------------------------- |
| **0°**   | Un cuarto de vuelta en un sentido | Pata **plegada**, pie recogido bajo el cuerpo       |
| **90°**  | Posición de reposo         | Tibia **vertical**: el pie toca el suelo, el robot está de pie |
| **180°** | Un cuarto de vuelta en el otro sentido | Pata **estirada en horizontal**, vientre en el suelo |

## Uso

- Conecte `coxa.PWM` y `patella.PWM` cada uno a un pin del microcontrolador capaz de PWM, o a un canal de un PCA9685 (`coxa.V+`/`coxa.GND` y `patella.V+`/`patella.GND` a la borna de servo correspondiente).
- Biblioteca `Servo` (Arduino): un objeto por articulación, `attach()` y luego `write(ángulo)`.
- Para una araña de 4 patas: coloque 4 instancias del componente y conecte cada una a 2 canales del (o de los) PCA9685. El robot completo también existe ya montado: vea [robot araña](araignee.md).

Pruebas de ejemplo: `patte-uno` y `patte-pico` (carpeta `testkablix`).

---

*Pata y conector dibujados por Frank (planchas *`Composants3D.svg`* y *`Composants2D.svg`*), puestos en volumen por Kablix.*
