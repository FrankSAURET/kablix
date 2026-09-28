# Sonda lógica

![Sonda lógica](../../img/composants/sonde-logique.webp)

Pequeña pinza de cocodrilo de medida. No se cablea: se **coloca sobre el pad de un pin** de la placa y se convierte en un **canal** del analizador lógico. Cada pinza toma un **color** al colocarla: la pinza azul en la placa es el canal azul en el analizador.

Categoría de la paleta: **Instrumentos de medida**.

Solo escucha **todo o nada**: 0 o 1, y el instante de cada cambio. Para ver una tensión que varía, use el [osciloscopio](oscillo.md); para seguir un valor calculado por el programa, el trazador.

## Pines

| Borne | Función                                                                   |
| ----- | ------------------------------------------------------------------------- |
| **G** | La **punta** de la pinza, abajo a la izquierda del dibujo — el único pad  |

La pinza no consume nada ni impone nada: el montaje se comporta exactamente como si no estuviera. Nunca sale ningún cable de ella.

## Colocarla

1. Arrastre la pinza desde la paleta.
2. Lleve su **gancho** sobre el **pad** del pin que quiere escuchar.
3. Suéltela. La pinza se engancha, toma un color y el pin aparece en el analizador.

## Propiedades

| Propiedad   | Función                                                  | Por defecto |
| ----------- | -------------------------------------------------------- | ----------- |
| `etiquette` | Nombre del canal en el analizador (`reloj`, `datos`…)    | *(vacía)*   |

La etiqueta se muestra **en la placa, junto a la pinza**, en el color del canal. Vacía, se oculta y el canal toma el **nombre del pin** (`Pin 8`, `A0`, `GP14`).

Un montaje que se vuelve a abrir recupera sus pinzas donde estaban, con sus colores y sus nombres.

## La pestaña «Analizador lógico»

No hay **nada que pulsar**: en cuanto hay al menos una pinza colocada, **arrancar la simulación** abre el analizador en una **pestaña aparte**, que se puede colocar **junto al esquema** — se leen a la vez las señales y el cableado. Sin pinza en la placa, no hay pestaña. Si cierra la pestaña por error, aparece un botón **Analizador** en la barra de simulación que la vuelve a abrir, con su última medida.

La pestaña muestra **una pista por canal**, en el color de su pinza, con una regla de tiempo arriba. Sus graduaciones siguen el **zoom**: en segundos para toda la captura, en milisegundos o microsegundos de cerca. Con mucho zoom dentro de una captura larga, la primera graduación da el instante completo (`12,0016 s`) y las siguientes su desfase respecto a ella (`+50 µs`, `+100 µs`…); la cruz, por su parte, escribe el instante con todas sus cifras útiles. En el margen, frente a los dos niveles de la señal, se escriben sus **tensiones**: la de la placa para el nivel alto (`5 V` en Uno y Mega, `3,3 V` en Pico), `0 V` para el nivel bajo. Una pinza colocada detrás del driver de una placa de interfaz toma las tensiones de ese driver: `3,7 V` y `1,1 V` en las líneas `+` y `−` de la placa **Grove DMX512**.

Varias pinzas pueden escuchar la **misma señal**: en una placa DMX, una pinza en `SIG`, otra en `+` y otra en `−` muestran todas la trama emitida por el pin que la ataca — la pinza del `−` invertida, como en el par diferencial real.

- **Rueda**: zoom, alrededor del punto bajo el ratón.
- **Arrastrar**: desplazarse por la grabación.
- **Flechas ◀ ▶** de la barra, o teclas **←** **→**: retroceder o avanzar media ventana, sin cambiar el zoom.
- **Flechas ⏮ ⏭** de la barra: llevan el **inicio de la trama** decodificada anterior o siguiente al borde izquierdo, sin cambiar el zoom. Se saltan las tramas que repiten la anterior de forma idéntica: un programa que envía la misma trama una y otra vez (DmxSimple, cada 2 ms aproximadamente) pasa de un contenido a otro con un clic, y ⏮ vuelve al inicio de la serie anterior. Necesitan al menos una decodificación; con varias, pasan de un bus a otro en el orden del tiempo, comparando cada bus con sus propias tramas.
- **Pasar el ratón**: una cruz da el instante y el nivel (0 o 1) de cada canal en ese instante.
- **Marcadores M1 y M2**: aparcados en la banda bajo la regla, se arrastran sobre las pistas y se pegan al flanco más cercano; con los dos colocados, se escribe el tiempo entre ellos. La flecha de retorno, a la izquierda de la banda, los devuelve a su sitio.
- **Marcadores de ventana F1 y F2**: aparcados justo debajo de M1 y M2, con su propia flecha de retorno. Colocados, tienden entre ellos un **marco violeta vacío** que cubre todas las pistas: enmarque lo que quiere comprobar. El marco se fija **respecto al disparo**: cuando **⏮ ⏭** pasan de una trama a otra, se coloca a la misma distancia del inicio de la nueva trama, aunque haya arrastrado la curva entre medias, y sigue al disparo cuando este cae en otro lugar. Así se vuelve a leer el mismo punto trama tras trama. Se pegan a los flancos como M1 y M2, pero no miden nada.
- **Captura completa**: vuelve a traer toda la captura a la ventana.
- **Seguir en directo**: vuelve a pegar la vista al final de la captura, lo que hace sola durante una ejecución mientras no se haya hecho zoom.

Bajo el nombre de cada canal, el **punto de color** abre sus ajustes: nombre, inversión, velocidad, tolerancia y **ocultar**. Un canal oculto sale de la pantalla pero conserva su captura; mientras haya alguno, la barra muestra un botón que los **vuelve a mostrar** todos, con su número.

Cada botón del margen — punto de color, **T**, **P**, marcadores aparcados, flechas de retorno — dice lo que hace en una **burbuja de ayuda**, al pasar el ratón. Las de **T** y **P** dicen además su estado: el disparo armado en el canal, el bus decodificado.

Fuera de la simulación, la pestaña muestra la **última captura** de la sesión.

Esta captura se escribe **sobre la marcha** en un archivo aparte mientras corre la simulación, y una simulación interrumpida deja igualmente lo que midió. Este archivo se **borra al cerrar el proyecto** — para conservar una medida, expórtela (menú **☰**, **Exportar CSV**).

El proyecto, por su parte, conserva los **ajustes** del instrumento (disparo, decodificaciones, ajustes de canal, profundidad).

## Profundidad y reinicio

Como un analizador comercial, el instrumento tiene una **memoria limitada**: la lista **Profundidad** de la barra fija el número de flancos conservados **por canal** — `5 k`, `15 k`, `60 k` (por defecto), `250 k` o `1 M`. Las dos más pequeñas sirven para aislar un pasaje corto sin guardar segundos de señal. Durante la medida, cada opción muestra entre paréntesis la **duración que cubre** (`60 k (≈ 6 s)`), estimada sobre el canal más activo: un bus DMX o un reloj rápido llenan la memoria mucho antes que un LED que parpadea. Más profundo significa más largo, pero también más pesado para la pestaña.

Sin disparo, la captura conserva los **últimos** flancos: los más antiguos van saliendo y la pantalla sigue el final. Con un disparo, conserva una décima parte de la profundidad **antes** del flanco de disparo y llena el resto **después** de él; una vez llena, se detiene, y la barra indica la **duración de señal conservada** y la profundidad: `Captura llena: 8,3 s de medida (60 k flancos por canal)`. Reiniciada, una captura llena conserva la misma duración mientras la señal no cambie de ritmo.

Cambiar la profundidad durante la simulación se aplica al momento: en una captura llena, empieza una nueva adquisición. Con la simulación detenida, la elección espera a la siguiente ejecución.

La lista **Muestreo** no cambia nada de esa duración. Un analizador comercial guarda muestras: su duración es la profundidad dividida por la frecuencia de muestreo. Kablix guarda **flancos**, fechados al ciclo del procesador: su duración depende del ritmo de la señal, no del muestreo. Este solo sirve para **mostrar lo que vería un instrumento real**: cada flanco se desplaza al tic que lo sigue, dos flancos en el mismo tic se confunden, un impulso más corto que un tic desaparece, y un bus leído demasiado despacio se decodifica mal. La captura, en cambio, conserva todos sus flancos exactos: volver a **Ilimitado** los recupera sin volver a capturar nada. Para medir, deje **Ilimitado**.

El botón **↻ Reiniciar la captura**, al principio de la barra, borra la medida en curso y vuelve a empezar de cero sin detener la simulación; un disparo ajustado se rearma y espera su próximo flanco. Solo está activo durante la simulación.

## Exportar

El botón **☰** de la barra abre el menú de exportación:

- **Exportar CSV**: guarda la medida en un archivo `.csv`, **una columna por canal** (`temps_ms,Sig,DMX-,DMX+`), con la descripción de los canales al principio. Cada flanco ocupa **dos líneas en el mismo instante**: el nivel anterior y luego el posterior. Trazadas en una hoja de cálculo como «dispersión con líneas rectas», las curvas son por tanto señales cuadradas de flancos verticales, como en pantalla. Un canal leído invertido (patilla `-` de un par DMX, ajuste *Invertir*) también lo está en el archivo. Una casilla vacía significa que el canal todavía no se ha movido. Una medida en curso se exporta sin detener la simulación.
- **Copiar SVG**: pone las curvas en el portapapeles **como imagen**, en dos formas a la vez: un dibujo vectorial (SVG) que pega Inkscape, y una imagen normal, el doble de fina que la pantalla, que pega Word. Cada programa toma la que sabe leer.
- **Exportar SVG**: la misma imagen, guardada en un archivo `.svg`.

Para exportar solo un fragmento, coloque **M1** al principio de lo que le interesa y **M2** al final. El CSV conserva entonces solo los flancos entre ambos, enmarcados por el nivel de cada canal en M1 y en M2. El SVG dibuja ese intervalo **con el zoom actual**: un píxel de pantalla es un píxel de imagen, así que acercar antes de exportar la alarga y alejar la acorta. Sin M1 ni M2, el CSV se lleva toda la medida y el SVG lo que muestra la pantalla.

La imagen conserva los colores del tema y su fondo, los nombres de los canales, las decodificaciones y los marcadores, sin los botones de la pestaña. Un intervalo que daría menos de 40 píxeles de curva con ese zoom, o una imagen de más de 50 000 píxeles de ancho, se rechaza con un mensaje que dice si hay que acercar o alejar.

## El disparo

El menú **T** bajo el nombre de un canal: elija el **sentido** — flanco de *subida* o de *bajada*. La captura queda entonces **en espera** hasta el primer flanco de ese tipo, y luego **se fija en él**: el instante 0 de la regla pasa a ser ese flanco, y todo se lee como adelantado o retrasado respecto a él. Sin disparo, la regla parte del instante en que se arrancó la simulación.

Cambiar el ajuste **rearma** la espera, igual que el botón **↻ Reiniciar la captura**: una captura llena empieza entonces una nueva adquisición.

En un canal decodificado como **DMX512**, el menú ofrece también **`START code 0x00`**: la captura se fija en el **bit de start del primer slot** de una trama de iluminación, el que sigue al `BREAK` y al `MAB`. Un canal que vale `0x00` no dispara, ni tampoco una trama con start code no nulo (RDM, texto). El botón muestra entonces `SC`. La duración de un bit sigue la **velocidad del canal** (250 kbaudios si no se escribe nada): una trama emitida a otra velocidad solo dispara una vez ajustada esa velocidad.

En un canal que lleva los datos de otra decodificación, el menú ofrece **Inicio de trama**: la captura se fija en la **apertura de la primera trama** tras el armado. Lo que abre una trama depende del protocolo:

- **I²C**: el `START` (un `START rep.` solo continúa la trama en curso);
- **SPI**: `CS ↓`; sin canal CS, el primer byte de una ráfaga de reloj;
- **UART**: el primer carácter tras un silencio de al menos un carácter;
- **1-Wire**: el `RESET`;
- **DHT11 / DHT22**: la petición del maestro.

El disparo lee la decodificación tal como está ajustada: cambiar sus canales o su velocidad reinicia la búsqueda. El botón muestra entonces una línea seguida de un pulso.

## La decodificación

El menú **P** bajo el nombre de un canal: `I²C / TWI`, `SPI`, `UART`, `1-Wire`, `DHT11 / DHT22` o `DMX512`. Después hay que decir **qué canal cumple qué función**:

| Protocolo         | Funciones que asignar                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| **I²C / TWI**     | el reloj (SCL) y los datos (SDA)                                                  |
| **SPI**           | el reloj (SCK), MOSI, MISO, la selección (CS), más el **modo** 0 a 3              |
| **UART**          | la línea serie (TX o RX), más el **formato** (`8N1`, `7E1`…) y la **velocidad**   |
| **1-Wire**        | la línea única (DQ)                                                               |
| **DHT11 / DHT22** | la línea única (DATA), más el **modelo** del sensor                               |
| **DMX512**        | la línea de datos                                                                 |

Los bytes y las marcas de trama (`START`, `STOP`, `ACK`, `RESET`, números de canal DMX) se escriben entonces **bajo la pista**, cada uno en su lugar en el tiempo. La decodificación solo abarca la **parte visible**: haga zoom en la trama que le interesa.

Los colores son los mismos para todos los protocolos: el **inicio** (bit de start, condición START, selección CS) es **verde**, el **final** (bits de stop, condición STOP, liberación de CS) **rojo**, los datos **azules**, las marcas de trama **violetas**, los controles (`ACK`, suma de control) **naranjas**, las órdenes 1-Wire **rosas** y los errores **magenta**. Los términos de las normas (`Start`, `STOP`, `BREAK`, `MAB`…) nunca se traducen: son los de las hojas de datos.

### Lo que hay que ajustar

El **modelo** de un sensor DHT no se adivina. El DHT11 y el DHT22 envían exactamente la misma trama, con los mismos tiempos: **nada en el hilo permite distinguirlos**. Lo que cambia es la forma de leer los cuatro bytes — el DHT22 codifica la humedad y la temperatura en décimas sobre dos bytes cada una, el DHT11 da la humedad en entero y la temperatura en grados y luego décimas (`22,0 °C`: los primeros modelos siempre envían una décima nula). Elegir el modelo equivocado no da error, da valores falsos.

Tampoco la **velocidad** y el **formato** de una línea UART: dos velocidades cercanas producen los mismos flancos y bytes distintos, y una misma señal leída en `8N1` o en `7E1` no da los mismos caracteres. Bytes sin sentido: casi siempre es la velocidad lo primero que hay que revisar (se escribe en los ajustes del **canal**, no de la decodificación — dos líneas serie de un mismo montaje no van necesariamente al mismo ritmo).

La **base** de los bytes, en cambio, es una simple elección de lectura, común a todos los protocolos: el ajuste **Valores** de la decodificación los escribe en **hexadecimal** (`0x44`, por defecto — la notación de las hojas de datos) o en **decimal** (`68`, la del programa que compara una lectura con un número). Las marcas de trama, los nombres de órdenes (`CONVERT T`) y las medidas (`23,4 °C`) no cambian. Dos decodificaciones de una misma captura conservan cada una su base.

La casilla **Bits** añade, también para todos los protocolos, la **visualización binaria**: cada bit leído se escribe como `0` o `1` justo bajo el pulso que lo lleva, en el orden del hilo, y una línea de puntos separa dos bits vecinos, justo sobre los flancos. En 1-Wire, la casilla de un bit va desde su pulso bajo hasta el del bit siguiente, recuperación incluida; el último bit de una ráfaga conserva los 60 µs del slot. Es la trama tal como la lee el receptor: el bit de `Start` y los bits de `STOP` de un carácter UART, los datos enviados **bit de menor peso primero** (UART, DMX, 1-Wire) o **bit de mayor peso primero** (I²C, SPI, DHT), el bit de `ACK` de un byte I²C. Los bytes y las marcas bajan una línea para dejar sitio. De lejos, cuando un bit ya solo mide unos pocos píxeles, las cifras desaparecen: haga zoom para leerlas. Cambiar de protocolo mantiene la casilla marcada.

### Lo que muestra cada decodificación

- **UART** — cada carácter se corta como en el hilo: el `Start` (un bit, verde), el valor y, cuando es imprimible, el propio carácter (`0x48 'H'`), y luego el `STOP` (rojo). Un bit de parada ausente se señala `encuadre` en lugar del `STOP`, una paridad falsa `paridad` sobre el bit de paridad — el valor sigue mostrándose, usted juzga.
- **DMX512** — cada trama se lee en el orden de la norma: el `BREAK` (línea baja durante al menos 88 µs), el `MAB` (el reposo alto que le sigue), y luego slots de once bits. Cada slot muestra su `Start` (verde, un bit), su valor en hexadecimal y su `STOP` (rojo, dos bits). El primer slot es el `START code 0x00` (iluminación), los siguientes los canales: `c1=0xC8`, `c2=0x32`… Una `PAUSE` marca un reposo entre dos slots, el `MBB` el que hay entre el último slot y el `BREAK` siguiente. Un start code no nulo (RDM, texto…) se anuncia tal cual, sin numerar canales.
- **1-Wire** — una sola línea, sin reloj: es la **duración del pulso bajo** la que lleva el bit. Como el microcontrolador, el decodificador mira la línea **15 µs** después de su bajada: todavía baja, es un `0`; ya subida, es un `1`. El decodificador detecta el `RESET` y nombra las órdenes habituales con palabras (`SKIP ROM`, `CONVERT T`, `READ SCRATCHPAD`…), porque `0x44` no dice nada mientras que `CONVERT T` lo dice todo. Las órdenes tienen su propio color, **rosa**: la orden ROM que sigue al `RESET` (`MATCH ROM`, `SKIP ROM`…) y la orden de función que viene después (`CONVERT T`, `READ SCRATCHPAD`…) destacan sobre los bytes de dirección y de datos, en azul. Un byte desconocido en lugar de una orden — la de otro componente distinto del DS18B20 — sigue siendo rosa, sin nombre. Siempre lee desde el `RESET` de la transacción, aunque haya salido de la vista por la izquierda: arrastrar la curva no cambia ni los bytes ni sus nombres. No distingue quién habla, el maestro o el esclavo: en el hilo es el mismo pulso bajo, y un instrumento comercial no lo hace mejor con una sola pinza. Una excepción: justo después del `RESET`, el sensor mantiene la línea baja un centenar de microsegundos para decir «aquí estoy» — es la `PRESENCIA` (violeta). Sin ella, ningún sensor responde en el hilo.

  Con un **DS18B20**, cada medida se lee en dos transacciones, una por segundo aproximadamente:
  1. `RESET`, `PRESENCIA`, `SKIP ROM` («hablo a todos los sensores»), `CONVERT T` («midan») — luego la línea queda en reposo durante la conversión (750 ms a 12 bits);
  2. `RESET`, `PRESENCIA`, `MATCH ROM` seguido de los **8 bytes de la dirección** del sensor elegido (el primero, `0x28`, es el código de la familia DS18B20, el último una suma de control), y luego `READ SCRATCHPAD` y los **9 bytes** que devuelve el sensor: los dos primeros son la temperatura (byte de menor peso primero, en dieciseisavos de grado: `0x90` `0x01` = 0x0190 = 400 → 25 °C), el último una suma de control.

  Al arrancar, el programa busca primero los sensores presentes (`SEARCH ROM`): para cada bit de la dirección, dos bits leídos y luego uno escrito. Esos slots se suceden sin formar bytes, y lo que se escribe debajo no tiene sentido — es normal, solo ocurre una vez.
- **DHT11 / DHT22** — un solo hilo también, pero **no es 1-Wire**: aquí el bit lo lleva la duración del nivel **ALTO** (unos 28 µs para un `0`, 70 µs para un `1`), y no hay ni ROM ni órdenes. Primero se ve la `PETICIÓN` del microcontrolador, luego la `PRESENCIA` del sensor que acusa recibo, y después la medida, en **dos líneas** bajo la curva. La primera corta los cinco bytes, cada uno en su casilla, separada de la siguiente por una línea vertical: `0x02` `0x37` `0x00` `0xEA` `0x23`. La segunda da, bajo los bytes que las llevan, la humedad (`56,7 %HR`, bajo los dos primeros), la temperatura (`23,4 °C`, bajo los dos siguientes) y la suma de control (`suma ✓`, bajo el último). Cuando falta sitio, la suma se reduce a su marca. Vista de lejos, la trama solo mide unos pocos píxeles: la medida se escribe entonces de un bloque justo a su derecha, `56,7 %HR · 23,4 °C · suma ✓`, y sigue siendo legible mientras lo sea la `PETICIÓN`. La **suma de control** se recalcula y se anuncia: un `SUMA ✗` indica un enlace dudoso — hilo demasiado largo, resistencia de pull-up ausente — mucho mejor de lo que lo harían cinco bytes en hexadecimal. Una trama cortada a medias se señala como tal (`17/40 bits`) en lugar de completarse al azar.

---

*Dibujo de la pinza realizado por Frank para Kablix.*
