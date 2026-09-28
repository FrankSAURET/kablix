# Sensor de ultrasonidos HC-SR04

![Sensor de ultrasonidos HC-SR04](../../img/composants/hcsr04.webp)

Telémetro por ultrasonidos: mide una distancia (2–400 cm) por tiempo de vuelo.

## Pines

| Pin | Función |
|--------|------|
| **VCC** | Alimentación (+5 V) |
| **TRIG** | Disparo (impulso) |
| **ECHO** | Eco (duración ∝ distancia) |
| **GND** | Masa |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `distance` | Distancia simulada (cm) | 20 |
| `distancemin` / `distancemax` | Límites del cursor de distancia (cm) | 2 / 400 |
| `temperature` | Temperatura del aire al arrancar (°C) | 20 |

## Uso

- Impulso de 10 µs en TRIG, medir la anchura de ECHO (`pulseIn`, `time_pulse_us`).
- distancia_cm = duración_µs / 58.

## Durante la simulación: dos cursores

El componente muestra **dos ajustes** mientras corre la simulación:

- la **distancia** del obstáculo (cursor + campo, limitado por `distancemin`/`distancemax`);
- la **temperatura del aire** (−20 a 60 °C), que fija la **velocidad del sonido** — la burbuja de ayuda muestra la velocidad resultante.

El sensor nunca mide una distancia: mide un **tiempo de vuelo** de ida y vuelta. El programa lo convierte dividiendo por una constante — 58 µs/cm, correcta **solo a 20 °C**:

| Temperatura | Velocidad del sonido | Duración del eco | 100 cm leídos por un programa que divide por 58 |
|---|---|---|---|
| −20 °C | 319,2 m/s | 62,7 µs/cm | 108 cm |
| 0 °C | 331,3 m/s | 60,4 µs/cm | 104 cm |
| 20 °C | 343,4 m/s | 58,2 µs/cm | 100 cm |
| 60 °C | 367,7 m/s | 54,4 µs/cm | 94 cm |

Mover el cursor de temperatura durante la simulación hace que el obstáculo parezca **más cerca o más lejos** aunque no se haya movido: ese es el error que hay que compensar. Fórmula usada: `c = 331.3 + 0.606 × T` (m/s), y luego `duración = 2 × distancia / c`.

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-hc-sr04) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
