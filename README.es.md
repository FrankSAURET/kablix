 <img src="https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/accroche.webp" alt="Kablix" width="1000" />

*[Français](README.md) · [English](README.en.md) · [中文](README.zh-CN.md)*
> Atención, novedad: se pueden descargar componentes adicionales con el botón «Gestionar los componentes».
# Kablix
Una aplicación **gala** para simular microcontroladores (**Arduino Uno / Raspberry Pi Pico**) directamente en VS Code,
- **100 % sin conexión**
- **100 % gratuita**
- **100 % libre**
- **100 % sin telemetría**

La simulación se basa en tres motores de código abierto incluidos en la extensión: [avr8js](https://github.com/wokwi/avr8js) (ATmega328P), [rp2040js](https://github.com/wokwi/rp2040js) (RP2040) y [rp2350js](https://github.com/c1570/rp2350js) (RP2350), todos con licencia MIT.

## Pruebas
Mi biblioteca de pruebas está disponible aquí: [TestKablix](https://github.com/FrankSAURET/kablix/tree/main/testkablix)
## Primeros pasos
1. Para empezar, haga clic en el icono <img src="https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/KNB.webp" alt="Kablix" width="30" /> de la barra de actividad de la izquierda;
    - o bien, dentro de una carpeta de proyecto, haga doble clic en un archivo projix;
    - o bien, si ha configurado la asociación de archivos, haga doble clic en un archivo projix en el Explorador de Windows.

![alt text](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/demarrer.gif)
1. **Monte su circuito**: arrastre y suelte un componente desde la biblioteca de la izquierda. Una los pines directamente y luego pulse el botón de enrutado automático (enruta los componentes seleccionados, o todo el circuito si no hay nada seleccionado).
 
![alt text](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/dessiner.gif)
1. **Ejecute su código**: asocie un archivo de código (atención, los sketches `.ino` deben estar en una carpeta con el mismo nombre) y pulse **▶ «Iniciar»**:
   - `.ino`/`.c`/`.cpp` → compilado con la cadena de herramientas local;
   - `.py` → MicroPython en el Pico simulado (se necesita un firmware `.uf2`, ver más abajo);
   - `.hex` / `.uf2`/`.elf` / `.bin` → cargado tal cual, sin compilar.
   
1. **Guarde su circuito**: «Kablix: Guardar el proyecto (.projix)»; un `.projix` se vuelve a abrir con un doble clic desde el explorador. También se puede importar/exportar desde Wokwi (`diagram.json`).

![alt text](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/simuler.gif)
## Funciones

- ✅ **Taller visual**: enrutado automático. 
- ✅ **Creador de componentes**: puede crear sus propios componentes «personalizados» con este creador o, mejor aún, hacer un fork del repositorio, seguir la [guía](docs/es/Creating-components.md) para añadir el componente y abrir una PR (solicitud de publicación) — así llegará a todo el mundo en la siguiente versión; aporte también los circuitos de prueba (Pico + Arduino).
- ✅ **Exportación SVG**.
- ✅ **Una biblioteca de 76 componentes** ordenados por familias, cada uno con su ficha de ayuda ilustrada (botón ❔) y sus dos circuitos de prueba, Arduino y Pico — [lista completa](#biblioteca-de-componentes).
- ✅ **Gestor de componentes** (botón ⚙ al pie de la paleta): un componente cabe en un solo archivo `.kompix` — dibujo, patillaje, simulación y ficha de ayuda incluidos. Instálelo desde un repositorio con un clic, o deje el archivo en la carpeta del proyecto.
- ✅ **Iluminación DMX512**: universo decodificado desde la UART hardware **o** desde un pin en bit-bang (DmxSimple), proyectores controlados en directo.
- ✅ **Placas de desarrollo compatibles**: Arduino Uno, Nano, Mega 2560 y Raspberry Pi Pico/Pico W/Pico 2/Pico 2 W, todas insertables en una protoboard.
- ✅ **Grabación real del RP2040**.
- ✅ **Carga directa de binarios**: `.hex`, `.uf2`, `.elf`, `.bin` compilados en otro lugar, cargados sin recompilar
- ✅ **Compilación real de código C/C++**
- ✅ **Monitor serie bidireccional**: salida en directo y un campo de entrada para enviar datos al microcontrolador.
- ✅ **Trazador**: curvas en directo, y **sondas** colocadas en un pin para ver su tensión
- ✅ **Simulación física**: la luminosidad depende de la resistencia en serie, los LED sin resistencia se queman, los servos no arrancan, la alimentación tiene en cuenta la corriente…
- ✅ **Sensores interactivos**: cursores y botones para llama, gas, sonido, luz, temperatura y movimiento, que controlan en directo la entrada del circuito.
- ✅ **Instrumentos de medida**: multímetro, osciloscopio, generador de funciones y analizador lógico.

> Las ayudas están en la carpeta `docs/<código de país>/`.  
> 📖 **Guía completa**: USAGE.md — interfaz, cableado, creación de componentes personalizados (con un prompt para IA), el formato `.kompix`, el gestor de componentes, dónde encontrar componentes existentes.  
> **Añadir un componente a Kablix** (colaboradores, solo en GitHub): Creating-components.md — del dibujo en `Composants2D.svg` al componente simulado, probado y documentado, a mano o con una IA.  
> **Dibujar sistemas en volumen** (araña, patas — colaboradores, solo en GitHub): Drawing-systems.md — usted traza el contorno de una pieza y el motor isométrico la convierte en volumen.  
> 🌍 **Interfaz en cuatro idiomas**: francés, inglés, español y chino simplificado, según el idioma de VS Code (inglés para cualquier otro idioma). Las guías y las fichas existen en los cuatro idiomas. El mecanismo admite otros idiomas — vea [Internacionalización](#internacionalización).

## Biblioteca de componentes

**76 componentes** que se colocan con el ratón, ordenados como en la paleta (más sus variantes: condensador polarizado, transistores PN2222A/NPN/PNP, teclados 3×4 y 4×4, protoboards mini/half/full…). Cada uno tiene su **ficha de ayuda ilustrada** (botón ❔ del inspector, sin conexión, en francés, inglés, español y chino) y **dos circuitos de prueba** listos para simular en [testkablix](https://github.com/FrankSAURET/kablix/tree/main/testkablix) — uno en C en Arduino y otro en MicroPython en el Pico.

| Categoría | Componentes |
| --- | --- |
| **Placas y protoboards** (9) | Arduino Uno · Arduino Nano · Arduino Mega 2560 · Raspberry Pi Pico · Raspberry Pi Pico W · Raspberry Pi Pico 2 · Raspberry Pi Pico 2 W · Grove Shield (Pico) · Protoboard |
| **Componentes discretos** (11) | Resistencia · Condensador (polarizado o no) · Diodo · Transistor (PN2222A, NPN, PNP — encapsulado TO-92) · LED · LED RGB · Termistor NTC · Termistor PTC · Fotorresistencia (LDR) · Fotodiodo · Fototransistor |
| **Indicadores y pantallas** (8) | Barra de 10 LED · Display de 7 segmentos (1 a 4 dígitos) · NeoPixel · Matriz NeoPixel · Anillo NeoPixel · LCD de texto 16×2 / 20×4 (I²C o paralelo) · Pantalla OLED SSD1306 · Pantalla TFT ILI9341 (SPI) |
| **Mandos** (10) | Pulsador · Pulsador de 6 mm · Interruptor deslizante · Interruptor DIP ×8 · Teclado matricial 3×4 / 4×4 · Potenciómetro · Potenciómetro deslizante · Potenciómetro de ajuste · Relé OMRON G5V · Joystick analógico |
| **Sensores** (12) | Sensor de luz · Sensor de gas (MQ) · Sensor de llama · Sensor de sonido · Detector de movimiento PIR · Sensor de inclinación · Sensor de efecto Hall · Sensor de pulso · Sensor de temperatura NTC · Sensor de ultrasonidos (HC-SR04) · Temperatura/humedad DHT22 · Temperatura/humedad DHT11 |
| **Actuadores** (4) | Zumbador · Servomotor · Ventilador · Motor de corriente continua |
| **Sistemas** (2) | Robot araña · Pata de araña |
| **Instrumentos de medida** (5) | Fuente de alimentación de laboratorio · Multímetro de sobremesa · Osciloscopio de sobremesa · Generador de funciones · Sonda lógica (analizador lógico, experimental) |
| **Varios** (3) | Batería externa · Tarjeta microSD (SPI) · Controlador PWM de 16 canales (PCA9685) |
| **Circuitos integrados** (12) | **CMOS 4000**: CD4081 (4 × AND) · CD4071 (4 × OR) · CD4070 (4 × XOR) · CD4011 (4 × NAND) · CD4001 (4 × NOR) · CD40106 (6 × NOT, Schmitt trigger) — **TTL/HC 74**: 74xx08 · 74xx32 · 74xx86 · 74xx00 · 74xx02 · 74xx14 (mismas funciones; la familia elegida fija el rango de alimentación) |

A ellos se suman los **componentes de biblioteca** (`.kompix`), instalados por el gestor o dejados en la carpeta del proyecto, y los **componentes personalizados** dibujados en el creador integrado.

> 📦 **Biblioteca pública**: la lista ilustrada de componentes descargables está en [kablix_components/README.md](kablix_components/README.md).

## Internacionalización

La interfaz sigue el idioma de VS Code (`vscode.env.language`): **francés (`fr`), inglés (`en`), español (`es`) o chino simplificado (`zh-cn`)**, inglés para cualquier otro idioma (idioma de reserva). La traducción se apoya en tres registros independientes, porque traducen cosas de naturaleza distinta:

| Qué | Archivo | Forma |
| --- | --- | --- |
| Textos de la webview (barra de herramientas, paleta, inspector, catálogo…) | `src/webview/i18n.mts` + `src/webview/i18n-<idioma>.mts` | diccionario **clave (inglés) → traducción** (`DICTS`); `t()` vuelve a la clave inglesa si falta |
| Textos de la extensión (órdenes, notificaciones, diálogos) | `package.nls.<idioma>.json` + `l10n/bundle.l10n.<idioma>.json` | mecanismo nativo de VS Code (`%clave%` en `package.json`, `vscode.l10n.t()` en el código); el archivo sin sufijo es el inglés |
| Ayuda: guía de usuario (❔) y fichas de componentes | `docs/<idioma>/*.md` y `docs/<idioma>/composants/*.md` | **Markdown versionado**, mostrado sin conexión en una webview (`src/markdown.ts` → `src/guide.ts` / `src/partHelp.ts`) |

La ayuda no es una copia HTML congelada en el código: lo que se lee es **la propia guía**, imágenes incluidas — así nunca va por detrás de la documentación. Las capturas pesadas (GIF de demostración, logotipo) quedan fuera del `.vsix` y se sirven desde GitHub; todas las demás imágenes van incluidas, y por tanto se leen sin conexión.

Los tres registros usan la misma resolución: el **código base** del idioma (`es-ES` → `es`) selecciona la entrada correspondiente, y el inglés sirve de reserva cuando falta.

### Añadir un idioma (p. ej. alemán, `de`)

Hay que hacerlo en los **tres** registros — un idioma declarado en un solo sitio solo quedará traducido en parte:

1. **Webview** — crear `src/webview/i18n-de.mts` siguiendo el modelo de [`i18n-es.mts`](src/webview/i18n-es.mts) (`export const DE = { … }`, mismas claves inglesas que `FR`) y añadirlo a `DICTS` en [`src/webview/i18n.mts`](src/webview/i18n.mts) → `{ fr: FR, es: ES, zh: ZH, de: DE }`. Las claves sin traducir vuelven automáticamente al inglés.
2. **Extensión** — copiar `package.nls.json` como `package.nls.de.json` y `l10n/bundle.l10n.fr.json` como `l10n/bundle.l10n.de.json`, y traducir los valores (las claves no cambian). VS Code elige el archivo por sí solo.
3. **Ayuda** — crear `docs/de/`: la guía `USAGE.md` y la carpeta `composants/` (mismos NOMBRES de archivo que `docs/fr/`, solo se traduce el contenido; las imágenes se comparten en `docs/img/`). Añadir después el idioma a `DOC_LANGS` en [`src/partHelp.ts`](src/partHelp.ts) — una ficha ausente ya vuelve al inglés y luego al francés.

No hace falta ningún otro cambio de lógica: la selección y la reserva las gestionan `initLocale()` (webview) y `docLang()` (ayuda). `npm run verify:docs` comprueba que las guías y las fichas siguen completas, ilustradas e incluidas en el paquete.

## Créditos

Kablix lo desarrolla **[Frank SAURET](https://electropol.fr)** y se apoya en las siguientes bibliotecas de código abierto:

| Biblioteca | Función | Licencia |
| --- | --- | --- |
| [avr8js](https://github.com/wokwi/avr8js) | Motor de simulación ATmega328P (Arduino Uno) | MIT |
| [rp2040js](https://github.com/wokwi/rp2040js) | Motor de simulación RP2040 (Raspberry Pi Pico) | MIT |
| [rp2350js](https://github.com/c1570/rp2350js) | Motor de simulación RP2350 (Raspberry Pi Pico 2) | MIT |
| [@wokwi/elements](https://github.com/wokwi/wokwi-elements) | Componentes visuales (placas, LED, sensores…) | MIT |
| [JSZip](https://stuk.github.io/jszip/) | Lectura/escritura de los archivos `.projix` | MIT/GPLv3 |
| Bootrom B1 del RP2040 | Arranque del RP2040 simulado | © Raspberry Pi (Trading) Ltd — BSD-3-Clause |
| Dibujos oficiales de las placas Raspberry Pi | Dibujos de las placas Pico, Pico W, Pico 2 y Pico 2 W | © Raspberry Pi Ltd |
| MicroPython | Firmware `.uf2` ejecutado en el Pico simulado (aportado por el usuario) | MIT |
| Fuente [LED Board-7](http://www.styleseven.com) © Sizenko Alexander (Style-7) | Aspecto de pantalla LED de las pantallas LCD simuladas | Freeware (uso libre, mención obligatoria) |

El formato de proyecto y los componentes importados son compatibles con [Wokwi](https://wokwi.com) (formato abierto `diagram.json`).

## Licencia

MIT — el bootrom del RP2040 incluido es © Raspberry Pi (Trading) Ltd, licencia BSD-3-Clause.
