# Condensador electrolítico

![Condensador electrolítico](../../img/composants/condo-p-2.webp)

Condensador electrolítico de aluminio, **polarizado**. El de gran capacidad de la familia: carga y descarga exponenciales, terminadas al cabo de 5·R·C.

## Pines

| Pin | Función |
|--------|------|
| **+** | Borne positivo (pin `2`) |
| **−** | Borne negativo (pin `1`), marcado por la franja clara del cuerpo |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `ctype` | Tipo: no polarizado / polarizado / electrolítico | electrolítico |
| `value` | Valor nominal en faradios (se aceptan los sufijos `m`, `µ`, `n`, `p`) | 100µ |
| `vmax` | Tensión máxima admisible (V) | 16 |
| `angle` | Orientación (0/90/180/270°) | 0 |

## Uso

- Coloque el **Condensador** de la biblioteca y ponga `ctype` en «electrolítico»: no tiene entrada propia en la paleta.
- Cuidado con la polaridad: la franja clara marca el borne **−**. Conectado al revés, un electrolítico real se hincha y luego revienta.
- Filtrado de la alimentación: de 100 µF a 1000 µF a la salida de un regulador.
- Constante de tiempo larga: con 10 kΩ, 100 µF da τ = 1 s, es decir, 5 s para una carga completa — muy visible en el trazador.

---

*Componente propio de Kablix — dibujo de Frank Sauret.*
