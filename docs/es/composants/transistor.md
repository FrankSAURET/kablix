# Transistor

![Transistor](../../img/composants/transistor.webp)

Transistor en encapsulado TO-92 o TO-220. En Kablix actúa como **interruptor controlado**: una pequeña corriente de base deja pasar una corriente de colector mucho mayor, en la proporción que da la **ganancia** del modelo. Un MOSFET, en cambio, se controla por **tensión**: su puerta está aislada y no consume nada.

La biblioteca tiene un solo «Transistor»: el **modelo se elige en las propiedades**, en una lista que se reduce a medida que se fijan criterios.

## Elegir un modelo

Al colocar el componente, el inspector muestra el **selector**:

| Criterio | Efecto |
|-----------|--------|
| **Tipo** | NPN, PNP, Darlington NPN, Darlington PNP, MOSFET de canal N |
| **Encapsulado** | TO-92 o TO-220 |
| **Ic máx. de al menos** (**Id máx.** en un MOSFET) | solo conserva los modelos que soportan esa corriente |
| **Vce máx. de al menos** (**Vds máx.** en un MOSFET) | solo conserva los modelos que soportan esa tensión |
| **Ganancia de al menos** | solo conserva los modelos con al menos esa ganancia — bipolar |
| **Rds(on) de como máximo** | solo conserva los modelos por debajo de esa resistencia — MOSFET |

Estos dos últimos nunca coinciden: un MOSFET no tiene ganancia y un bipolar no tiene Rds(on). El selector solo muestra el que corresponde a la familia elegida.

Debajo, la lista de **modelos que coinciden**: un clic fija la referencia y el inspector vuelve a su vista normal. El botón **Cambiar de transistor…** vuelve a abrir el selector en cualquier momento. Los **modelos añadidos más recientemente** aparecen en **azul**.

| Familia | Modelos |
|--------|--------|
| NPN | PN2222A, 2N3904, 2N4401, 2N5551, BC337, S8050, BC547, BC548, BC639, MPSA42, BD911 |
| PNP | 2N2907A, 2N3906, 2N4403, 2N5401, BC327, S8550, BC557, BC558, BC640, MPSA92, BD912 |
| Darlington NPN | BC517 |
| Darlington PNP | BC516 |
| MOSFET de canal N | BS170, IRF530 |

BD911, BD912 e IRF530 vienen en **TO-220**: un encapsulado de potencia, hasta 15 A.

La última entrada de la lista es siempre el **modelo personalizado** de la familia elegida («NPN personalizado», «MOSFET de canal N personalizado»…): los criterios ya fijados vienen rellenados, y **todo sigue siendo editable** después — ganancia o Rds(on), tensión y corriente máximas, inscripción del encapsulado, asignación de los electrodos.

## Pines

Un componente bipolar (NPN, PNP, Darlington) lleva E, B y C:

| Pin | Función |
|-----|------|
| **E** | Emisor — a masa en el montaje NPN clásico |
| **B** | Base — mando, SIEMPRE detrás de una resistencia |
| **C** | Colector — la carga que conmutar (relé, motor, LED) |

Un MOSFET lleva G, D y S:

| Pin | Función |
|-----|------|
| **G** | Puerta — mando por tensión, aislada: no entra corriente |
| **D** | Drenador — la carga que conmutar |
| **S** | Fuente — a masa en un componente de canal N |

Los nombres de los pines **nunca** cambian dentro de una familia: cambiar de referencia no deja por tanto ningún cable huérfano. Lo que cambia es la **patilla física** que lleva cada electrodo — la familia BC5xx está cableada C-B-E donde los 2Nxxxx son E-B-C, y un BD911 es B-C-E, visto desde la cara plana. El inspector muestra ese patillaje bajo las características, y cada cable sigue a su electrodo.

## Propiedades

| Propiedad | Función | Por defecto |
|----------|------|---------|
| `ref` | Modelo elegido | *(vacío: selector abierto)* |
| `pkg` | Encapsulado — TO-92 o TO-220 | to92 |
| `gain` | Ganancia de corriente (β) — bipolar personalizado | 100 |
| `rdson` | Rds(on) (Ω) — MOSFET personalizado | 0.5 |
| `vcemax` | Vce máx. (Vds máx. en un MOSFET), en V — modelo personalizado | 40 |
| `icmax` | Ic máx. (Id máx. en un MOSFET), en A — modelo personalizado | 0.6 |
| `text` | Inscripción del encapsulado — modelo personalizado | NPN |
| `e` / `b` / `c` | Patilla que lleva cada electrodo — bipolar personalizado | 1 / 2 / 3 |
| `g` / `d` / `s` | Patilla que lleva cada electrodo — MOSFET personalizado | 1 / 2 / 3 |
| `angle` | Orientación (0/90/180/270°) | 0 |

En una referencia comercial, estos valores vienen de la hoja de datos del fabricante y no se pueden editar: use el **modelo personalizado** para fijarlos usted mismo.

## Simulación

- Un NPN conduce cuando su **base está a nivel alto y su emisor a nivel bajo**; un PNP, cuando la base está baja y el emisor alto. Un MOSFET de canal N conduce como un NPN: puerta alta, fuente baja.
- La corriente que deja pasar se limita a **Ganancia × Ib**: ese es todo el modelo. Busque por tanto la **saturación** — si la carga aguas abajo pide más, no funciona (el ventilador no arranca, el relé no conmuta).
- Vbe = 0,7 V, Vce(sat) = 0,2 V. Una base conectada **sin resistencia** satura seguro… y quemaría un transistor real: ponga una resistencia de base.
- **Darlington**: dos uniones en serie, de ahí **Vbe = 1,4 V** y **Vce(sat) = 0,9 V**. Su enorme ganancia (30 000) hace que baste una corriente de base minúscula — esa es toda la gracia.
- **MOSFET**: con una puerta aislada **no hay corriente de base ni ganancia**. La tensión sola abre el canal, que deja pasar entonces hasta su **Id máx.** Una resistencia de puerta no es necesaria para que funcione (en un montaje real, suaviza el flanco de conmutación).

## Uso

- Dimensionado típico: para mandar una bobina de relé de 40 mA con una ganancia de 35, hace falta Ib ≥ 40 / 35 ≈ 1,2 mA. A 5 V, una resistencia de base de 1 kΩ da (5 − 0,7) / 1000 ≈ 4,3 mA: bien saturado.
- Resistencia de base demasiado grande (100 kΩ) → Ib = 43 µA → Ic máx. ≈ 1,5 mA: la carga no arranca nunca. Es el error clásico que hay que vigilar en simulación.
- Con un relé, el **diodo de rueda libre es obligatorio** (cátodo hacia el +): sin él, el pico al cortar destruiría el transistor.

---

*Componente propio de Kablix — dibujo de Frank Sauret.*
