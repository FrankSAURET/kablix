# Proyector DMX PAR 38

![Proyector DMX PAR 38](spot.webp)

Proyector LED PAR 38 (Contest) controlado por **DMX512**. Escucha la línea y toma el color enviado en sus canales. Componente de biblioteca: se instala con el gestor de componentes, no está en la paleta de origen.

## Pines

| Pin | Función |
|--------|------|
| **GND** | Blindaje del cable XLR (pin 1) |
| **−** | Data− (pin 2) |
| **+** | Data+ (pin 3) |

Hay que llevar **los dos** hilos del par hasta la interfaz: conectado solo por Data+, el proyector no se controla — está medio cableado, y la simulación lo deja apagado.

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `address` | Dirección DMX, 1 a 512. El proyector lee cuatro canales a partir de ahí: rojo, verde, azul, efectos | 1 |

Varios proyectores pueden compartir la misma línea, cada uno en su dirección: es todo el principio del DMX. Dos proyectores en la misma dirección dan el mismo color.

## Canales

| Canal | Función | Valores |
|-------|------|---------|
| dirección | Rojo | 0 a 255 |
| dirección + 1 | Verde | 0 a 255 |
| dirección + 2 | Azul | 0 a 255 |
| dirección + 3 | Efectos | **0 a 189**: intensidad luminosa (0 = apagado, 189 = a plena potencia); **190 a 250**: parpadeo, de 1 Hz (190) a 10 Hz (250); **251 a 255**: sin cambios, el color tal como se envía |

Con el canal de efectos a 0, el proyector se queda **apagado** sea cual sea el color: un programa que solo envía rojo, verde y azul debe ajustar también este cuarto canal.

## Cableado

Placa → [Grove DMX512](dmx-grove.md) → cable XLR → proyector. Los proyectores siguientes se conectan **en cadena** en el mismo par.

## Simulación

Kablix decodifica la trama emitida por la placa y enciende los LED del proyector con el color recibido, con su halo. Se reconocen las dos formas:

- **UART hardware** — `Serial.begin(250000, SERIAL_8N2)` en Arduino, `machine.UART(0, 250000, stop=2)` en el Pico, con BREAK y MAB generados por el programa;
- **biblioteca bit-bang** — `DmxSimple`, que no usa la UART sino que genera la trama en un pin normal (el 3 por defecto): la línea se decodifica flanco a flanco.

Un canal de color a 0 apaga el LED correspondiente; los tres a 0 apagan el proyector. El parpadeo sigue el tiempo simulado: se congela cuando la simulación está en pausa.

---

*Dibujo y ficha: Frank Sauret. Referencia: [Contest](https://www.contest-lighting.com/).*
