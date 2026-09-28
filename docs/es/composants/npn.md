# Transistor NPN (genérico)

![Transistor NPN genérico](../../img/composants/npn.webp)

Prototipo de transistor bipolar **NPN**: encapsulado, inscripción, ganancia y patillaje se ajustan todos en las propiedades. Úselo para cualquier modelo que aún no tenga ficha propia (BC547, 2N3904, S8050…).

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
| `text` | Inscripción del encapsulado (una línea por línea escrita) | NPN |
| `vcemax` | Vce máx. (V) | 40 |
| `icmax` | Ic máx. (A) | 0.6 |

Una patilla solo lleva **un** electrodo: asignar el emisor a la patilla ya ocupada por el colector **intercambia** los dos.

## Simulación

- Conduce cuando su **base está a nivel alto y su emisor a nivel bajo**.
- La corriente que deja pasar se limita a **Ganancia × Ib**: busque la saturación, si no el circuito aguas abajo no funciona.
- El patillaje real depende del modelo: un BC547 visto de frente es C-B-E (1-2-3), un 2N2222 en TO-92 es E-B-C. Para eso sirven exactamente las propiedades `e`, `b`, `c`.

## Uso

- Escriba la referencia en el encapsulado con `text`: una línea por línea escrita («BC» y luego «547» imprime dos líneas en el componente).
- Para importar su propio dibujo, use el **creador de componentes** (modelo de simulación «Transistor bipolar»).

---

*Componente propio de Kablix — dibujo de Frank Sauret.*
