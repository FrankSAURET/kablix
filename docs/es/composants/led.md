# LED

![LED](../../img/composants/led.webp)

Diodo emisor de luz de 5 mm. Se enciende cuando el ánodo está en + y el cátodo en masa, a través de una resistencia limitadora.

## Pines

| Pin | Función |
|--------|------|
| **A** | Ánodo (+) |
| **C** | Cátodo (–), a masa |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `color` | Color de la cápsula | rojo |
| `lightColor` | Color de la luz | según el color |

## Uso

- **Siempre** una resistencia en serie (220 Ω–1 kΩ).
- Ánodo a + (pin de salida), cátodo a masa.
- Luminosidad variable: ataque el ánodo con **PWM** (`analogWrite`).

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-led) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
