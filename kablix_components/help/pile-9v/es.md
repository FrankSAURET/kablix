# Pila de 9 V

![Pila de 9 V](pile-9v.webp)

La pila rectangular de presión (6LR61). Nueva, da **9,5 V**; gastada, solo quedan **6,0 V**. Capacidad: **500 mAh**.

Componente de biblioteca: se instala desde el gestor de componentes, no está en la paleta original.

## Pines

| Pin | Función |
|--------|------|
| **+** | Polo positivo, a conectar a la entrada de alimentación de la placa |
| **−** | Polo negativo, a conectar a una masa **GND** de la placa |

## Dónde conectarla

| Placa | Entrada | Resultado |
|-------|--------|----------|
| Uno, Nano, Mega | **VIN** (6,2 a 20 V) | Arranca, se detiene cuando la tensión baja de **6,2 V** |
| Uno, Nano, Mega | **5V** (4,5 a 5,5 V) | Rechazado: 9,5 V es demasiado |
| Pico | **VSYS** o **VBUS** (1,8 a 5,5 V) | **La placa se quema**: estas entradas no tienen regulador que absorba 9,5 V |

Una pila de 9 V tiene poca reserva: una Uno que consume 46 mA la vacía en unas diez horas.

## La propiedad «capacidad»

El inspector muestra la capacidad en **mAh** (por defecto **500**). Bájela para ver el final de la historia sin esperar horas.

## Simulación

La pila se vacía al ritmo de lo que alimenta, la placa incluida. Su tensión baja en línea recta, de 9,5 V llena a 6,0 V vacía. El trazador muestra tres curvas: la **carga** (%), la **tensión** (V) y la **autonomía** restante (h).

La simulación se detiene con un mensaje cuando la placa no puede arrancar, cuando la tensión sale del rango de la entrada, o cuando la pila está vacía.

---

*Dibujo y ficha: Frank Sauret.*
