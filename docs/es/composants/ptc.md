# Termistor PTC

![Termistor PTC](../../img/composants/ptc.webp)

Termistor de coeficiente de temperatura **positivo**: su resistencia **sube** con la temperatura. Se usa como sensor lineal (sondas tipo KTY) o como protección rearmable contra sobrecorrientes.

## Pines

| Pin | Función |
|--------|------|
| **1** | Borne 1 |
| **2** | Borne 2 (no polarizado) |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `r25` | Resistencia a 25 °C (Ω) | 2000 |
| `tc` | Coeficiente de temperatura (%/°C) | 0.79 |
| `tmin` | Temperatura mínima del cursor (°C) | -55 |
| `tmax` | Temperatura máxima del cursor (°C) | 125 |

## En simulación

Durante la simulación aparece un **cursor de temperatura** sobre el componente, limitado por `tmin` y `tmax`. La resistencia sigue una ley lineal:

```
R = r25 x ( 1 + (tc/100) x (T - 25) )
```

Con los valores por defecto: 2 kΩ a 25 °C, ~1,6 kΩ a 0 °C, ~2,4 kΩ a 50 °C.

## Uso

- Mismo cableado que el [NTC](ntc.md): divisor de tensión con una resistencia fija cercana a `r25`, punto medio a una entrada analógica.
- A diferencia del NTC, la tensión leída **aumenta** con la temperatura cuando el PTC está en la parte alta del divisor.
- Componente no polarizado: las dos patillas son equivalentes.

---

*Componente de Kablix — modelo lineal `R = r25 x (1 + tc/100 x (T - 25))`.*
