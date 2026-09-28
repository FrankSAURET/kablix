# Sensor de inclinación

![Sensor de inclinación](../../img/composants/tilt.webp)

Interruptor de bola: se cierra o se abre según la inclinación.

## Pines

| Pin | Función |
|--------|------|
| **VCC** | Alimentación (+) |
| **OUT** | Salida digital |
| **GND** | Masa |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `state` | Inclinado (0/1) | 0 |

## Uso

- OUT a una entrada digital (a menudo `INPUT_PULLUP`).
- Cambie el estado en el inspector.

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-tilt-switch) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
