# Relé OMRON G5V

![Relé OMRON G5V](../../img/composants/relais.webp)

Relé electromecánico SPDT (un contacto conmutado). Una bobina, alimentada a su tensión nominal, atrae una lámina y pasa el común del contacto **normalmente cerrado** al **normalmente abierto**. Separa por completo el lado de mando (la placa) del lado de potencia (lámpara, motor, red eléctrica…).

## Pines

| Pin | Función |
|--------|------|
| **B1** | Bobina, primer borne (sin polaridad) |
| **B2** | Bobina, segundo borne |
| **NF** | Contacto **normalmente cerrado** (posición de reposo) |
| **NO** | Contacto **normalmente abierto** (posición activada) |
| **Com** | Común de la lámina — sale por los dos lados de la carcasa, es el **mismo** pin |

Los dos pads «Com» son eléctricamente idénticos: conectar uno u otro es exactamente lo mismo, elija el que mejor se enrute.

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `voltage` | Tensión de bobina: 3, 5, 6, 9, 12 o 24 V | 5 |
| `angle` | Orientación (0/90/180/270°) | 0 |

La tensión elegida se **imprime en la carcasa** («5VDC»), como en el componente real.

## Simulación

- La bobina conmuta cuando la tensión que le llega es al menos el **80 % de su tensión nominal** (la «tensión de funcionamiento») y la fuente puede dar su corriente (unos 40 mA para un G5V de 5 V).
- Tensión insuficiente → el relé **no funciona**, el común se queda en NF.
- Un **diodo de rueda libre es obligatorio** entre B1 y B2, **cátodo hacia el + de la alimentación**. Sin él aparece *«Se requiere un diodo de rueda libre»*; conectado al revés, *«Diodo invertido»* — en ambos casos el relé no conmuta.
- Cada mensaje **nombra al culpable** («(Mod2)») **y dibuja un marco rojo a su alrededor** en el esquema, del mismo tamaño que el rectángulo de selección: se acabó buscar qué relé hay que rehacer. El marco desaparece en cuanto se corrige el fallo, y al detener la simulación.
- Junto al marco, una **etiqueta amarilla sobre rojo explica el problema** y lo que hay que corregir (por ejemplo: *«La bobina de un relé es una inductancia: al cortar la corriente devuelve una sobretensión que destruye el transistor de mando. El diodo de rueda libre la absorbe — no es opcional.»*). Solo se muestra mientras corre la simulación.
- Salida de la placa: un pin solo da 40 mA. Mandar la bobina directamente apenas funciona; el montaje correcto usa un **transistor** (PN2222A) entre la bobina y masa.

## Uso

- Montaje típico: pin del microcontrolador → resistencia de 1 kΩ → base del PN2222A; emisor a masa; colector a B2; B1 a +5 V; diodo entre B1 (cátodo) y B2 (ánodo).
- El contacto **NF** es el de los montajes de seguridad positiva: con todo apagado, el circuito ya está cerrado.

---

*Componente propio de Kablix — dibujo de Frank Sauret.*
