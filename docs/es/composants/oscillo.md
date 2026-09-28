# Osciloscopio

![Osciloscopio](../../img/composants/oscillo.webp)

Instrumento de medida con dos bornes banana, como el [multímetro](multimetre.md) — pero en lugar de un número **dibuja la tensión a lo largo del tiempo**. La pantalla lleva una cuadrícula de **10 por 10**, con los dos ejes por el centro. Dos mandos fijan el tamaño de un cuadro: uno para la altura (voltios) y otro para la anchura (tiempo).

Categoría de la paleta: **Instrumentos de medida**.

## Pines

| Borne | Función |
|-------|------|
| **+** | Borne banana **rojo** — el punto cuya tensión se observa |
| **GND** | Borne banana **negro** — el punto de referencia |

Los dos bornes están a 20 px (dos pasos de cuadrícula). El osciloscopio se conecta **en paralelo**, en bornes de lo que se quiere ver, exactamente como un voltímetro: en bornes de una resistencia, de un LED, o entre un pin de la placa y la masa. No consume nada, el montaje se comporta como si no estuviera.

Si la traza baja en lugar de subir, las dos puntas están intercambiadas — no es un error de cableado, solo un signo.

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `voltsdiv` | Altura de un cuadro, en voltios: `0.1`, `0.5`, `1`, `2` o `5` | `1` |
| `sdiv` | Anchura de un cuadro, en segundos — **cualquier número** | `1` |
| `trigger` | Tensión de **disparo**, en voltios. **Vacía** = se ajusta sola | *(vacía)* |
| `triggeredge` | Qué flanco dispara: `rising` (subida) o `falling` (bajada) | `rising` |

Ambas se ajustan en el panel en cualquier momento, o **con el ratón en los mandos durante la simulación**.

## Los dos mandos

Cada mando gira una posición por **clic**: en su **mitad derecha** para girar a la derecha, en su **mitad izquierda** para girar a la izquierda. La **rueda** del ratón también funciona.

- **Volts/Div** (mando izquierdo): cinco posiciones dibujadas, `0.1 · 0.5 · 1 · 2 · 5` voltios por cuadro, con un **tope** en cada extremo. Cuanto más pequeño es el número, más alta es la traza. La pantalla tiene 5 cuadros por encima del eje y 5 por debajo: a 1 V/div, muestra de −5 V a +5 V.
- **s/Div** (mando derecho): **sin tope**, gira tanto como se quiera. A la **derecha** la traza **se estira** (menos segundos por cuadro, se ve el detalle); a la **izquierda** **se encoge** (se ve un tramo de tiempo más largo). Una vuelta completa es un factor **10**, es decir ocho posiciones. No hay lista `1-2-5`: los valores intermedios existen (`1.33 s/div`, `562 ms/div`…).

El rótulo **bajo la pantalla** recuerda los dos rangos y la tensión de disparo, en la unidad que resulte más clara:

```
Vert: 2 V/div
Hor: 500 ms/div
Trig: 0.8 V
```

## El disparo

Sin él, una traza que se repite **se desliza sin fin**: cada imagen empieza donde la ha dejado el azar, y una señal cuadrada perfectamente estable parece correr por la pantalla. El disparo lo arregla como se vuelve a calar una película en la misma imagen: el instrumento busca hacia atrás en el tiempo el último lugar donde la señal **cruza una tensión dada en un sentido dado**, y pone **ese punto** en el borde izquierdo de la pantalla. La traza se vuelve a dibujar entonces siempre en el mismo sitio, inmóvil.

- **El cursor** — el pequeño triángulo azul pegado al borde **izquierdo** de la pantalla — da la **tensión**. Durante la simulación **se agarra con el ratón** y se sube o se baja; el rótulo lo sigue (`Trig: …`). Mientras no lo toque, se coloca solo **a media altura de la señal**, lo que sirve para casi todo (cuadrada, senoide, diente de sierra).
- **El pequeño mando** de abajo a la derecha del dibujo elige el **sentido**: su mitad azul **arriba** = flanco de **subida** (la señal sube al cruzar), **abajo** = flanco de **bajada**. Un clic los intercambia.

Si la señal nunca cruza esa tensión — una tensión continua estable, o un cursor subido demasiado — no hay nada en lo que calarse: la traza **vuelve a correr** como antes. Es la señal de que el cursor tiene que volver a bajar dentro de la señal.

## Lo que muestra la pantalla

- Sin disparo posible, la traza **se desplaza hacia la izquierda**: el presente está en el borde **derecho**, el pasado sale por la izquierda. La anchura visible es de **10 cuadros**, es decir diez veces el rango horizontal.
- El tiempo mostrado es el del **programa**, no el del reloj de pared. Ralentizada, la traza se dibuja más despacio pero conserva la escala correcta.
- Una señal demasiado alta se **recorta en el borde** de la pantalla, como en un instrumento real: baje el rango vertical (un número mayor) para que quepa.
- Bornes **al aire** (nada conectado): la traza se detiene.
- La pantalla se **borra al arrancar la simulación**: cada ejecución empieza con una traza limpia.
- Fuera de la simulación la pantalla está vacía y los mandos no giran — un clic sirve entonces para seleccionar y mover el instrumento.

> **Lo que no sabe hacer.** El instrumento toma **un punto por fotograma**, es decir unos 60 por segundo. Muestra muy bien lo que es **lento**: un LED que se enciende, un condensador que se carga, un potenciómetro que se gira, una señal que parpadea a unos pocos hercios. **No** muestra la forma de una señal rápida (un PWM de 500 Hz, una trama serie): solo capta algunos puntos al azar.

## Uso

- Ponga los dos bornes en los puntos que quiere comparar, arranque la simulación y ajuste primero los **Volts/Div** para que la traza quepa en la pantalla, y después los **s/Div** para ver lo que le interesa.
- Una traza que corre por la pantalla mientras la señal se repite: hay que ajustar el **disparo** — baje el cursor al centro de la señal.
- Para ver cargarse un condensador, use 1 V/div y unos cientos de milisegundos por cuadro.
- Para seguir una tensión que se mueve despacio (un sensor, un potenciómetro), suba a varios segundos por cuadro: la pantalla se convierte en un registrador gráfico.

---

*Dibujo del instrumento realizado por Frank para Kablix.*
