# Condensador polarizado (tántalo)

![Condensador polarizado (tántalo)](../../img/composants/condo-p-1.webp)

Condensador de tántalo en gota, **polarizado**. El mismo comportamiento RC que el modelo no polarizado — carga y descarga exponenciales, terminadas al cabo de 5·R·C — pero no debe conectarse al revés.

## Pines

| Pin | Función |
|--------|------|
| **+** | Borne positivo (pin `2`) |
| **−** | Borne negativo (pin `1`), a masa |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `ctype` | Tipo: no polarizado / polarizado / electrolítico | polarizado |
| `value` | Valor nominal en faradios (se aceptan los sufijos `m`, `µ`, `n`, `p`) | 10µ |
| `vmax` | Tensión máxima admisible (V) | 16 |
| `angle` | Orientación (0/90/180/270°) | 0 |

## Uso

- Coloque el **Condensador** de la biblioteca y ponga `ctype` en «polarizado»: el tántalo no tiene entrada propia en la paleta.
- Cuidado con la polaridad: **+** al potencial más alto, **−** a masa.
- El valor que escriba se imprime en el cuerpo del componente.
- Depósito de energía junto a una carga que pide picos de corriente (servo, motor), junto a un condensador de desacoplo de 100 nF.
- El tántalo soporta mal las sobretensiones: deje un margen holgado en `vmax`.

---

*Componente propio de Kablix — dibujo de Frank Sauret.*
