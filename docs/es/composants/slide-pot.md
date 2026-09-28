# Potenciómetro deslizante

![Potenciómetro deslizante](../../img/composants/slide-pot.webp)

Potenciómetro lineal con cursor deslizante. El mismo principio que el giratorio.

## Pines

| Pin | Función |
|--------|------|
| **VCC** | Alimentación (+) |
| **SIG** | Cursor → entrada analógica |
| **GND** | Masa |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `ohms` | Valor nominal: resistencia total entre VCC y GND (Ω) | 10 000 |
| `value` | Posición inicial (0–100 %) | 50 |

## Uso

- SIG a una entrada analógica, leída con `analogRead()`.
- Ajuste en simulación: **arrastre** el cursor.
- Mientras corre la simulación, una etiqueta encima del componente da la posición **y** las dos mitades de la pista — «Posición: 25 % (1,175 kΩ|3,525 kΩ)»: primero lo que leería un óhmetro entre el cursor y GND, luego el resto hasta el otro extremo. Los dos brazos del divisor de un vistazo; siempre suman el valor nominal.

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-slide-potentiometer) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
