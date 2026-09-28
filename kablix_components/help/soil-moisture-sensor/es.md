# Sensor de humedad del suelo

![Sensor de humedad del suelo](soil-moisture-sensor.webp)

Dos puntas que se clavan en la tierra de una maceta. La tierra seca deja pasar mal la corriente y la tierra húmeda la deja pasar bien: el sensor mide ese paso y lo entrega por un solo hilo, en forma de tensión. Es el sensor del riego automático.

Componente de biblioteca: se instala con el gestor de componentes, no está en la paleta de origen.

## Pines

| Pin | Función |
|--------|------|
| **+** (rojo) | Alimentación, 5 V en un Arduino, 3,3 V en un Pico |
| **−** (negro) | Masa |
| **S** (señal) | Salida, a conectar a una **entrada analógica** (A0, GP26…) |

La salida no es de todo o nada: es una tensión que sube de forma gradual. Por eso debe ir a una entrada capaz de medir, no a un simple pin digital.

## Qué vale la salida

| Tierra | Paso de la corriente | Tensión en **S** |
|-------|--------------------|-------------------|
| Seca | malo | cerca de **0 V** |
| Húmeda | medio | a mitad |
| Empapada | bueno | cerca de la tensión de alimentación |

En el programa, `analogRead(A0)` devuelve **0** en seco y **1023** empapada en un Arduino; `ADC.read_u16()` devuelve de **0** a **65535** en un Pico. Basta un umbral para decidir regar:

```c
if (analogRead(A0) < 350) { /* demasiado seca: regar */ }
```

## Simulación

En simulación, el componente muestra un cursor **Humedad del suelo**, graduado de **0 a 100 %**. Deslícelo: la tensión del pin `S` lo sigue al instante, en línea recta — 0 % da 0 V y 100 % da la tensión de alimentación de la placa (5 V o 3,3 V). El programa lee el cambio en la siguiente vuelta.

El sensor real nunca baja del todo a cero ni sube del todo al máximo: cada ejemplar tiene su propio rango. En un montaje real, por tanto, se leen los dos valores extremos (puntas al aire, puntas en un vaso de agua) antes de elegir el umbral.

## Atención

- No deje las puntas **alimentadas permanentemente** en la tierra: la corriente que las atraviesa las desgasta (se oxidan). En un montaje real, el sensor solo se alimenta durante la lectura, desde un pin de salida.
- La tierra por sí sola no es una medida fiable del riego: dos tierras distintas no conducen igual con la misma humedad.

---

*Dibujo y ficha: Frank Sauret. Referencia: [DFRobot SEN0114](https://www.dfrobot.com/product-599.html).*
