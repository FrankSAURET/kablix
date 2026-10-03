# Portapilas de 4 pilas AA

![Portapilas de 4 pilas AA](pile-4aa.webp)

Cuatro pilas alcalinas AA en serie en un portapilas. Nuevas, dan **6,4 V**; gastadas, solo quedan **4,4 V**. Capacidad: **2500 mAh**.

Componente de biblioteca: se instala desde el gestor de componentes, no está en la paleta original.

## Pines

| Pin | Función |
|--------|------|
| **+** | Polo positivo, a conectar a la entrada de alimentación de la placa |
| **−** | Polo negativo, a conectar a una masa **GND** de la placa |

## Dónde conectarla

| Placa | Entrada | Resultado |
|-------|--------|----------|
| Uno, Nano, Mega | **VIN** (6,2 a 20 V) | Arranca, pero se detiene en cuanto la tensión baja de **6,2 V** |
| Uno, Nano, Mega | **5V** (4,5 a 5,5 V) | Rechazado: 6,4 V es demasiado |
| Pico | **VSYS** o **VBUS** (1,8 a 5,5 V) | **La placa se quema**: estas entradas no tienen regulador que absorba 6,4 V |

En VIN, el regulador de la placa necesita margen: cuatro pilas nuevas apenas llegan, y la placa se apaga mucho antes de que las pilas estén gastadas. En un montaje real pasa lo mismo — por eso se ven a menudo seis pilas AA en una Uno.

## La propiedad «capacidad»

El inspector muestra la capacidad en **mAh** (por defecto **2500**). Bájela para ver el final de la historia sin esperar horas.

## Simulación

La batería de pilas se vacía al ritmo de lo que alimenta, la placa incluida. Su tensión baja en línea recta, de 6,4 V llena a 4,4 V vacía. El trazador muestra tres curvas: la **carga** (%), la **tensión** (V) y la **autonomía** restante (h).

La simulación se detiene con un mensaje cuando la placa no puede arrancar, cuando la tensión sale del rango de la entrada, o cuando la batería de pilas está vacía.

---

*Dibujo y ficha: Frank Sauret.*
