# LED RGB

![LED RGB](../../img/composants/rgb-led.webp)

LED tricolor (rojo/verde/azul) de cátodo (o ánodo) común. Mezcle los tres canales para obtener cualquier color.

## Pines

| Pin | Función |
|--------|------|
| **R** | Rojo |
| **G** | Verde |
| **B** | Azul |
| **COM** | Común (cátodo o ánodo) |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `common` | Pin común (cátodo/ánodo) | cátodo |

## Uso

- Una resistencia por canal R/G/B.
- Cátodo común: COM a masa, canales a +. Ánodo común: al revés.
- PWM en R/G/B para dosificar cada color.

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-rgb-led) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
