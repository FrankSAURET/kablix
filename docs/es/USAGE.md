# Kablix — Guía de usuario

![Kablix](../../Kablix.webp)

> Versión en francés: [USAGE.md](../fr/USAGE.md) · English version: [USAGE.md](../en/USAGE.md)

## Contenido

> Este índice solo sirve para leer el archivo en GitHub: dentro de Kablix, el panel de ayuda muestra el suyo, generado a partir de los títulos, a la izquierda del texto.

1. [Primeros pasos](#primeros-pasos)
2. [La interfaz](#la-interfaz)
   1. [Orientarse en esta ayuda](#orientarse-en-esta-ayuda)
3. [Montar un circuito](#montar-un-circuito)
   1. [Colocar y mover](#colocar-y-mover)
   2. [Protoboard](#protoboard)
   3. [Cableado](#cableado)
   4. [Retocar un cable](#retocar-un-cable)
   5. [Componentes disponibles](#componentes-disponibles)
   6. [Nuevos componentes](#nuevos-componentes)
4. [Simular](#simular)
   1. [Ejecutar el código](#ejecutar-el-código)
   2. [Añadir bibliotecas](#añadir-bibliotecas)
   3. [MicroPython en la Pico](#micropython-en-la-pico)
   4. [Enviar el programa a una placa Pico real](#enviar-el-programa-a-una-placa-pico-real)
   5. [Depuración](#depuración)
   6. [Monitor serie](#monitor-serie)
   7. [Trazador](#trazador)
   8. [Consumo de la placa](#consumo-de-la-placa)
   9. [Iluminación DMX512](#iluminación-dmx512)
5. [Exportar la lista de componentes (nomenclatura CSV)](#exportar-la-lista-de-componentes-nomenclatura-csv)
6. [Exportar el esquema en SVG](#exportar-el-esquema-en-svg)
7. [Crear sus propios componentes](#crear-sus-propios-componentes)
   1. [Gestor de componentes (instalación y desinstalación)](#gestor-de-componentes-instalación-y-desinstalación)
8. [Formato de archivo de componente (.kompix)](#formato-de-archivo-de-componente-kompix)
   1. [Crear sus propios componentes](#crear-sus-propios-componentes-1)
   2. [Hacer que una IA genere un componente](#hacer-que-una-ia-genere-un-componente)
9. [Dónde encontrar componentes existentes](#dónde-encontrar-componentes-existentes)
10. [Guardar / abrir un proyecto (.projix)](#guardar--abrir-un-proyecto-projix)
11. [Interoperabilidad con Wokwi (diagram.json)](#interoperabilidad-con-wokwi-diagramjson)
12. [Actualizaciones de las bibliotecas](#actualizaciones-de-las-bibliotecas)
13. [Extensiones recomendadas](#extensiones-recomendadas)
    1. [La placa elegida en Kablix pasa a ser la del proyecto Arduino](#la-placa-elegida-en-kablix-pasa-a-ser-la-del-proyecto-arduino)
    2. [Nada subrayado en rojo en su código](#nada-subrayado-en-rojo-en-su-código)
14. [Atajos de teclado](#atajos-de-teclado)
    1. [Copiar y pegar de un proyecto a otro](#copiar-y-pegar-de-un-proyecto-a-otro)

---

## Primeros pasos

1. Para empezar, haga clic en el icono ![Kablix](../../media/KNB.webp) de la barra de actividad de la izquierda;
  - o bien, dentro de una carpeta de proyecto, haga doble clic en un archivo projix;
  - o bien, si ha configurado la asociación, haga doble clic en un archivo projix en el Explorador de Windows.

<video src="../../media/demarrer.mp4" title="Iniciar Kablix" controls autoplay loop muted playsinline></video>

1. **Monte su circuito**: arrastre y suelte un componente desde la paleta de la izquierda. Una los pines directamente y pulse el botón de enrutado automático (enruta los componentes seleccionados, o todo el circuito si no hay nada seleccionado).

<video src="../../media/dessiner.mp4" title="Montar un circuito" controls autoplay loop muted playsinline></video>

1. **Ejecute su código**: asocie un archivo de código (atención, los archivos `.ino` deben estar en una carpeta con el mismo nombre) y luego **▶ «Iniciar»**:
  - `.ino`/`.c`/`.cpp` -> compilación con la cadena de herramientas local;
  - `.py` -> MicroPython en el Pico simulado (se necesita un firmware `.uf2`, ver más abajo);
  - `.hex` / `.uf2` / `.elf` / `.bin` -> carga directa, sin compilar.
  **▶ guarda primero**: el circuito y el archivo de código se escriben en el disco antes de arrancar la simulación, así que lo que se ejecuta es siempre lo que está en el disco. Un proyecto que nunca se ha guardado (todavía sin nombre) no se toca — ningún diálogo interrumpe el arranque.
2. **Guarde su circuito**: «Kablix: Guardar el proyecto (.projix)»; un `.projix` se vuelve a abrir después con un doble clic en el Explorador. Al volver a abrirlo, el archivo de código del proyecto se abre **también**, en el panel de código junto al circuito — mientras el cursor se queda en Kablix. También se puede importar/exportar en formato Wokwi (`diagram.json`).

<video src="../../media/simuler.mp4" title="Simular en Kablix" controls autoplay loop muted playsinline></video>

## La interfaz

![interfaz](../../media/interface.webp)  
*Interfaz de Kablix: **①** la **paleta** de componentes a la izquierda, **②** el **lienzo** del circuito en el centro, **③** el **inspector** (Propiedades/variables) a la derecha, **④** el **monitor serie/Consola/REPL**, **⑤** el **Trazador** abajo y **⑥** las **barras de herramientas** — la de Kablix arriba del todo, la de **simulación** a la izquierda del lienzo y la de **dibujo** a la derecha.*

- **Paleta**: hacer clic en un componente lo coloca en el lienzo. Dos modos de orden a elegir (botones de arriba) ![botones de orden](<../../media/boutons trie.webp>): alfabético o por categorías. Una zona **«Usados recientemente»** (10 como máximo) puede quedarse arriba (tercer botón). El último botón cambia el modo de reacción de la paleta.
- **Plegar los paneles laterales**: la **biblioteca** (a la izquierda) y **Propiedades/Variables** (a la derecha) se pliegan cada uno con la **pequeña flecha** situada en su borde, del lado del lienzo. El panel se convierte en una franja estrecha que lleva su nombre en vertical; la misma flecha lo vuelve a abrir con su anchura anterior. El estado se recuerda: un banco de trabajo que se vuelve a abrir recupera sus paneles como los dejó.
  - Al **arrancar la simulación**, la biblioteca se pliega sola (el esquema está bloqueado, ya no se coloca ningún componente) y se vuelve a abrir al detenerla. Si la había plegado usted mismo, la simulación la deja como está. El ajuste *Fold Library On Run* (`kablix.foldLibraryOnRun`) de los ajustes de Kablix desactiva este plegado automático.
- **Barra de Kablix** (arriba de la ventana)  
![Barra de Kablix](<../../media/barre kablix.webp>)
  - **Cargar binario**: carga un .hex/.uf2 ya compilado del espacio de trabajo, sin recompilar. **Oculto por defecto** — la casilla *Mostrar el botón «Cargar binario»* de los ajustes de Kablix lo hace volver.
  - las funciones habituales de gestión de archivos: **nuevo proyecto**, **abrir**, **guardar**, **guardar como**, **exportar el esquema en SVG**.
  - el botón **Nombres**, que muestra el nombre en el componente **seleccionado** o en todos los componentes, o el id de los componentes (la referencia).
  - **reorganizar**: restablece la disposición de Kablix (código a un lado, Kablix al otro, paneles cerrados). Puede intercambiar las dos zonas y ajustar su anchura con el ratón, y después usar **Guardar esta disposición como predeterminada** (menú hamburguesa): se recuerdan tanto el lado de Kablix **como** la anchura, y «reorganizar» los restablece — incluso devolviendo Kablix al lado elegido si ha cambiado desde entonces.
  - **modo texto** (el icono «T»): coloca **etiquetas** libres en la hoja — un título de circuito, una nota, el nombre de una zona. Una etiqueta **seleccionada** se edita en el panel de la derecha: **color del texto**, **color del fondo**, **opacidad del fondo** (hasta cero: el texto queda solo, sin recuadro de color), **tamaño del texto** y **fuente**. Las etiquetas son solo decoración: la simulación las ignora, pero la exportación SVG las incluye.
  - el **menú hamburguesa** para las funciones menos frecuentes: importar / exportar un esquema **Wokwi**, exportar la **lista de componentes (CSV)**, actualizar el **firmware del Pico**, buscar **actualizaciones de las bibliotecas**, guardar la disposición predeterminada, abrir los **Ajustes** de Kablix (los ajustes de la extensión en la pantalla de VS Code, ya filtrados).
  - el acceso a esta **ayuda**.
  - el **nombre del proyecto** actual.
  - el **archivo de código** del proyecto, justo al lado del nombre: **clic = cambiar**, **doble clic = abrir** (se abre del lado del código).
  - la zona de **estado** («Listo», mensajes de compilación…) y, solo cuando la página ya no puede seguir el ritmo, la insignia **«Ralentizada: 0,45× el tiempo real»**.
- **Barra de simulación** (a la izquierda, sobre el lienzo)  
![Barra de simulación](../../media/BarreSimulation.webp)
  - **▶ iniciar** (guarda antes el esquema y el código)
  - **■ detener**
  - **⏸ pausa/reanudar**
  - **paso a paso**
  - el selector de **velocidad**, un animal por ajuste: 🦅 500 %, 🐆 200 %, 🐇 100 % (tiempo real), 🐢 10 %, 🐌 1 %, o ✎ **Personalizado** (escriba un porcentaje de 1 a 10 000 %, para ver una pila agotarse en unos minutos). Acelerar es un **deseo**: la simulación va tan deprisa como puede, nunca más.
  - **REPL**: solo para el Pico, muestra la consola Python tradicional (solo aparece cuando la placa del lienzo es un Pico)
  - **monitor serie / consola**
  - **Trazador**
  - **reabrir el analizador lógico**: solo aparece cuando se ha cerrado la pestaña del analizador mientras sigue habiendo una pinza en el esquema. Un clic la vuelve a abrir con su última medida.
  - **explicaciones de fallos**: el marco rojo y la etiqueta amarilla colocados sobre un componente con fallo. Activado por defecto; el botón los oculta cuando molestan para leer el esquema.

  El analizador lógico **no tiene botón para abrirlo**: es la [sonda lógica](composants/sonde-logique.md) la que lo activa. Coloque al menos una pinza en un pin, arranque la simulación y su pestaña se abre sola, para colocarla junto al esquema. Sin pinza, no se abre nada — el analizador no tendría nada que mostrar. El botón de la barra solo sirve para reabrir una pestaña cerrada.
- **Barra de dibujo** (a la derecha, sobre el lienzo)  
![Barra de dibujo](../../media/BarreDessin.webp)
  - **botón del componente**: muestra el **esquema interno** del componente seleccionado, o el **patillaje completo** de la placa. Solo aparece cuando el componente seleccionado ofrece uno.
  - **enrutado automático**: enruta la selección o todo el circuito
  - **cuadrícula** (mostrar/ocultar)
  - **recentrar/ajustar la vista**
  - **⟲ reiniciar todos los componentes**: devuelve cada componente a su estado de reposo (interruptores soltados, cursores en reposo) sin tocar el cableado. **Oculto por defecto** — la casilla *Mostrar el botón «Reiniciar todos los componentes»* de los ajustes de Kablix lo hace volver.
  - **goma**: vacía todo el esquema, componentes y cables (Ctrl+Z lo deshace). **Oculto por defecto** también — casilla *Mostrar el botón «Vaciar el esquema»*.
- **Propiedades/Variables** (inspector):
  - Durante el dibujo, edita el componente seleccionado (color, valor, ángulo…) o el cable (color Dupont, eliminación, nodo [equipotencial])
  - durante la simulación, muestra las variables.
  - Los componentes con muchos ajustes (el robot araña y sus 33) ordenan sus propiedades en **cajones plegables**, todos cerrados al seleccionar el componente. Funcionan como un **acordeón**: abrir uno cierra el que estaba abierto.

### Orientarse en esta ayuda

La guía se abre con su **índice a la izquierda**, que se queda en su sitio al desplazarse y **resalta la sección que se está leyendo**. Se construye a partir de los títulos del documento: no le puede faltar ninguna sección.

- **Campo de búsqueda** (arriba del índice): a partir de dos letras, solo quedan visibles las secciones que contienen la palabra, y las coincidencias se resaltan. Se ignoran los acentos y las mayúsculas — «repere» encuentra «repère». **Escape** vacía el campo y devuelve toda la página.
- **Secciones plegables**: hacer clic en el título de una sección la cierra. **Plegar todo** da una vista de conjunto de la guía en una pantalla; **Desplegar todo** la vuelve a abrir.
- Un clic en el índice **abre la sección de destino** aunque estuviera plegada.

## Montar un circuito

### Colocar y mover

- **Colocar**: haga clic en un componente de la paleta (se coloca en el centro), o **arrástrelo y suéltelo** desde la paleta donde quiera en el lienzo.
- **Mover**: arrastre el componente (por cualquier parte de su cuerpo), o **arrastre con el clic derecho** — imprescindible para los componentes interactivos (pulsador, potenciómetro, interruptores, joystick) cuyo clic izquierdo acciona el mando. El clic derecho también **atraviesa los puntos amarillos**: un LED o una resistencia insertados en una protoboard se pueden seguir agarrando aunque se ilumine un agujero bajo el cursor. El clic izquierdo, por su parte, sigue iniciando un cable desde ese agujero.
- **Girar**: seleccione el componente y pulse **`+`** (45° en sentido horario) o **`-`** (45° en sentido antihorario). Los pines y los cables lo siguen; aparece un recordatorio en la zona de ayuda del inspector.
- **Zoom**: **rueda del ratón** sobre el lienzo (centrado en el cursor). La insignia **⟳ %** de abajo a la derecha da el factor; hacer clic en ella restablece la vista. El botón **ajustar la vista** encuadra el **dibujo** del circuito — no los marcos invisibles de los componentes, más grandes que lo que muestran: un robot araña solo llena ahora la pantalla en lugar de flotar en medio de un margen.
- **Eliminar**: botón 🗑 del inspector, o la tecla `Supr` (o `Retroceso`). Elimina lo que esté seleccionado: un componente, un cable o todo un lote — componentes **y** cables atrapados juntos en un rectángulo de selección. Basta un solo clic en la hoja para devolverle el teclado: aunque acabe de escribir en el campo de búsqueda de la paleta o en un campo del inspector, la tecla va al esquema. Mientras el cursor de texto parpadee en un campo, en cambio, `Supr` borra texto — que es lo que se espera.

**La hoja tiene bordes, en los cuatro lados.** Mide 4000 × 3000 px y un componente no puede salir de ella: se detiene en el borde, a la derecha y abajo igual que arriba y a la izquierda. Es su **dibujo** el que toca el borde, no su marco invisible — un componente cuyo dibujo no llena su marco (la pata del robot, por ejemplo) sube por tanto hasta tocar de verdad arriba. Un lote seleccionado se detiene **en bloque**, en cuanto uno de sus componentes llega a un borde: las posiciones relativas se conservan. Los pegados repetidos (`Ctrl+D`) se detienen en el mismo lugar en lugar de dejar copias fuera.

### Protoboard

El componente **Protoboard** (categoría Placas y protoboards) existe en tres tamaños — *mini* (17 columnas, sin raíles), *half* (30 columnas) y *full* (63 columnas) — que se ajustan en **Propiedades**. Se simulan las conexiones internas reales: columnas **a–e** y **f–j** unidas por tiras, **raíles +/−** a lo largo de toda la placa.

Al arrastrar un componente sobre la protoboard, **las tiras que recibirían sus pines se iluminan en amarillo**. Al soltarlo, el componente **se inserta**: se engancha a los agujeros y las conexiones se hacen automáticamente (sin cable visible). Los cables se dibujan por encima de placas y protoboards.

### Cableado

1. Haga clic en un **pin** (punto dorado): el cable empieza.
2. Cada clic en el **fondo del lienzo** añade una **esquina**. Los tramos casi horizontales o verticales (±15°) **se ajustan** al eje.
3. Haga clic en **otro pin** para terminar el cable. `Esc` cancela.
4. Arrastrar directamente de pin a pin también funciona, y es el método que recomiendo — el enrutado automático hace el resto.

Cada cambio de dirección se dibuja con una **esquina redondeada**. Colores:

- un cable que toca una **masa** (GND) empieza **negro**;
- un cable que toca un **raíl de alimentación** (5V, 3V3, VBUS, VSYS, VCC…) empieza **rojo**;
- los demás siguen la rotación de la **cinta Dupont arcoíris** (10 colores).

El color sigue siendo **editable con un clic** en el inspector — nunca se vuelve a imponer.

Algunos componentes especiales (por ahora solo el LED RGB) tienen colores iniciales predefinidos (le dejo adivinar cuáles en ese caso).

### Retocar un cable

- **Seleccione el cable**: aparecen **asas** en cada esquina.
- **Arrastre un asa** para mover la esquina.
- **Mantenga Ctrl** mientras arrastra: aparece una **cruz horizontal/vertical** y la esquina se alinea con sus vecinas — los tramos pasan a ser exactamente horizontales o verticales.
- **Doble clic en el cable**: inserta una nueva esquina en ese punto.
- **Arrastre un tramo recto del cable**: se desplaza **perpendicularmente** a su dirección — un tramo horizontal sube y baja, uno vertical va a izquierda y derecha. Los tramos vecinos se estiran en consecuencia, el resto del trazado no se mueve. Es la forma rápida de apartar una rama sin tocar las esquinas una a una. El desplazamiento se ajusta a la cuadrícula; **manteniendo Ctrl** queda libre. Un tramo inclinado no se mueve.

### Componentes disponibles

La paleta contiene **76 componentes integrados** (más sus variantes: condensador polarizado, transistores PN2222A/NPN/PNP, teclados 3×4 y 4×4…). Cada uno tiene su **ficha de ayuda** — dibujo, patillaje, propiedades, lo que se simula y lo que no — que se abre con el botón **Ayuda del componente** del inspector cuando el componente está seleccionado. Se añaden más componentes con la **biblioteca** (vea [Gestor de componentes](#gestor-de-componentes-instalación-y-desinstalación)).

**Placas y soportes**

| Componente                              | Comportamiento simulado                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Arduino Uno, Nano, Mega 2560            | Procesador AVR simulado (avr8js): ATmega328P para Uno y Nano, ATmega2560 para Mega |
| Raspberry Pi Pico, Pico W               | Procesador RP2040 simulado (rp2040js) que ejecuta MicroPython                      |
| Grove Shield (Pico)                     | Placa de expansión: conectores Grove cableados a los pines del Pico                |
| Protoboard (mini / half / full)         | Tiras conductoras a–e / f–j y raíles +/−, inserción automática                     |
| Fuente de alimentación de laboratorio, batería externa | Fuentes de tensión continua (tensión ajustada en Propiedades)       |

**Pasivos y semiconductores**

| Componente                                       | Comportamiento simulado                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Resistencia                                      | Une sus dos patillas (valor y ángulo editables, código de colores dibujado)                  |
| Condensador (no polarizado, polarizado)          | Une sus dos patillas; el valor lo lleva el dibujo                                            |
| Diodo                                            | Conduce en un solo sentido (dibujo y marca del cátodo)                                       |
| Transistor (PN2222A, NPN, PNP)                   | Encapsulado TO-92 personalizado: inscripción y esquema interno según el modelo               |
| Termistores NTC / PTC, sensor de temperatura NTC | Entrada analógica: temperatura ajustada en Propiedades (o con un cursor durante la simulación) |
| LDR / fotorresistencia                           | Entrada analógica: luminosidad ajustada en Propiedades                                       |

**Indicadores y pantallas**

| Componente                        | Comportamiento simulado                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| LED, LED RGB, barra de 10 LED     | Encendido según los niveles de los nodos (ánodo alto, cátodo bajo), luminosidad según la resistencia en serie |
| Display de 7 segmentos            | Segmentos A–G + punto, cátodo común DIG1 (se sigue el multiplexado)                            |
| NeoPixel, anillo, matriz          | Protocolo WS2812 decodificado bit a bit: el color real de cada píxel                           |
| LCD de texto (HD44780)            | Controlador emulado: 4 u 8 bits, cursor, caracteres personalizados                             |
| Pantalla OLED SSD1306             | Memoria de pantalla decodificada y dibujada (SPI + DC + CS)                                    |
| Pantalla TFT ILI9341 (SPI)        | Renderizado SPI, orientación y ventana de escritura seguidas                                   |

**Entradas**

| Componente                                      | Comportamiento simulado                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Pulsador (estándar, 6 mm)                       | Lleva el pin del microcontrolador a LOW al pulsar (pin cableado ↔ GND)                     |
| Interruptor deslizante                          | Conecta el común (2) con el lado 1 o 3                                                     |
| Interruptor DIP ×8                              | 8 canales independientes (na ↔ microcontrolador, nb ↔ GND)                                 |
| Teclado matricial (3×4, 4×4)                    | Matriz filas/columnas: la tecla en la que hace clic une su fila con su columna             |
| Potenciómetro (giratorio, deslizante, de ajuste) | Entrada analógica interactiva (A0–A5 en Uno, GP26–GP28 en Pico); el de ajuste imprime su valor con un código de 3 cifras |
| Joystick analógico                              | 2 ejes analógicos (VERT / HORZ) + botón SEL                                                |

**Sensores**

| Componente                                 | Comportamiento simulado                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Sensores de luz, gas (MQ), llama y sonido  | Salida analógica AO y salida digital DOUT (activa a nivel bajo); nivel ajustado con un cursor durante la simulación |
| Sensor PIR, sensor de inclinación          | Salida digital OUT; el PIR se dispara cuando el ratón pasa por encima                                   |
| Sensor de efecto Hall                      | Salida de drenador abierto S (activa a nivel bajo), imán arrastrado con el ratón durante la simulación  |
| Sensor de pulso                            | Salida analógica: frecuencia del pulso ajustada en Propiedades                                          |
| Sensor de ultrasonidos (HC-SR04)           | Duración del eco calculada a partir de la distancia Y de la velocidad del sonido; dos cursores durante la simulación (distancia, temperatura del aire) |
| Temperatura / humedad (DHT11, DHT22)       | Protocolo de un hilo completo (trama, paridad); valores ajustados en Propiedades                        |

**Actuadores y potencia**

| Componente                            | Comportamiento simulado                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Zumbador                              | Nota animada cuando existe tensión entre sus pines                                                   |
| Servomotor                            | Brazo posicionado según la anchura del pulso (PWM)                                                   |
| Ventilador, motor de corriente continua | La velocidad sigue la tensión realmente aplicada; la tensión insuficiente, la corriente insuficiente y la sobretensión se indican en el esquema |
| Relé OMRON G5V                        | Bobina que conmuta al 80 % de su tensión nominal, contacto NA/NC; diodo de rueda libre obligatorio    |
| Controlador PWM de 16 canales (PCA9685) | Registros I²C emulados: 16 salidas PWM, siempre que el borne V+ esté alimentado                     |
| Tarjeta microSD (SPI)                 | Tarjeta FAT16 de unos 2 MB en memoria: archivos leídos y escritos, contenido perdido al detener       |

**Lógica (encapsulados DIP)**

| Componente                             | Comportamiento simulado                        |
| -------------------------------------- | ---------------------------------------------- |
| CD4001, CD4011, CD4070, CD4071, CD4081 | 4 puertas CMOS NOR, NAND, XOR, OR, AND         |
| CD40106                                | 6 inversores con disparador Schmitt            |
| 74xx00, 74xx02, 74xx08, 74xx32, 74xx86 | 4 puertas TTL NAND, NOR, AND, OR, XOR          |
| 74xx14                                 | 6 inversores con disparador Schmitt            |

**Mecánica**

| Componente               | Comportamiento simulado                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Robot araña, pata de araña | Cinemática completa (33 ajustes, cajones plegables en el inspector) movida por los servomotores |

### Nuevos componentes

Se pueden descargar con el botón **Gestionar los componentes**, para añadirlos y quitarlos según lo que necesite. Los componentes incluidos con la extensión no se pueden quitar. También es más fácil compartirlos, ya que un componente entero cabe en un solo archivo (`.kompix`): o bien se descarga con el gestor, o simplemente se deja el archivo en la carpeta del proyecto — se añade automáticamente a los componentes disponibles.

También puede añadir repositorios externos de componentes.

> Atención: los componentes simulables contienen código. Compruebe sus fuentes.

![gestor de componentes](./images/gerercomposants.webp)

## Simular

### Ejecutar el código

Botón **Compilar y ejecutar el archivo activo** (o el comando del mismo nombre): el tratamiento depende de la extensión del archivo activo.

| Archivo                          | Tratamiento                          | Requisito                       |
| -------------------------------- | ------------------------------------ | ------------------------------- |
| `.ino`, `.c`, `.cpp` (placa Uno) | Compilación local y luego ejecución  | `arduino-cli` **o** `avr-gcc`   |
| `.c`, `.cpp` (placa Pico)        | Compilación directa en RAM (sin SO)  | `arm-none-eabi-gcc`             |
| `.py`                            | MicroPython en la Pico simulada      | firmware `.uf2` (ver más abajo) |
| `.hex`                           | Cargado directamente (Uno)           | —                               |
| `.uf2`, `.elf`, `.bin`           | Cargado directamente (Pico)          | —                               |

#### Un sketch sin cambios ya no se recompila

El resultado de una compilación se guarda **en disco**, clasificado según la suma de control del **contenido** de las fuentes (la carpeta del sketch y su `src/`, más la placa de destino y la versión de Kablix). Ejecutar un sketch que no ha tocado parte del binario ya producido: unas decenas de milisegundos en lugar de decenas de segundos. Basta con modificar una sola fuente para invalidar la entrada, y se conservan las 60 últimas compilaciones.

> Una compilación Arduino lanza decenas de herramientas y escribe otros tantos archivos objeto: si se eterniza en su equipo, casi siempre es el antivirus que inspecciona cada uno. Excluir `%LOCALAPPDATA%\Arduino15`, `%TEMP%\arduino` y la carpeta del proyecto lo cambia todo.

#### LED integrados de las placas

Durante la simulación la placa se ilumina como la real: el **LED verde ON** permanece encendido mientras el programa se ejecuta, y el **LED L** —el de `LED_BUILTIN`, pin **D13** en Uno, Nano y Mega— sigue el estado de ese pin. Un `blink` sobre `LED_BUILTIN` se ve, por tanto, **sin cablear ningún LED**. En la Pico, el LED integrado **GP25** cumple esa función.

#### Velocidad de simulación

La simulación sigue el **tiempo real**: un segundo en pantalla es un segundo en la placa real, `delay(1000)` dura de verdad un segundo. Cuando la página está ocupada un momento (un componente que se dibuja, un monitor serie que desfila), la simulación **recupera el retraso** en cuanto vuelve a tener la mano; solo se abandonan los bloqueos largos (más de un cuarto de segundo, una pestaña dejada en segundo plano): ese tiempo se **salta**, nunca se reproduce en avance rápido.

El selector de animales ralentiza la ejecución a propósito —🐢 10 %, 🐌 1 % del tiempo real— para observar un fenómeno rápido. A la inversa, 🐆 200 % y 🦅 500 % **piden** acelerar: la simulación toma entonces todo lo que la máquina puede darle, pero solo supera el tiempo real con un programa que deja dormir al núcleo. 🐇 100 % es el tiempo real.

Si aun así la placa no consigue seguir, aparece a la derecha de la barra de estado una insignia **«Ralentizada: 0.45× el tiempo real»**: la página está demasiado cargada para la simulación (esquema grande, equipo ocupado). La ralentización voluntaria del selector no cuenta como fallo. La insignia desaparece en cuanto la simulación vuelve a ir a tiempo, y al detenerla.

#### Componentes averiados: marco rojo y explicación

Cuando la simulación detecta un error de cableado o un componente destruido, **rodea al culpable con un marco rojo** en el esquema y muestra **a su lado una etiqueta amarilla sobre fondo rojo** que explica el problema y qué hay que corregir. La barra de estado solo conserva la última frase: la etiqueta permanece, a la vista, en el lugar correcto.

| Lo que Kablix detecta                   | Lo que dice la etiqueta                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Diodo de rueda libre montado al revés   | Diodo invertido                                                                                       |
| Relé sin diodo de rueda libre           | La bobina devuelve un pico de tensión al abrirse; destruye el transistor de mando, el diodo lo absorbe |
| Bobina subalimentada                    | El relé no se activa: alimente la bobina a su tensión nominal                                          |
| Alimentación demasiado débil para la bobina | Aumente la corriente máxima, o ponga menos bobinas en la misma fuente                              |
| Motor sin diodo de rueda libre (💥)     | Un motor es una bobina: el pico al cortar destruye el transistor de mando, el diodo lo absorbe         |
| Alimentación demasiado débil para el motor | Un pin de la placa no basta ni de lejos: pase por una alimentación y un transistor                  |
| Motor sobrealimentado (💥)              | Más de 1,5 veces su tensión nominal: sus bobinados no lo soportan                                      |
| LED quemado (💥)                        | Sin resistencia en serie (o con una demasiado pequeña), la corriente supera lo que soporta la unión     |
| Condensador reventado (💥)              | Tensión de servicio superada: use uno de tensión más alta                                              |
| Placa de 16 servos quemada (💥)         | El borne V+ admite 5 V, no más                                                                         |

El marco y la etiqueta solo aparecen **durante la simulación**; desaparecen en cuanto se corrige el fallo, y al detenerla.

### Añadir bibliotecas
La Raspberry Pi Pico y las placas Arduino funcionan de forma diferente, por su arquitectura de software y su manera de gestionar la memoria.
Arduino compila el código C++ a lenguaje máquina antes de enviarlo. La Pico (en MicroPython) lleva un intérprete en vivo que lee directamente los archivos de script.

#### Arduino
Por la compilación, la biblioteca debe instalarse en el PC que enviará el programa a la placa Arduino. Esa parte es sencilla: inicie «Arduino VsCode IDE» haciendo clic en su icono de la barra de actividades ![alt text](../../media/logo-arduino-ide.webp), se abre el panel de comandos. Haga clic en el gestor de bibliotecas ![alt text](../../media/arduino-bib.webp), busque la biblioteca e instálela. Una vez hecho, queda disponible para todos sus proyectos.
#### Pico pi
Es muy distinto para las placas Pico en MicroPython. Su biblioteca debe estar en la misma carpeta que el programa que la llama (existen otras formas, pero mantengámoslo simple). También debe estar en la propia placa. El botón «enviar a la Pico» envía las bibliotecas que el programa necesita, siempre que estén en la carpeta.
Los módulos siguientes vienen integrados en el MicroPython de las placas Pico: machine, rp2, framebuf, neopixel, time, math, cmath, os, gc, sys, struct, uctypes, json, network, socket, bluetooth (los tres últimos requieren un modelo con Wi-Fi/Bluetooth, como la Pico W o la Pico 2 W). **En simulación**, el chip Wi-Fi no se emula: Kablix sustituye `network` por una fachada y retransmite las peticiones HTTP reales (`urequests`) a través del equipo anfitrión, mientras que `socket` y `bluetooth` quedan fuera de la simulación —ver la ficha [Pico W](composants/picow.md).
La Pico es ante todo un microcontrolador. Por tanto, también puede programarla en C, y Kablix lo permite (Pico y Pico W; el RP2350 de la Pico 2 aún no está portado), pero no he creado un entorno de desarrollo para ello. Raspberry Pi ofrece uno, así que le recomiendo instalar su extensión.

### MicroPython en la Pico

1. Abra un archivo `.py` → **Compilar y ejecutar el archivo activo**.
2. En la primera ejecución, si no se encuentra ningún firmware, Kablix **propone descargarlo automáticamente** (a elegir entre **Pico / Pico W**) desde [micropython.org](https://micropython.org/download/RPI_PICO/). El firmware se guarda en el almacenamiento de la extensión y se **reutiliza en todos sus proyectos**: la pregunta solo se hace una vez.

Para usar su propio firmware (sin conexión, una versión concreta…): coloque un `.uf2` oficial **en el espacio de trabajo** (cualquier carpeta) o indique su ruta en el ajuste **`kablix.micropythonUf2`**; tendrá entonces prioridad.

> ⚠ **Funcionamiento totalmente sin conexión.** Para que un equipo sin Internet nunca tenga que descargar el firmware, **coloque el `.uf2` en la carpeta del proyecto**: se versionará y se entregará con el proyecto. Kablix busca el firmware **primero en el espacio de trabajo**, luego en el firmware descargado/guardado, y solo propone la descarga como último recurso. Un proyecto que lleva su firmware es así reproducible y autónomo.

El firmware arranca dentro del simulador (bootrom + flash + USB) y luego el script se inyecta mediante el **raw REPL**. Las llamadas a `print()` aparecen en el monitor serie; al final del script, el **REPL interactivo** sigue disponible mediante el campo de entrada o haciendo clic en el botón REPL.

### Enviar el programa a una placa Pico real

Cuando hay un archivo `.py` abierto, aparece un botón **⬆** en su barra de pestañas. Un clic envía el programa a la placa conectada por USB, **renombrado `main.py`**: la placa lo ejecutará sola en cada encendido.

- **El botón se activa solo.** En gris, no se ve ninguna placa; Kablix revisa cada 4 s los puertos USB cuyo fabricante es Raspberry Pi (identificador `2E8A`), lo que evita confundir la placa con el puerto COM1 de la placa base. Conecte la placa y el botón se activa sin hacer nada más.
- **Solo se envían los módulos realmente usados.** Kablix lee las instrucciones `import` del programa, luego las `import` de esos módulos, y así sucesivamente: una carpeta con cincuenta archivos `.py` solo envía los pocos que el programa necesita de verdad. Un módulo colocado en `lib/` conserva su ubicación en la placa. Es exactamente la lista que usa el simulador: **lo que funciona en Kablix funciona en la placa**.
- **No se pregunta nada si hay un solo archivo.** En cuanto hay varios, se abre una lista y puede desmarcar lo que no quiera enviar (el programa principal siempre va).
- **Un archivo sin cambios no se reescribe.** La comparación se hace sobre el contenido (huella SHA-256), no sobre la fecha: el reloj de la Pico no se conserva al apagarla y vuelve a 2021 en cada arranque.

> La transferencia usa Python 3 y **pyserial** (`pip install pyserial`). Cierre cualquier monitor serie (Thonny, terminal…) que retenga el puerto; si no, la placa es inaccesible. Los detalles del envío se muestran en la salida **Kablix — Pico upload**.

### Depuración

- **⏸ Pausa / ▶ Reanudar**: congela la simulación; el estado de los pines y de los LED sigue mostrado. El selector de animales (🦅 500 % → 🐌 1 %) ajusta el ritmo de ejecución.
- **Paso**: ejecuta una línea del archivo fuente y vuelve a pausar. El panel **Variables** muestra entonces la línea actual y las variables legibles del programa; la línea también se resalta en el editor de VS Code. Una variable que acaba de cambiar se muestra en rojo.
- **Arrays, estructuras y punteros**: cada celda y cada campo tiene su propia fila, nombrada como se escribe en C: `notes[0]`, `p1.x`, y ambos combinados para un array de estructuras (`path[1].y`). Una cadena de caracteres se muestra letra a letra (`'s'`, `'a'`…) en lugar de códigos ASCII; un puntero muestra la dirección que contiene, en hexadecimal. Más allá de 32 celdas, un array solo muestra su comienzo.
- **Qué variables son visibles (C / Arduino)**: las que tienen una **dirección fija en memoria**: variables globales y **variables `static` declaradas dentro de una función**, mostradas bajo el nombre de su función (`loop::memo`). Una variable ordinaria declarada dentro de `setup()` o `loop()` vive en la pila y no tiene dirección estable: no se puede leer, pero el panel la **nombra** para que no la busque en vano. Dos remedios: declararla fuera de cualquier función, o añadirle `static` si su valor debe conservarse de una llamada a otra.
- **Puntos de interrupción**: haga clic en el margen del editor (a la izquierda de los números de línea) antes o durante la ejecución; la simulación se pausa al llegar a la línea. Los puntos de interrupción pueden ser condicionales.

Requisitos y límites:

| Lenguaje            | Cómo                                                                                                  | Límites                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| C / Arduino (Uno)   | Datos de depuración extraídos al compilar (`avr-objdump`, incluido con arduino-cli o avr-gcc)          | variables **globales** y variables **`static`** de función (las locales ordinarias no tienen dirección fija; se nombran, no se leen); un `delay()` largo avanza en tramos simulados de 0,25 s |
| MicroPython (Pico)  | el script se instrumenta automáticamente antes de la inyección                                         | solo variables **globales**; la pausa surte efecto en la línea siguiente; sin cámara lenta        |

Los artefactos cargados directamente (`.hex`, `.uf2`, `.elf`, `.bin`) se ejecutan sin información de depuración: la pausa y la cámara lenta siguen disponibles, el paso a paso no.

#### Ocultar variables

Un programa suele exponer variables sin interés (constantes, objetos de configuración) que ahogan las dos o tres que usted vigila. El panel **Variables** permite ordenarlas:

- **Ocultar**: haga clic en el **👁** a la izquierda de la variable (información «Clic para ocultar»). La variable desaparece del panel.
- **Volver a mostrar**: haga clic en el título **🔍 Variables ▾**: se abre la lista desplegable de las variables ocultas en ese momento. Un clic en una la devuelve al panel; **Volver a mostrarlo todo** las devuelve todas.
- **Recordar**: no hay nada más que hacer. La lista de variables ocultas se guarda **en el proyecto** (`.projix`) y se vuelve a aplicar al reabrirlo. Se escribe en el siguiente **guardado** del proyecto, exactamente como el encuadre de la página: ocultar una variable no marca el proyecto como «modificado».

Una variable oculta sigue **vigilada** en segundo plano: cuando vuelve, su rojo («cambiada en el último paso») es exacto, como si nunca hubiera salido del panel. Mientras el proyecto no se guarde, el estado oculto vale para el banco abierto: sobrevive a detener y reiniciar la simulación.

#### Base de visualización de una variable

Una máscara de bits o un registro se leen mejor en binario que en decimal. El nombre y el valor de una variable son **clicables** (el cursor se convierte en una mano): un **clic** abre un menú que propone cuatro bases de visualización: **Binario**, **Hexadecimal**, **Decimal** (por defecto) y **Carácter**. La base elegida lleva una marca ✓. El clic derecho abre el mismo menú.

El valor lleva entonces el **prefijo** de su base —el mismo que en C o en Python, para poder volver a escribirlo tal cual en el programa— y sus cifras se agrupan para facilitar la lectura:

| Base        | `160` se muestra | Agrupación |
| ----------- | ---------------- | ---------- |
| Binario     | `0b 1010 0000`   | 4 bits     |
| Hexadecimal | `0x A0`          | 4 cifras   |
| Decimal     | `160`            | 3 cifras   |
| Carácter    | `' '`            | —          |

El separador de grupos, como el que separa el prefijo, es un **espacio fino indivisible**: los grupos se distinguen de un vistazo y el número nunca se corta al final de línea, ni siquiera en un panel estrecho.

En **Carácter**, los códigos de control se muestran escapados (`'\n'`, `'\t'`, `'\0'`…), y los demás valores fuera del rango imprimible como `'\x1f'`. Los valores que no son enteros (flotantes, cadenas, listas, objetos) se dejan **tal cual** sea cual sea la base elegida. En todos los casos, la información sobre herramientas del valor recuerda la forma bruta.

La elección vale para **esa variable** y se recuerda **en el proyecto**, como las ocultas: al reabrir el `.projix`, cada variable recupera su base. Como estos ajustes forman parte del archivo, cambiarlos marca el proyecto **pendiente de guardar** (el punto ● en la pestaña): `Ctrl+S` los escribe.

### Monitor serie

- **Salida**: USART (Uno), USB-CDC y UART0 (Pico), en tiempo real.
- **Entrada**: campo de entrada + `Intro` (o el botón Enviar). En la Pico, la entrada alimenta el USB-CDC (REPL de MicroPython) **y** el UART0.
- **Errores de compilación**: cuando el programa no compila, los mensajes **completos** del compilador se muestran aquí, bajo un encabezado `── Build failed ──` (el monitor se despliega solo si estaba plegado). La burbuja de notificación solo recuerda el **primer** error —`file.ino:12: 'digitalWrit' was not declared in this scope`—: casi siempre es el que hay que corregir primero, los demás se derivan de él.

### Trazador

Panel en la parte inferior de la pantalla: muestra magnitudes numéricas en tiempo real, sin salir de Kablix ni añadir dependencias.

Se trazan automáticamente dos fuentes:

- **Telemetría del programa**: cada línea en formato **Teleplot** `>nombre:valor` (unidad opcional `§u`) emitida por el puerto serie se convierte en una curva. Compatible con la herramienta Teleplot en hardware real: el mismo sketch traza aquí y allí. Esas líneas las **absorbe** el trazador: no saturan el monitor serie.
- **Sondas internas**: la tensión que cada sensor analógico pone en su pin se traza **sin una sola línea de código** en el sketch (trazo escalonado, el valor se mantiene entre dos cambios). La curva lleva el nombre del **canal del convertidor seguido del pin** —`ADC0 (A0)` en Arduino, `ADC0 (GP26)` en Pico—, para reconocer de un vistazo el `analogRead(A0)` o el `machine.ADC(0)` del programa.

Ejemplos de emisión:

| Lenguaje            | Línea                                                               |
| ------------------- | ------------------------------------------------------------------- |
| C / Arduino         | `Serial.print(">temp:"); Serial.println(t);`                        |
| C / Arduino (unidad)| `Serial.print(">voltage:"); Serial.print(v); Serial.println("§V");` |
| MicroPython         | `print(">temp:{}".format(t))`                                       |

Controles del panel:

- **Ventana**: duración mostrada (5, 10, 30 o 60 s, o **Personalizado**: escriba una duración como `1h30`, `45 min` o `2 h 15 min 10 s`), ventana deslizante. El tiempo de las graduaciones es el tiempo **simulado** del montaje: al acelerar, un segundo en pantalla equivale a varios. El selector de velocidad ofrece también ✎ para escribir un porcentaje libre.
- **⏸ / ▶**: congela la visualización; la recogida continúa en segundo plano.
- **Pastillas de la leyenda**: clic para ocultar/mostrar una curva; el valor actual se muestra en vivo sobre ella.
- **Pasar el ratón**: retícula + información con el valor de cada curva en el instante señalado.
- **CSV**: exporta todas las series (formato largo `tiempo ; magnitud ; valor ; unidad`, separador y signo decimal según el idioma: se abre directamente en un Excel localizado).
- **Borrar**: vacía las curvas.

Cuando se detiene la simulación, las curvas siguen mostradas para analizarlas.

### Consumo de la placa

En cada arranque, el trazador muestra dos curvas **sin una sola línea de código**: **`Corriente de la placa`** (mA) y **`Carga consumida`** (mAh, acumulada desde el arranque). No abren el panel por sí solas: esperan a que usted lo mire.

Lo que se mide es la **placa real**, no solo el chip: su microcontrolador, pero también su regulador, su chip USB y su LED ON — más la corriente que suministra a lo que alimenta (LED controlados por sus pines o conectados a sus raíles 5V / 3V3).

| Placa | Despierta | En reposo profundo |
| ----- | --------- | ------------------ |
| Uno | 46 mA | 31 mA |
| Nano | 19 mA | 7 mA |
| Mega | 72 mA | 47 mA |
| Pico, Pico 2 | 21-22 mA | 1,3 mA |
| Pico W, Pico 2 W | 23-24 mA | 1,4 mA |

*Órdenes de magnitud de placas reales en reposo, alimentadas a 5 V.* La lección está en la diferencia: una Uno dormida conserva dos tercios de su consumo, una Pico pierde el 95 %.

**Qué cuenta como reposo profundo** — las instrucciones de suspensión reales, como en el chip:

- **Arduino**: `sleep_cpu()` (`avr/sleep.h`) o una biblioteca como *LowPower*, en modo **power-down**, **power-save** o **standby**. El núcleo se detiene de verdad hasta la interrupción que lo despierta: el **perro guardián** (`WDT`), una interrupción externa (`INT0`, `INT1`, cambio de pin) — y el Timer 2 en power-save. El modo *idle* se despierta con la menor interrupción (la de `millis()` cada milisegundo) y no cuenta como reposo profundo.
- **Pico**: `machine.lightsleep(ms)` (y `deepsleep`).
- **No cuentan**: `delay()`, `time.sleep()` — el chip real sigue despierto durante estas esperas, y su consumo también.

Para medir una **autonomía**, haga que la placa se alimente con una batería: vea la ficha de la [Batería externa (Power bank)](composants/powerbank.md).

**Pilas de la biblioteca** — **4 × AA**, **9 V**, **CR2032** y **LiPo 1S** se instalan con **⚙ Gestionar componentes**. Patas **+** y **−**, capacidad ajustable en el inspector. Su tensión **baja con la carga** (4 × AA: 6,4 V nuevas, 4,4 V gastadas): el trazador muestra `Bat1: tensión` además de la carga y la autonomía.

Cada entrada de la placa tiene su rango de tensión:

| Entrada | Rango aceptado |
| ------- | -------------- |
| **VIN** (Uno, Nano, Mega) | 6,2 a 20 V |
| **5V** (Uno, Nano, Mega) | 4,5 a 5,5 V |
| **VSYS**, **VBUS** (Pico) | 1,8 a 5,5 V |

Fuera de rango al arrancar, **la placa se niega a arrancar** y la barra de estado dice por qué: una CR2032 (3 V) no hace funcionar una Uno, una LiPo (4,2 V) no pasa el regulador de VIN, una pila de 9 V quemaría el VSYS de una Pico. Una pila que se gasta también puede caer **por debajo** del umbral por el camino: la placa se apaga entonces, y la barra de estado dice tras cuánto tiempo de programa (4 × AA en VIN, por debajo de 6,2 V).

**Cortocircuito de una pila o batería** (su + unido a su − sin nada entre los dos): **explota**, la simulación se detiene y se abre una **página de advertencia** cada vez. Recuerda las reglas de seguridad de pilas y baterías (cortocircuito, pilas al revés en un portapilas, cargador, carga sin vigilancia, superficie inflamable, pilas nuevas y usadas mezcladas, temperaturas extremas, pila deformada, recogida). Cubre el montaje y solo se cierra tras 15 segundos de lectura. Del mismo modo, una pila de 9 V en VSYS destruye la placa: la explosión y la explicación permanecen sobre el montaje.

### Iluminación DMX512

Kablix simula una **línea DMX512** de principio a fin: el programa envía la trama, el decodificador la lee y el **proyector se enciende de verdad** en el color pedido.

El circuito usa dos componentes de la **biblioteca** (a instalar mediante **⚙ Gestionar los componentes**):

- **Grove DMX512**: la interfaz; su entrada **SIG** se cablea a un pin de la placa, su salida es el par diferencial **+** / **−**;
- **Proyector PAR 38**: la luminaria; sus patas **+** / **−** se unen a las de la interfaz y **GND** cierra el blindaje. **Los dos hilos del par deben seguir**: un proyector conectado solo por Data+ no se reconoce, está cableado a medias.

La **dirección DMX** del proyector se ajusta en el inspector (**Propiedades → Dirección DMX**, de 1 a 512). A partir de ella se consumen tres canales: rojo, verde, azul. Varios proyectores pueden escuchar la misma línea, cada uno en su dirección: esa es toda la gracia del DMX.

Se reconocen las dos formas de transmitir:

- **UART hardware**: `Serial.begin(250000, SERIAL_8N2)` en Arduino (pin 1; en Mega también 18, 16 y 14), `machine.UART(0, …, stop=2)` en Pico (GP0). El BREAK que abre la trama se hace a mano, como en una placa real. Los 513 bytes de la trama **no llegan al monitor serie**: la consola sería ilegible.
- **Biblioteca bit-bang**: **DmxSimple** y similares, que producen la trama a mano en un **pin ordinario** (3 por defecto). Kablix decodifica entonces el **propio hilo**, flanco a flanco: un programa comercial funciona sin modificarlo.

> Solo se tiene en cuenta el código de inicio 0 (iluminación): un `Serial.println` en el mismo pin no enciende, por tanto, ningún proyector.

## Exportar la lista de componentes (nomenclatura CSV)

Menú hamburguesa → **«Exportar la lista de componentes (CSV)»**. Una línea por componente, cinco columnas:

| Referencia | Componente               | Tipo         | Valor   | Comentario                                        |
| ---------- | ------------------------ | ------------ | ------- | ------------------------------------------------- |
| `C2`       | Condensador electrolítico | `condo-p-1` | `10 µF` | `Tensión máx.: 400 V`                            |
| `R1`       | Resistencia              | `resistor`   | `10 kΩ` | `Potencia: 0,25 W`                                |
| `T1`       | Transistor               | `transistor` |         | `Vce máx.: 40 V · Ganancia de corriente (β): 100 · …` |

- **Valor**: el que se lee sobre el componente, con su unidad y su prefijo (`10 µF`, `100 kΩ`, `4.7 mH`). Un componente que no tiene —un transistor, una pantalla— deja la celda vacía.
- **Comentario**: todas las demás características del inspector, separadas por `·`, en la forma `Tensión máx.: 400 V`.
- Los tres condensadores se distinguen por su nombre: **de película**, **de tántalo** o **electrolítico**.
- La lista se ordena por familia y luego por número (`R2` antes que `R10`), y el archivo propuesto se llama **`<nombre del proyecto>.csv`**, junto al proyecto.

Separador `;`, marca UTF-8 y fines de línea CRLF: el archivo se abre directamente en una hoja de cálculo.

## Exportar el esquema en SVG

Botón **disquete SVG**: todo el esquema (componentes con sus rotaciones, cables de color con sus esquinas redondeadas) se exporta como **archivo SVG autónomo** mediante un diálogo de guardado. Utilizable en un documento, un sitio web, una impresión…

> Nota: algunos componentes con estilo por CSS interno pueden perder detalles estéticos al exportar; la geometría y los colores principales se conservan.

## Crear sus propios componentes

> ⚠ Experimental ⚠

> Guía detallada: [Retocar el SVG de los componentes y sus esquemas internos](Editing-svg-components.md) — retoque del dibujo SVG, la cuadrícula de 10 px y la edición de los esquemas internos (vista K).

Botón **«+ Crear un componente»** al pie de la paleta: se abre una ventana a pantalla completa, con el formulario a la izquierda y **dos vistas previas** a la derecha (vista externa y vista interna). Los botones de **zoom** de arriba (−, %, +, ⛶ *ajustar*) escalan ambas vistas previas.

**1. Nombre y categoría.** El nombre es la etiqueta que se muestra en la paleta. La categoría elige la sección de la paleta donde se clasifica el componente (Placas y protoboards, Pasivos, Pantallas y LED, Mandos, Sensores, Actuadores, Sistemas, Instrumentos de medida, Varios, Circuitos integrados); si se deja vacía, va a **Componentes personalizados**.

**2. Modelo de simulación.** Define el comportamiento eléctrico:

| Modelo                              | Papeles de las patas         | Comportamiento                                       |
| ----------------------------------- | ---------------------------- | ---------------------------------------------------- |
| LED                                 | `A` (ánodo), `C` (cátodo)    | Halo luminoso cuando A=alto y C=bajo                 |
| Pulsador                            | `1.l`, `2.l`                 | Clic en el dibujo = pulsación (pata llevada a GND)   |
| Resistencia                         | `1`, `2`                     | Une eléctricamente sus dos patas                     |
| Zumbador                            | `1`, `2`                     | Halo cuando hay una tensión entre las dos patas      |
| Fuente digital                      | `OUT`                        | Estado 0/1 fijado en Propiedades                     |
| Fuente analógica                    | `AO`                         | Valor 0–100 % fijado en Propiedades                  |
| Sensor de ultrasonidos HC-SR04      | `TRIG`, `ECHO`               | Eco de distancia (ajustable)                         |
| Pantalla LCD I²C (HD44780)          | — (bus I²C)                  | Pantalla controlada por el bus I²C                   |
| Controlador PWM I²C (PCA9685)       | — (bus I²C)                  | 16 salidas PWM en el bus I²C                         |
| Pantalla OLED I²C (SSD1306)         | — (bus I²C)                  | Pantalla gráfica I²C                                 |
| Pantalla OLED SPI (SSD1306)         | `DC`                         | Pantalla gráfica SPI                                 |
| Decorativo                          | —                            | Sin comportamiento (anotación, decoración)           |

El botón **⇪** junto a la lista importa **modelos de simulación** adicionales desde un `.json` (papeles y atributos preasignados); se añaden en «Modelos importados» y se conservan.

**3. Dibujo externo.** Botón **«Cargar un SVG…»**: carga el dibujo desde un archivo `.svg`. Kablix lee los **marcadores de convención** colocados en el SVG (con Inkscape, por ejemplo) y los retira del componente final:

- **círculo rojo** (opacidad 0,8) = una pata → detectada y colocada automáticamente;
- **texto rojo** cerca de una pata = su nombre (se convierte en la información sobre herramientas);
- **círculo verde** (opacidad 0,5) = ancla de alineación de la vista interna (ver 5).

Sin marcadores rojos, **haga clic en la vista previa** para colocar cada pata a mano.

> ⚠ Las patas deben estar en una cuadrícula de 10 px, sin excepción.

**4. Puntos de conexión.** La lista de «Puntos de conexión» permite **renombrar** cada pata, ajustar sus coordenadas **x / y** al píxel o eliminarla (✕). Un clic en la vista previa externa siempre añade un punto.

**5. Vista interna (opcional).** Botón **«Cargar un SVG…»** de la columna interna: un segundo dibujo (vista esquemática) que se muestra al abrir el componente. Se alinea con la vista externa gracias al **círculo verde** (ancla) presente en ambos SVG: escalas idénticas obligatorias. La casilla **Superponer** controla la alineación en la vista previa externa; **✕** elimina la vista interna.

**6. Parámetros de definición** (botón **＋**). Campos numéricos con nombre (valor nominal de una resistencia, etc.): aparecen en el inspector del componente **y** se convierten en variables reutilizables en la característica del mando de simulación.

**7. Mando de simulación.** Añade al componente, durante la simulación, un **cursor** (salida analógica) o un **interruptor** (salida digital):

- **Cursor**: etiqueta, unidad, mín. / máx. / paso, y una **característica**: una expresión que da la tensión de salida **en voltios** en función de `x` (posición del cursor) y de los parámetros definidos en 6. Vacía = rampa lineal mín.→máx. La expresión se valida en directo.
- **Interruptor**: una etiqueta, salida 0/1.

**8. Guardar.** El componente aparece en la paleta (★) y se **conserva entre sesiones**. El botón **«Enviar a Kablix…»** explica cómo compartir el componente (issue de GitHub «Submit new component» o pull request).

Gestión desde la paleta: **clic** = colocar en el lienzo, **doble clic** = reabrir el creador para editar, **⇩** = exportar como `.kompix`. El ⇩ solo aparece en un componente **creado aquí** (marcado con ★): para uno que viene de la biblioteca, su `.kompix` ya existe en el editor. La **eliminación** ya no está en la paleta: se encuentra en **⚙ Gestionar los componentes** (el botón destacado al pie de la paleta), que enumera lo que está realmente instalado y pide confirmación.

### Gestor de componentes (instalación y desinstalación)

El botón **⚙ Gestionar los componentes**, al pie de la paleta (o el comando **Kablix: Gestionar los componentes**), abre la lista de componentes, que se puede filtrar:

- **Nuevos**: lo que ofrecen los repositorios y aún no está instalado, más los componentes instalados cuyo repositorio tiene una versión más reciente (marco naranja, «Actualización disponible»);
- **Instalados**: todo lo que contiene la biblioteca local, incluidos los componentes creados aquí y los que ningún repositorio ofrece;
- **Todos**: ambos.

> 📦 La lista ilustrada de lo que ofrece el repositorio oficial está en [kablix_components/README.md](../../kablix_components/README.md).

Una tarjeta puede llevar la mención **Beta** (una insignia y un marco discontinuo): el componente está publicado y funciona, pero aún no está consolidado; su dibujo, sus patas o su simulación pueden cambiar de una versión a otra. Nada le impide usarlo; simplemente prevea tener que actualizarlo.

Las tarjetas se seleccionan con un clic; luego **Descargar** instala y **Eliminar** desinstala. Eliminar pide confirmación, borra el archivo `.kompix` de la biblioteca y retira el componente de la paleta **y** de los esquemas abiertos. Es definitivo: reinstalar pasa por el repositorio de origen, o por un `.kompix` exportado previamente (**⇩**).

**Aviso al arrancar.** Al abrir Kablix se consultan los repositorios: una notificación avisa cuando un componente instalado tiene una versión más reciente en el repositorio, o cuando han aparecido componentes nuevos desde la última consulta. Su botón **Abrir el gestor** lleva directamente a la lista. Cada actualización y cada componente nuevo se señalan una sola vez; no se muestra nada si nada ha cambiado o si la red no está disponible. La primera consulta solo señala las actualizaciones: no se anuncia todo el repositorio como «nuevo». El ajuste **Kablix › Check Components On Startup** (activado por defecto) desactiva este aviso.

Dónde se guardan los componentes instalados: en una carpeta **compartida por todos los proyectos Kablix** del equipo; por defecto `%APPDATA%\Code\User\globalStorage\electropol-fr.kablix\kablix_components` en Windows (`~/Library/Application Support/Code/User/globalStorage/...` en macOS, `~/.config/Code/User/globalStorage/...` en Linux). El ajuste **Kablix › Components Folder** apunta a otra, y el comando **Kablix: Abrir la biblioteca de componentes** abre la que realmente se usa, esté o no rellenado el ajuste. Los repositorios que consulta el gestor se configuran de la misma forma (**Kablix › Component Repositories**).

## Formato de archivo de componente (.kompix)

Un componente Kablix se guarda en el formato **`.kompix`**: un archivo ZIP autónomo que contiene:

- Metadatos (`manifest.json`)
- Dibujo externo (`schema.svg`)
- Opcional: esquema interno, miniatura, código de simulación

Consulte [kompix_specification.md](../kompix_specification.md) para todos los detalles.

### Crear sus propios componentes

1. **Creador integrado** (paleta → **+ Crear un componente**):
  - Importar un SVG (dibujo externo + esquema interno opcional)
  - Colocar las patas con un clic
  - Configurar el modelo de simulación (tipo, papeles, atributos)
  - **Guardar** crea un `.kompix` en la biblioteca local
  - **⇩** exporta un archivo `.kompix` (guardar como)
2. **A partir de un prompt de IA**:
  - Copie el prompt de abajo
  - Pida a Claude, ChatGPT, etc. un JSON de base
  - **Importe** el JSON en el creador
  - Termínelo y **Guarde**

Prompt para generar un componente (cópielo y rellene la primera línea):

```json
{
  "type": "custom-m4k2xyz",
  "label": "Mi LED especial",
  "kind": "led",
  "svg": "<svg width=\"40\" height=\"56\" xmlns=\"http://www.w3.org/2000/svg\">…</svg>",
  "pins": [
    { "name": "plus",  "x": 12, "y": 50 },
    { "name": "minus", "x": 28, "y": 50 }
  ],
  "pinRoles": { "A": "plus", "C": "minus" },
  "attrs": {}
}
```

| Campo                     | Tipo   | Descripción                                                                                                                                                                              |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                    | string | Identificador único. Se genera automáticamente si falta al importar.                                                                                                                     |
| `label`                   | string | **Obligatorio.** Nombre mostrado en la paleta.                                                                                                                                            |
| `kind`                    | string | Modelo de simulación: `led`, `pushbutton`, `resistor`, `buzzer`, `digital-source`, `analog-source` o `passive` (por defecto).                                                            |
| `svg`                     | string | **Obligatorio.** Código SVG completo del dibujo (etiqueta `<svg>` con `width`/`height` en píxeles).                                                                                       |
| `pins`                    | array  | **Obligatorio.** Puntos de conexión: `name` (único), `x`, `y` en píxeles **relativos a la esquina superior izquierda del dibujo**.                                                        |
| `pinRoles`                | object | Correspondencia *papel del modelo* → *nombre de pata* (ver la tabla de modelos). Si falta, las patas deben llevar directamente el nombre del papel.                                        |
| `attrs`                   | object | Atributos iniciales. Para `digital-source`: `{ "state": "0" }`; para `analog-source`: `{ "value": "50" }`.                                                                                |
| `category`                | string | Sección de la paleta (`Boards`, `Passive`, `Displays & LEDs`, `Controls`, `Sensors`, `Actuators`, `Systems`, `Instruments`, `Misc`, `Integrated circuits`). Ausente = «Componentes personalizados». |
| `params`                  | array  | Parámetros de definición: `name` (identificador), `label`, `value` (número). Campos del inspector, reutilizables en `control.expr`.                                                       |
| `control`                 | object | Mando de simulación: `{ "type": "slider", "label", "unit", "min", "max", "step", "expr" }` (tensión en voltios, `expr` en función de `x` y de los `params`) **o** `{ "type": "switch", "label" }`. |
| `innerSvg`                | string | Vista interna opcional (esquema mostrado al abrir el componente).                                                                                                                        |
| `innerOffset`             | object | Desplazamiento `{ x, y }` de la vista interna en el marco del dibujo externo (alineación).                                                                                               |
| `extAnchor` / `intAnchor` | object | Anclas verdes `{ x, y }` medidas al importar; recalculan la alineación cuando se vuelve a importar un solo SVG.                                                                          |

Los valores de `kind` disponibles para los módulos I²C/SPI completos son además: `ultrasonic` (HC-SR04, papeles `TRIG`/`ECHO`), `i2c-lcd`, `i2c-pwm`, `i2c-oled` (bus I²C, sin papel), `spi-oled` (papel `DC`).

Consejos para el dibujo SVG:

- Indique `width`/`height` razonables (40–200 px): es el tamaño de visualización en el lienzo.
- Evite `<style>` y los scripts; prefiera los atributos de presentación (`fill`, `stroke`…): sobreviven a la exportación SVG del esquema.
- Dibuje visualmente sus puntos de conexión donde declara los `pins`.

### Hacer que una IA genere un componente

Copie el prompt de abajo en su asistente de IA favorito (Claude, ChatGPT…), rellene la primera línea y luego importe el JSON obtenido mediante **⇪ Importar (.json)**:

```text
Crea un componente para el simulador Kablix: [DESCRIBE AQUÍ TU COMPONENTE, p. ej. «un módulo de relé de 5V con un LED testigo»].

Responde ÚNICAMENTE con un archivo JSON válido (sin texto alrededor), con el formato:

{
  "label": "<nombre corto mostrado en la paleta>",
  "kind": "<modelo de simulación, ver lista>",
  "svg": "<dibujo SVG completo en una sola línea>",
  "pins": [ { "name": "<nombre>", "x": <px>, "y": <px> } ],
  "pinRoles": { "<papel>": "<nombre de la pata>" },
  "attrs": {}
}

Restricciones:
- "kind" entre: "led" (encendido cuando el papel A=alto y C=bajo), "pushbutton"
  (clic = pata llevada a GND, papeles 1.l y 2.l), "resistor" (une los papeles 1
  y 2), "buzzer" (activo cuando hay una tensión entre los papeles 1 y 2),
  "digital-source" (salida digital, papel OUT, estado fijado por el usuario),
  "analog-source" (salida analógica, papel AO, valor 0-100 % fijado por el
  usuario), "passive" (decorativo, sin papel).
- "pinRoles": asocia cada papel del kind elegido al "name" de una de tus patas.
- "attrs": { "state": "0" } para digital-source, { "value": "50" } para
  analog-source, {} en los demás casos.
- El SVG: etiqueta <svg> con width/height en píxeles (60 a 200), solo atributos
  de presentación (fill, stroke…), sin <style> ni script, sin comillas
  tipográficas. Dibuja puntos dorados (círculos de ~4 px) en las posiciones
  exactas de las patas declaradas.
- Las coordenadas x/y de las patas están en píxeles desde la esquina superior izquierda del SVG.
- Escapa correctamente las comillas dentro del valor "svg".
```

La ayuda correspondiente (papeles, campos, restricciones) está en la sección [Formato de archivo de componente](#formato-de-archivo-de-componente-kompix): el prompt retoma lo esencial para que la IA no necesite otro contexto.

## Dónde encontrar componentes existentes

- **Integrados en Kablix**: toda la paleta (ver la tabla de arriba), basada en [@wokwi/elements](https://github.com/wokwi/wokwi-elements) (licencia MIT), galería visual en [elements.wokwi.com](https://elements.wokwi.com).
- **Dibujos SVG para sus componentes personalizados**:
  - [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Electronic_component_symbols) (símbolos electrónicos, licencias libres);
  - [SVG Repo](https://www.svgrepo.com) y [Openclipart](https://openclipart.org) (dibujos libres);
  - las fuentes de [wokwi-elements](https://github.com/wokwi/wokwi-elements/tree/master/src) contienen el SVG de cada componente (MIT: reutilizable en un componente personalizado);
  - [Fritzing](https://github.com/fritzing/fritzing-parts) (vistas «breadboard» en SVG, licencia CC-BY-SA).
- **Compartir**: un componente exportado (`.kompix`) puede dejarse en la carpeta de la biblioteca de otro equipo (**Kablix: Abrir la biblioteca de componentes**), o publicarse en un repositorio para que **⚙ Gestionar los componentes** lo ofrezca para descargar; ver [kablix_components/README.md](../../kablix_components/README.md) para el repositorio oficial y los pasos a seguir.

## Guardar / abrir un proyecto (.projix)

Un **proyecto Kablix** reúne en un solo archivo `.projix` (un archivo ZIP) **el esquema** (componentes, cables, componentes personalizados) y la **placa** de destino. El `.projix` es ligero y autónomo: ideal para archivar, compartir o entregar un esquema. **No lleva el código**: el archivo de código solo se **referencia** (por su ruta), permanece en el equipo.

- **💾 Guardar el proyecto** (botón de la barra de herramientas o comando **«Kablix: Guardar el proyecto (.projix)»**): elija dónde va el archivo `.projix`. Kablix pone en él el esquema actual, los componentes personalizados usados y la placa. El archivo de código asociado (si lo hay) se recuerda como **referencia** en el manifiesto; su contenido no se copia en el archivo.
- **`Ctrl+S`** hace exactamente lo mismo que el botón 💾: en un proyecto **nunca guardado** que ya tiene un archivo de código, el nombre propuesto es el del **código** (`mi-programa.py` → `mi-programa.projix`), no «Nuevo proyecto». En un proyecto que ya tiene nombre, reescribe el archivo sin preguntar nada.
- **📂 Abrir un proyecto** (botón o comando **«Kablix: Abrir un proyecto (.projix)»**): seleccione un `.projix`. El esquema y la placa se recargan en el simulador. Si se referenciaba un archivo de código, Kablix intenta encontrarlo en el equipo, en este orden: la ruta relativa junto al `.projix`, luego en cada carpeta del espacio de trabajo, después el **programa con el nombre del proyecto** situado a su lado (`mi-proyecto.ino` o `mi-proyecto.py`), y por último la ruta absoluta recordada al guardar.
- **Guardar como** en otra carpeta: los **componentes de biblioteca** usados por el esquema se graban de nuevo en el nuevo archivo (así el circuito se abre entero incluso en un equipo donde no están instalados), y el programa adoptado es el **que lleva el nombre del proyecto** si existe a su lado; si no, el banco seguiría compilando el sketch del proyecto original.

Contenido de un archivo `.projix`:

| Entrada        | Papel                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `kablix.json`  | Manifiesto: formato, versión, versión de la aplicación, placa, fecha, **referencia** del archivo de código |
| `diagram.json` | Esquema (componentes + cables), componentes personalizados **y los dibujos de los componentes de biblioteca** usados |

> ⚠ El código **no está incluido** en el `.projix`: solo se archiva el esquema. Para compartir también el código, entregue el archivo fuente junto al `.projix`.

## Interoperabilidad con Wokwi (diagram.json)

Los componentes integrados de Kablix son los elementos **@wokwi/elements** (mismos tipos, mismos nombres de pata), lo que permite intercambiar esquemas con el formato de proyecto **Wokwi** (`diagram.json`).

- **Exportar** (botón hamburguesa o paleta de comandos → **«Kablix: Exportar el esquema Wokwi (diagram.json)»**): escribe el esquema actual en formato Wokwi.
- **Importar** (botón hamburguesa o **«Kablix: Importar un esquema Wokwi (diagram.json)»**): carga un `diagram.json`; los tipos Wokwi que Kablix no admite se ignoran (su número se muestra en la barra de estado).

> ⚠ La **simetría** (flipH/flipV) y las **esquinas de los cables** no tienen equivalente estándar en `diagram.json`: Kablix las guarda en un bloque de extensión `kablix` (una clave que Wokwi ignora), para que un viaje de ida y vuelta Kablix → diagram.json → Kablix las restituya idénticas. Abierto en Wokwi, el esquema sigue siendo válido (componentes y conexiones estándar), simplemente sin la simetría ni las esquinas.
> Límite restante: los **componentes personalizados** de Kablix (`kablix-custom-part`) y los tipos Wokwi desconocidos no se convierten (se ignoran y se cuentan en la barra de estado).

## Actualizaciones de las bibliotecas

Kablix integra tres bibliotecas de simulación (`avr8js`, `rp2040js`, `@wokwi/elements`). La extensión funciona **sin conexión por defecto**: no se contacta ningún servicio remoto sin su consentimiento.

- **Comprobación manual**: paleta de comandos (`Ctrl+Shift+P`) → **«Kablix: Buscar actualizaciones de las bibliotecas»**. Kablix consulta entonces el registro npm y le dice si existe una versión más reciente (o que todo está al día).
- **Comprobación al arrancar** (opcional): active el ajuste **`kablix.checkUpdatesOnStartup`** (desactivado por defecto). Solo aparece entonces una notificación cuando hay una actualización disponible; en otro caso, silencio.
- **La notificación ofrece tres respuestas**: **Instalar** (abre la página npm; dentro del repositorio de la extensión, lanza directamente `npm install`), **Más tarde** (vuelve en el siguiente arranque) y **Esta versión no** (esa ya no se vuelve a proponer; una aún más reciente sí). La comprobación manual siempre responde, incluso sobre una versión rechazada.

> **Atención**: actualizar esas bibliotecas puede **romper la extensión** (cambios de API). Si algo va mal, abra una incidencia en el repositorio de GitHub: [github.com/FrankSAURET/kablix/issues](https://github.com/FrankSAURET/kablix/issues). Una comprobación de red ausente o fallida permanece silenciosa y no afecta al funcionamiento sin conexión.

## Extensiones recomendadas

Kablix **simula**; estas dos extensiones se encargan del resto de la cadena y lo complementan bien. Son **opcionales**: Kablix funciona por sí solo.

| Extensión                                                                                                                  | Para qué sirve                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`electropol-fr.arduino-vscode-ide`](https://marketplace.visualstudio.com/items?itemName=electropol-fr.arduino-vscode-ide) | Cadena Arduino en VS Code: placas, bibliotecas, compilación y **carga en la placa real**         |
| [`raspberry-pi.raspberry-pi-pico`](https://marketplace.visualstudio.com/items?itemName=raspberry-pi.raspberry-pi-pico)     | Raspberry Pi Pico en MicroPython: envío de archivos a la placa, REPL de hardware                 |

Kablix las propone **una sola vez**, en su primera activación. Para volver a ellas: paleta de comandos (`Ctrl+Shift+P`) → **«Kablix: Extensiones recomendadas»**.

### La placa elegida en Kablix pasa a ser la del proyecto Arduino

Si **`electropol-fr.arduino-vscode-ide`** está instalada, elegir **Uno**, **Nano** o **Mega** en el selector de placa de Kablix la elige **también en su lado**: su sketch `.ino` se reconoce al mismo tiempo (lenguaje, IntelliSense, compilación, carga), sin tener que volver a elegir la placa en la otra extensión. Esto también se aplica al abrir un proyecto `.projix`: la placa guardada en él se traslada.

El ajuste de la otra extensión es un archivo: **`.vscode/arduino.yaml`**, donde Kablix escribe dos líneas, `board` (el identificador completo de la placa, por ejemplo `arduino:avr:mega`) y `configuration` (la opción de procesador, `cpu=atmega2560`). Todo lo demás del archivo —sketch, puerto, carpeta de salida— queda intacto.

Tres salvaguardas:

- **Pico y Pico W no tocan nada**: son placas MicroPython, la placa Arduino ya elegida no se borra.
- **No se siembra ningún archivo** en una carpeta que no tiene nada que ver con Arduino: Kablix solo escribe cuando `.vscode/arduino.yaml` ya existe o cuando la carpeta contiene un sketch `.ino`.
- **No se reescribe nada** cuando la placa ya está puesta.

Para desactivar la sincronización: el ajuste **`kablix.syncArduinoIdeBoard`** (activado por defecto).

### Nada subrayado en rojo en su código

Un sketch `.ino` no es C++ de escritorio, y un programa MicroPython no es Python de escritorio. Sin una indicación, el analizador de VS Code no conoce ni `Serial` ni `pinMode` por un lado, ni `machine` ni `neopixel` por el otro: todo acaba subrayado aunque el programa esté bien. Kablix pone esa indicación por sí solo, porque sabe qué placa ha elegido usted.

- **Placa Arduino** (Uno, Nano, Mega): justo después de escribir la placa en `.vscode/arduino.yaml`, Kablix pide a **`electropol-fr.arduino-vscode-ide`** que reconstruya su configuración de IntelliSense para esa misma placa. Esa extensión es la dueña de `.vscode/c_cpp_properties.json`; Kablix nunca lo toca. El **sketch abierto** se escribe en el mismo archivo (clave `sketch:`): sin ella, la otra extensión no sabe de qué programa se trata y abandona en silencio.
- **Placa Pico** (Pico, Pico W, Pico 2, Pico 2 W): Kablix dirige Pylance hacia las **declaraciones MicroPython** incluidas con la extensión **MicroPico** (`paulober.pico-w-go`). Se añaden cinco ajustes al `.vscode/settings.json` de la carpeta del espacio de trabajo: `python.analysis.extraPaths`, `python.analysis.typeshedPaths` y `reportMissingModuleSource` a `none`, más `python.languageServer` a **Pylance** y `python.analysis.typeCheckingMode` a `basic` —los dos últimos porque otro analizador no lee ni los stubs ni sus archivos vecinos—, y `reportMissingModuleSource` porque esas declaraciones son archivos `.pyi` sin código fuente: el módulo real vive dentro del chip, así que es normal no encontrarlo en el disco.

Aquí también, tres salvaguardas:

- **No se sobrescribe nada**: se conservan sus propias rutas y sus propios ajustes de diagnóstico; Kablix solo añade lo que falta.
- **No se escribe nada** cuando la extensión correspondiente no está instalada, o cuando todo ya está en su sitio.
- **Una vez por placa y por carpeta**: reabrir un proyecto no rehace el trabajo.

Este trabajo automático es **silencioso**: Kablix escribe los ajustes y no dice nada. El **panel de salida**, en cambio, pertenece a la extensión Arduino: lo muestra cada vez que compila, incluso para construir su configuración de IntelliSense. Kablix no lo cierra: sería apropiarse de su panel, y además ocultaría las compilaciones que usted mismo pide.

Cuando no basta, la paleta de comandos (`Ctrl+Shift+P`) ofrece **Kablix: Corregir el análisis de código para esta placa**: rehace el trabajo a petición **y dice qué falta**: extensión que instalar, sketch `.ino` que abrir primero, ajustes escritos, o «todo está ya en su sitio, recargue la ventana».

> Una **función declarada en su propio archivo** o una **biblioteca situada a su lado** (`grove_16_channels_pwm.py`) las encuentra Pylance por sí solo, sin ningún ajuste. Si siguen subrayadas, Pylance aún no está en marcha: ejecute el comando anterior y recargue la ventana.

Para desactivarlo: el ajuste **`kablix.syncIntelliSense`** (activado por defecto).

> La extensión **`raspberry-pi.raspberry-pi-pico`** está pensada para el SDK C/C++ de la Pico, no para MicroPython: no interviene en lo que se subraya en un archivo `.py`. Es **MicroPico** la que aporta las declaraciones.

## Atajos de teclado

| Tecla                                | Acción                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `+` / `=`                            | Girar el componente seleccionado +45°                                                 |
| `-`                                  | Girar −45°                                                                            |
| `Supr` / `Retroceso`                 | Eliminar la selección: un componente, un cable o todo un lote (componentes **y** cables) |
| `Esc`                                | Cancelar el cable en curso / deseleccionar                                            |
| `Ctrl` (al arrastrar un asa)         | Retícula + alineación H/V de la esquina                                               |
| `Ctrl` (al arrastrar un segmento)    | Desplazamiento libre del segmento, fuera de la cuadrícula                             |
| `Ctrl+A`                             | Seleccionar todos los componentes                                                     |
| `Ctrl+C`                             | Copiar la selección (componentes + cables), permitido incluso durante una simulación  |
| `Ctrl+V`                             | Pegar la selección, **también en otro proyecto Kablix**                               |
| `Ctrl+D`                             | Duplicar la selección en su sitio                                                     |
| `Ctrl+S`                             | Guardar el proyecto, igual que el botón **Guardar** (nombre propuesto = el del archivo de código) |
| `Intro` (campo de entrada serie)     | Enviar la línea al microcontrolador                                                   |

### Copiar y pegar de un proyecto a otro

`Ctrl+C` pone en el portapapeles **una imagen SVG** de la selección: pegada en un documento, un correo o un programa de dibujo, sigue siendo un dibujo vectorial como antes. Ese mismo SVG lleva discretamente el esquema (componentes, posiciones, ajustes, cables) en una etiqueta `<metadata>` que los visores ignoran.

Resultado: `Ctrl+V` en **otro proyecto Kablix** recrea los componentes y sus cables, desplazados 20 px para que sigan visibles; un segundo pegado los vuelve a desplazar. Los componentes desconocidos para el proyecto receptor (componentes personalizados ausentes) se ignoran, el resto se pega. Pegar cualquier otro texto no hace nada, y el pegado se rechaza durante una simulación.
