# Transistor PNP (genérico)

![Transistor PNP genérico](../../img/composants/pnp.webp)

Prototipo de transistor bipolar **PNP**: todo está invertido respecto al NPN. El emisor va al **+** de la alimentación, la carga está del lado del colector, y se controla **llevando la base a nivel bajo**.

## Pines

Las patillas se llaman **1**, **2** y **3**, en el orden del dibujo — nunca E/B/C. Cambiar la asignación de los electrodos no renombra ningún pin, y **ningún cable queda nunca huérfano**.

| Pin | Función |
|--------|------|
| **1** | Primera patilla (emisor por defecto) |
| **2** | Segunda patilla (base por defecto) |
| **3** | Tercera patilla (colector por defecto) |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `pkg` | Encapsulado del componente | TO-92 |
| `e` | Patilla que lleva el emisor (1, 2 o 3) | 1 |
| `b` | Patilla que lleva la base (1, 2 o 3) | 2 |
| `c` | Patilla que lleva el colector (1, 2 o 3) | 3 |
| `gain` | Ganancia de corriente β (1 decimal) | 100 |
| `text` | Inscripción del encapsulado (una línea por línea escrita) | PNP |
| `vcemax` | Vce máx. (V) | 40 |
| `icmax` | Ic máx. (A) | 0.6 |

Una patilla solo lleva **un** electrodo: asignar el emisor a la patilla ya ocupada por el colector **intercambia** los dos.

## Simulación

- Conduce cuando su **base está a nivel bajo y su emisor a nivel alto** (emisor al +).
- La corriente que deja pasar se limita a **Ganancia × Ib**, igual que el NPN.
- Montado como interruptor del lado alto: alimenta una carga cuyo otro extremo está a masa.

## Uso

- Cuidado con el mando desde una placa de 5 V: una salida a 0 V sí lleva la base a nivel bajo, pero una salida «alta» de 3,3 V no apaga un PNP cuyo emisor está a 5 V. Para empezar, el NPN es más sencillo.
- Para importar su propio dibujo, use el **creador de componentes** (modelo de simulación «Transistor bipolar»).

---

*Componente propio de Kablix — dibujo de Frank Sauret.*
