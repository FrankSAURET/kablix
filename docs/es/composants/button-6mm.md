# Pulsador (6 mm)

![Pulsador (6 mm)](../../img/composants/button-6mm.webp)

Pequeño pulsador táctil de 6 mm, con el mismo comportamiento que el de 12 mm.

## Pines

| Pin | Función |
|--------|------|
| **1.l / 1.r** | Primer contacto |
| **2.l / 2.r** | Segundo contacto |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `color` | Color | rojo |
| `key` | Atajo de teclado | — |

## Uso

- Igual que el pulsador de 12 mm: `INPUT_PULLUP` + masa (pulsado = `LOW`), o el cableado inverso a **+5 V** con un pull-down de **10 kΩ** a masa (pulsado = `HIGH`).
- Se recomienda un antirrebote.

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-pushbutton-6mm) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
