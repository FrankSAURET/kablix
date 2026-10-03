# Batería LiPo 1S

![Batería LiPo 1S](batterie-lipo.webp)

Una sola celda de polímero de litio, la de los drones y los relojes inteligentes. Cargada, da **4,2 V**; vacía, solo quedan **3,0 V**. Capacidad: **1000 mAh**.

Componente de biblioteca: se instala desde el gestor de componentes, no está en la paleta original.

## Pines

| Pin | Función |
|--------|------|
| **+** | Polo positivo, a conectar a la entrada de alimentación de la placa |
| **−** | Polo negativo, a conectar a una masa **GND** de la placa |

## Dónde conectarla

| Placa | Entrada | Resultado |
|-------|--------|----------|
| Pico | **VSYS** o **VBUS** (1,8 a 5,5 V) | Arranca y funciona hasta que la batería se agota |
| Uno, Nano, Mega | **VIN** (6,2 a 20 V) | Rechazado: 4,2 V es muy poco |
| Uno, Nano, Mega | **5V** (4,5 a 5,5 V) | Rechazado: 4,2 V es muy poco |

En un montaje real, una LiPo nunca se descarga por debajo de 3,0 V: se estropearía. Las placas de protección cortan antes.

## La propiedad «capacidad»

El inspector muestra la capacidad en **mAh** (por defecto **1000**). Bájela para ver el final de la historia sin esperar horas.

## Simulación

La batería se vacía al ritmo de lo que alimenta, la placa incluida. Su tensión baja en línea recta, de 4,2 V llena a 3,0 V vacía. El trazador muestra tres curvas: la **carga** (%), la **tensión** (V) y la **autonomía** restante (h).

La simulación se detiene con un mensaje cuando la placa no puede arrancar, cuando la tensión sale del rango de la entrada, o cuando la batería está vacía.

---

*Dibujo y ficha: Frank Sauret.*
