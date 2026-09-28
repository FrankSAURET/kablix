# LDR (fotorresistencia)

![LDR (fotorresistencia)](../../img/composants/ldr.webp)

Fotorresistencia **desnuda**, de dos patillas: su resistencia baja cuando aumenta la luz. No confundir con el [módulo sensor de luz](photoresistor.md), que es una placa completa (VCC/GND, salidas analógica y digital).

## Pines

| Pin | Función |
|--------|------|
| **1** | Borne 1 |
| **2** | Borne 2 (no polarizado) |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `r1lx` | Resistencia a 1 lux (Ω) | 50 000 |
| `gamma` | Coeficiente de sensibilidad (γ) | 0.7 |
| `lux` | Iluminancia en reposo (lux) | 500 |

## En simulación

Durante la simulación aparece un **cursor de iluminancia** sobre el componente: ajusta la luz recibida, de la oscuridad a pleno sol. La resistencia sigue la característica real de una LDR:

```
R = r1lx x lux^(-gamma)
```

Con los valores por defecto: 50 kΩ a 1 lx, ~650 Ω a 500 lx (habitación bien iluminada). En la oscuridad, la resistencia se limita a 10 MΩ.

## Uso

- Conecte la LDR como **divisor de tensión** con una resistencia fija (10 kΩ típica), con el punto medio a una entrada analógica.
- La tensión que lee el ADC sigue el divisor real de su montaje: no hace falta un módulo ya hecho para obtener una lectura creíble.
- Componente no polarizado: las dos patillas son equivalentes.

---

*Componente de Kablix — modelo fotométrico `R = r1lx x lux^(-gamma)`.*
