# Pila de botón CR2032

![Pila de botón CR2032](pile-cr2032.webp)

La pila plana de litio de los relojes y las placas base. Nueva, da **3,0 V**; gastada, solo quedan **2,0 V**. Capacidad: **220 mAh**.

Componente de biblioteca: se instala desde el gestor de componentes, no está en la paleta original.

## Pines

| Pin | Función |
|--------|------|
| **+** | Polo positivo, a conectar a la entrada de alimentación de la placa |
| **−** | Polo negativo, a conectar a una masa **GND** de la placa |

## Dónde conectarla

| Placa | Entrada | Resultado |
|-------|--------|----------|
| Pico | **VSYS** o **VBUS** (1,8 a 5,5 V) | Arranca y funciona hasta que la pila se agota |
| Uno, Nano, Mega | **VIN** (6,2 a 20 V) | Rechazado: 3 V es muy poco |
| Uno, Nano, Mega | **5V** (4,5 a 5,5 V) | Rechazado: 3 V es muy poco |

Una CR2032 conviene a un montaje que duerme la mayor parte del tiempo: una Pico en reposo profundo consume unos 1,3 mA, despierta 21 mA.

## La propiedad «capacidad»

El inspector muestra la capacidad en **mAh** (por defecto **220**). Bájela para ver el final de la historia sin esperar horas.

## Simulación

La pila se vacía al ritmo de lo que alimenta, la placa incluida. Su tensión baja en línea recta, de 3,0 V llena a 2,0 V vacía. El trazador muestra tres curvas: la **carga** (%), la **tensión** (V) y la **autonomía** restante (h).

La simulación se detiene con un mensaje cuando la placa no puede arrancar, cuando la tensión sale del rango de la entrada, o cuando la pila está vacía.

---

*Dibujo y ficha: Frank Sauret.*
