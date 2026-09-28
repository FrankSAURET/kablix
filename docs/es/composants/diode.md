# Diodo

![Diodo](../../img/composants/diode.webp)

Diodo rectificador. La corriente solo circula del ánodo **A** al cátodo **K**, perdiendo por el camino la tensión umbral.

## Pines

| Pin | Función |
|--------|------|
| **A** | Ánodo (+) — en el lado opuesto a la banda del dibujo |
| **K** | Cátodo (−) — marcado por la banda |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `vf` | Tensión umbral (V) | 0.6 |
| `angle` | Orientación (0/90/180/270°) | 0 |

## Uso

- Polarizado: bloquea en el sentido K → A. Un LED conectado detrás de un diodo invertido no se enciende nunca — es la prueba más sencilla que existe.
- En sentido directo, la tensión aguas abajo baja `vf` (0,6 V para un diodo de silicio, 0,3 V para un Schottky).
- Sirve para proteger una entrada contra la inversión de polaridad, o como diodo de rueda libre en bornes de una bobina (relé, motor) para recortar su pico de tensión.

---

*Componente propio de Kablix — dibujo de Frank Sauret.*
