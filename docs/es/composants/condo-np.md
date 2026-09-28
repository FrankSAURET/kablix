# Condensador no polarizado

![Condensador no polarizado](../../img/composants/condo-np.webp)

Condensador de película plástica, sin polaridad. En serie con una resistencia forma un circuito RC: la tensión en sus bornes sube y baja de forma exponencial, y alcanza la carga completa (o la descarga completa) al cabo de 5·R·C.

## Pines

| Pin | Función |
|--------|------|
| **1** | Borne 1 |
| **2** | Borne 2 (no polarizado: ambos son equivalentes) |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `ctype` | Tipo: no polarizado / polarizado / electrolítico | no polarizado |
| `value` | Valor nominal en faradios (se aceptan los sufijos `m`, `µ`, `n`, `p`) | 100n |
| `vmax` | Tensión máxima admisible (V) | 400 |
| `angle` | Orientación (0/90/180/270°) | 0 |

## Uso

- El valor que escriba se **imprime en el cuerpo** del componente (`10µ`, `100n`…).
- Desacoplo de la alimentación: 100 nF lo más cerca posible del pin VCC del chip.
- Medida RC: cargue a través de una resistencia desde un pin puesto a `HIGH` y lea la subida en una entrada analógica. τ = R·C, y 5τ = carga completa.
- También funciona en una entrada con el **pull-up interno** (Arduino o Pico): el pull-up (65 kΩ en Kablix; la hoja de datos del RP2040 da de 50 a 80 kΩ) hace de resistencia de carga, sin resistencia externa. En el Pico, el **pull-down** interno descarga el condensador del mismo modo.
- La biblioteca muestra un solo **Condensador**: el tipo (film, tántalo, electrolítico) se elige en la propiedad `ctype`.
- Cambiar `ctype` no renombra los pines: los cables ya trazados se quedan donde están.
- El **trazador** muestra la exponencial **sin una sola línea de código**: cada tensión aplicada a una entrada analógica la traza una sonda interna, con el nombre del canal del convertidor y del pin (`ADC0 (A0)`, `ADC0 (GP26)`…). Ponga varias ramas RC en paralelo sobre el mismo pin de mando y sus curvas se comparan en un mismo gráfico.

---

*Componente propio de Kablix — dibujo de Frank Sauret.*
