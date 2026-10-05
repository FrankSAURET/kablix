# Resistencia

![Resistencia](../../img/composants/resistor.webp)

Resistencia fija. Limita la corriente (LED) o forma un divisor / pull-up / pull-down.

## Pines

| Pin | Función |
|--------|------|
| **1** | Borne 1 |
| **2** | Borne 2 (no polarizado) |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `value` | Valor en ohmios | 220 |
| `orientation` | Montaje: `h` horizontal (tumbada) o `v` vertical (de pie) | `h` |
| `angle` | Orientación (0/90/180/270°) | 0 |

## Se calienta y luego se quema

La simulación calcula la potencia que cada resistencia **disipa realmente** (`P = R × I²`, promediada sobre el ciclo de trabajo en PWM). Cuando supera la **mitad** de lo que admite el encapsulado (propiedad `power`), el cuerpo se pone **rojo** y adquiere un resplandor, cada vez más intenso hasta el límite. Es un indicador «potencia disipada / admisible», no un modelo térmico detallado: una resistencia de ¼ W que disipa 0,2 W ya está bastante roja, una de 10 W en el mismo circuito sigue fría. Más allá del límite, explota. Se enfría al detener la simulación.

## Uso

- No polarizada: los dos bornes son equivalentes.
- LED: 220 Ω–1 kΩ. Pull-up/pull-down: 10 kΩ típica.
- Montaje vertical: el cuerpo queda de pie con una patilla doblada por encima, de modo que los dos bornes salen uno al lado del otro (20 px de separación en lugar de 60). Práctico para meter una resistencia en un hueco estrecho de la protoboard. De pie, la resistencia se ve en ángulo: sus bandas se dibujan como elipses, la banda dorada (tolerancia) abajo y la primera banda de valor arriba.
- De pie, ocupa **30 × 30 px** en lugar de 30 × 60: el dibujo se reduce a la mitad en altura, como hace la perspectiva cuando se mira el componente desde más arriba — las bandas se aplastan, el diámetro del cuerpo no cambia. Es de verdad la misma resistencia vista de otra forma, y el espacio ganado es justo el que buscaba al ponerla de pie.

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-resistor) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
