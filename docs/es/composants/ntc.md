# Termistor NTC

![Termistor NTC](../../img/composants/ntc.webp)

Termistor de coeficiente de temperatura **negativo**: su resistencia **baja** cuando sube la temperatura. Componente desnudo de dos patillas, que se conecta como divisor de tensión. Variante de coeficiente positivo: el [PTC](ptc.md).

## Pines

| Pin | Función |
|--------|------|
| **1** | Borne 1 |
| **2** | Borne 2 (no polarizado) |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `r25` | Resistencia a 25 °C (Ω) | 10 000 |
| `beta` | Coeficiente B (K) | 3950 |
| `tmin` | Temperatura mínima del cursor (°C) | -55 |
| `tmax` | Temperatura máxima del cursor (°C) | 125 |

## En simulación

Durante la simulación aparece un **cursor de temperatura** sobre el componente, limitado por `tmin` y `tmax`. La resistencia sigue la ley B:

```
R = r25 x exp( beta x (1/(T+273.15) - 1/298.15) )
```

Con los valores por defecto: 10 kΩ a 25 °C, ~34 kΩ a 0 °C, ~3,6 kΩ a 50 °C.

## Uso

- Conecte el NTC como **divisor de tensión** con una resistencia fija del mismo orden que `r25` (10 kΩ para un NTC de 10 kΩ), con el punto medio a una entrada analógica.
- `beta` viene de la hoja de datos del termistor (3380, 3950, 4050…).
- Componente no polarizado: las dos patillas son equivalentes.

---

*Componente de Kablix — modelo B `R = r25 x exp(beta x (1/T - 1/T25))`.*
