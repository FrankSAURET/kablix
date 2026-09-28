# Grove DMX512

![Grove DMX512](dmx-grove.webp)

Placa Grove DMX512 (Seeed Studio): un driver de línea **SP3485** que convierte la UART de la placa en una salida DMX512 en un conector **XLR de 3 pines**. Componente de biblioteca: se instala con el gestor de componentes.

## Pines

| Pin | Función |
|--------|------|
| **SIG** | Entrada serie, a conectar al pin de transmisión de la placa |
| **VCC** | Alimentación +5 V |
| **GND.1** | Masa, lado Grove |
| **NC** | No conectado |
| **+** | Data+ del XLR (pin 3) |
| **−** | Data− del XLR (pin 2) |
| **GND.2** | Blindaje del XLR (pin 1) |

Dos masas, por tanto dos nombres: el dibujo pone «GND» en ambos lados y la lista de conexiones las distingue con `GND.1` y `GND.2` — como los `Com.1` / `Com.2` del relé.

## Cableado

- **SIG** a un pin de transmisión: `1` (TX) en Uno, `1` / `18` / `16` / `14` en Mega, `GP0` en Pico. Con `DmxSimple`, sirve cualquier pin (el 3 por defecto).
- **VCC** a +5 V, **GND.1** a masa.
- En el lado XLR, `+` / `−` / `GND.2` al [proyector](spot.md), encadenando los siguientes.

## Simulación

La placa no tiene comportamiento propio: es un driver de línea. Es ella la que da sentido al montaje — Kablix sube desde el pin conectado a **SIG** hasta los proyectores que comparten su par, y les aplica los canales que escuchan. Desconectada de la placa o del proyector, ya no se enciende nada.

Con el **analizador lógico**, una [sonda](sonde-logique.md) colocada en **SIG** o en **+** muestra la señal del pin que ataca la placa, y una sonda colocada en **−** la misma señal **invertida**: es el par diferencial del DMX, donde la línea − está siempre al contrario que la línea +. Para decodificar el canal −, marque **Invertir** en sus ajustes: entonces se lee como el +. En el margen, los canales **+** y **−** llevan las tensiones de salida del driver de línea, **3,7 V** en nivel alto y **1,1 V** en nivel bajo (valores de la hoja de datos del SN75176A), y no las de la placa; el canal **SIG** conserva las de la placa.

El tráfico DMX **no** llega al monitor serie: una trama son 513 bytes binarios por segundo, la consola quedaría inundada.

---

*Dibujo y ficha: Frank Sauret. Referencia: [Seeed Studio](https://wiki.seeedstudio.com/Grove-DMX512/).*
