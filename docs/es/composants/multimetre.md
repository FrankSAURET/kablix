# Multímetro

![Multímetro](../../img/composants/multimetre.webp)

Instrumento de medida con dos bornes banana. El **interruptor de palanca** elige lo que mide: palanca **arriba** = **corriente continua** (amperímetro), palanca **abajo** = **tensión continua** (voltímetro). La pantalla muestra la medida con su unidad, como un instrumento real.

Categoría de la paleta: **Instrumentos de medida**.

## Pines

| Borne | Función |
|-------|------|
| **+** | Borne banana **rojo** — entrada de la corriente, o punto más alto de la tensión medida |
| **GND** | Borne banana **negro** — borne de retorno |

Los dos bornes están a 20 px (dos pasos de cuadrícula). Si la medida sale **negativa**, las dos puntas están intercambiadas — como en un instrumento real, no es un error de cableado, solo un signo.

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `mode` | Medida: `voltage` (tensión continua) o `current` (corriente continua) | `voltage` |

El modo se elige en el panel **en cualquier momento**, o con un clic en el interruptor de palanca **durante la simulación**. Cambiar de modo borra la pantalla: unos amperios leídos como voltios no significan nada.

## Voltímetro: en paralelo

El voltímetro mide una **diferencia de altura eléctrica** entre sus dos bornes. Se conecta **en bornes** de lo que se quiere medir, sin cortar nada:

- en bornes de una resistencia, un LED, una pila;
- entre un pin de la placa y la masa.

No consume nada: el montaje se comporta exactamente como si el instrumento no estuviera. Se puede, por tanto, dejarlo conectado sin falsear nunca nada.

## Amperímetro: en serie

El amperímetro cuenta lo que **pasa a través** de sus bornes. Hay que **abrir el circuito** e insertarlo en el hueco, dentro de la rama cuya corriente se quiere conocer:

```
+5 V ──── R 1 kΩ ──── [+ multímetro GND] ──── GND
```

Eléctricamente, el amperímetro es un **simple cable**: sus dos bornes son un único punto del circuito. Eso es lo que permite que la corriente lo atraviese sin que la medida cambie nada.

> **Atención — la trampa clásica.** Un amperímetro colocado **en bornes** de una alimentación (como se colocaría un voltímetro) **la pone en cortocircuito**: un cable une directamente el más con el menos. Kablix enmarca entonces el componente en rojo y lo dice en la barra de estado. En un instrumento real, es el fusible el que salta.

## Lo que muestra la pantalla

- **Tensión**: `12.3 V`, `0.00 V`, `-5.00 V`.
- **Corriente**: en **miliamperios** por debajo de un amperio (`4.99 mA`), en amperios por encima (`1.25 A`).
- Cuatro cifras significativas como máximo: por debajo de 10 dos decimales, por debajo de 100 uno solo, por encima ninguno — como un instrumento de tres dígitos y medio.
- Bornes **al aire** (nada conectado): la pantalla se queda a cero.

## Uso

- Para **leer una tensión**, deje el montaje como está y ponga los dos bornes en los puntos que quiere comparar.
- Para **leer una corriente**, corte el cable de la rama que le interesa y ponga el multímetro en el lugar del trozo quitado.
- La medida se refresca en cada fotograma de la simulación: sigue un LED que se enciende, un motor que arranca, un potenciómetro que se gira.
- Fuera de la simulación la pantalla está apagada y el interruptor no conmuta — un clic sirve entonces para seleccionar y mover el instrumento.

---

*Dibujo del instrumento realizado por Frank para Kablix.*
