# Generador de funciones

![Generador de funciones](../../img/composants/gbf.webp)

El generador de funciones del laboratorio: entrega una **señal que varía por sí sola**, donde la [fuente de alimentación de laboratorio](alim.md) entrega una tensión fija. Tres formas de onda a elegir — **senoidal**, **triangular**, **cuadrada** — ajustables en frecuencia, amplitud, desplazamiento y ciclo de trabajo.

Es el instrumento que hay que sacar en cuanto un montaje debe ser **excitado por una señal** y no por una tensión: medir un filtro RC, la respuesta de un amplificador, contar impulsos en una entrada, muestrear una senoide con el convertidor analógico-digital.

Categoría de la paleta: **Instrumentos de medida**.

## Pines

| Borne | Función |
|-------|------|
| **Vs** | Borne banana de **salida** — la señal (rojo) |
| **GND** | Borne banana **negro** — masa, común a todo el montaje |

Los dos bornes están a 20 px (dos pasos de cuadrícula). Conecte **Vs** a una **entrada analógica** de la placa (`A0`…) para que el programa lea la señal; **GND** debe unirse a la masa de la placa, si no los dos instrumentos no tienen referencia común y la lectura no tiene sentido.

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `waveform` | Forma de onda: senoidal, triangular o cuadrada | `sinus` |
| `frequency` | **Frecuencia** (Hz), de 1 a 1 000 000 **al hercio** | `1000` |
| `amplitude` | **Amplitud pico a pico** (V), de 0 a 10 en pasos de **0,1** | `5` |
| `offset` | **Desplazamiento continuo** (V), de −5 a +5 en pasos de **0,1** | `0` |
| `duty` | **Ciclo de trabajo** (%), de 0 a 100 **al por ciento** | `50` |

> Estos valores son el estado **inicial**: vuelven en cada arranque de la simulación. Los mandos girados durante una sesión no cambian el proyecto — el ejercicio conserva sus ajustes de origen.

La amplitud es **pico a pico**, como en un generador de funciones real: es la altura **total** de la señal, del valle a la cresta. `amplitude = 5` y `offset = 0` dan por tanto una curva que va de **−2,5 V a +2,5 V**; con `offset = 2.5`, va de **0 a 5 V**. La mitad de la amplitud queda a cada lado del desplazamiento.

Recién sacado de la caja, el instrumento tiene un **desplazamiento nulo**: su señal está centrada en masa, como en un banco de laboratorio. Conectado tal cual a una entrada analógica, queda por tanto **recortado** en toda su alternancia negativa (vea más abajo) — añadir el desplazamiento le corresponde a usted.

## Ajustar el instrumento durante la simulación

Los **cuatro mandos** giran **con el ratón**, como en un instrumento real: pulse sobre un mando y gire alrededor de su centro. **300°** de recorrido en sentido horario; los 60° restantes son una **zona muerta** donde el mando se queda en el extremo más cercano. Cada pantalla sigue a su mando, con su unidad.

El **selector deslizante** de la derecha elige la forma de onda: **arrástrelo** arriba y abajo — senoidal arriba, triangular en medio, cuadrada abajo.

Los mandos están **inactivos durante la edición**: solo responden cuando la simulación está en marcha (en edición, un clic mueve el instrumento). Se tienen en cuenta el zoom y la rotación del componente.

### El mando de frecuencia es logarítmico

Cubre **seis décadas** (1 Hz → 1 MHz) en 300°: el recorrido es por tanto **logarítmico**, como las décadas grabadas en el dial de un generador real. Cada cincuenta grados aproximadamente multiplican la frecuencia por diez. Con un recorrido lineal, un solo grado valdría 3300 Hz y no sería posible ningún ajuste fino en la parte baja del rango.

La pantalla escribe la unidad adecuada: `1 Hz`, `250 Hz`, `12,5 kHz`, `1 MHz`.

### El ciclo de trabajo deforma la cuadrada Y la triangular

- **Cuadrada**: el ciclo de trabajo es la parte del periodo que pasa a **nivel alto**. Al 50 % la señal es simétrica; al 10 % son impulsos cortos; al **0 %** se queda baja todo el tiempo y al **100 %** alta todo el tiempo — dos formas de obtener una tensión continua.
- **Triangular**: el ciclo de trabajo fija la duración de la **subida**. Al 50 % el triángulo es simétrico (cresta en mitad del periodo); al 90 % la subida es lenta y la bajada abrupta — es un **diente de sierra**. Al 10 %, el diente de sierra se invierte.
- **Senoidal**: el ciclo de trabajo **no tiene efecto** — una senoide deformada ya no sería una senoide.

## Lo que lee realmente la placa

La señal se calcula **en el instante exacto de la conversión analógica**, no una vez por fotograma: a 1 MHz un periodo dura un microsegundo, y un valor fijado una vez por fotograma llegaría con miles de periodos de retraso. Un programa que lee `analogRead` en bucle ve de verdad la forma de onda.

Cuidado con el **recorte**: una entrada analógica no lee ni tensiones negativas ni nada por encima de su tensión de referencia (**5 V** en Arduino, **3,3 V** en Pico). Una señal de 10 V pico a pico sin desplazamiento (por tanto de −5 V a +5 V) sale **recortada** — fondo de escala en las crestas, cero en toda la alternancia negativa, y la forma leída ya no tiene nada que ver con la del dial. Para quedarse dentro del rango, desplácela: por ejemplo `amplitude = 3` y `offset = 1.65` en un Pico (la curva va entonces de 0,15 V a 3,15 V).

## Uso

- Un **filtro RC**: Vs a la entrada del filtro, la salida del filtro a `A0`, GND común. Gire la frecuencia y lea la atenuación — el [trazador](../USAGE.md) muestra el corte.
- Un **contador de impulsos**: onda cuadrada, unos pocos Hz, Vs a una entrada digital. El ciclo de trabajo cambia la anchura de los impulsos.
- **Muestreo**: senoide de unas decenas de Hz, amplitud y desplazamiento centrados en el rango de la placa, y `analogRead` en bucle.

---

*Dibujo del instrumento realizado por Frank para Kablix.*
