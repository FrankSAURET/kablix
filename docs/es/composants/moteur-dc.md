# Motor de corriente continua

![Motor de corriente continua](../../img/composants/moteur-dc.webp)

Pequeño motor de corriente continua con su piñón de salida. Gira más deprisa cuanto mayor es la tensión aplicada; también se puede controlar por **PWM**. A diferencia del ventilador, **no está polarizado**: intercambiar sus dos hilos simplemente invierte el sentido de giro.

## Pines

| Pin | Función |
|--------|------|
| **1** | Primer borne |
| **2** | Segundo borne |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `voltage` | Tensión nominal (V) | 5 |
| `current` | Corriente en vacío (A) | 0.2 |
| `angle` | Orientación (0/90/180/270°) | 0 |

## Simulación

- La velocidad sigue la **tensión** realmente aplicada: `voltage` = velocidad máxima, la mitad = media velocidad.
- Física **estricta**: el motor se ve como su resistencia en vacío (`voltage` / `current`, es decir 25 Ω para un motor de 5 V / 0,2 A). Si pide más corriente de la que la fuente puede dar, **no arranca** — mensaje *«La alimentación no puede suministrar la corriente del motor»*.
- Por debajo del **30 % de su tensión nominal** se queda quieto: un motor real zumba sin girar.
- Por encima de **1,5 veces su tensión nominal** se **quema**: explosión en el esquema y mensaje *«Sobretensión: el motor se ha quemado»*. Detener y volver a lanzar la simulación lo devuelve como nuevo.
- **Un pin del microcontrolador no basta**: da 40 mA como mucho, frente a los 200 mA necesarios. Use una alimentación externa conmutada por un transistor o un MOSFET.
- **El diodo de rueda libre es obligatorio** en cuanto el motor se conmuta con un transistor, **cátodo hacia el +**. Sin él, es el **transistor** el que explota (mensaje *«Se requiere un diodo de rueda libre»*); montado al revés, mensaje *«Diodo invertido»*. Un MOSFET cuyo esquema interno ya lleva su **diodo intrínseco** (BS170, IRF530) no lo necesita.
- Cada mensaje **nombra al culpable** y **dibuja un marco rojo** a su alrededor en el esquema, con una etiqueta amarilla sobre rojo al lado que explica el problema. El marco desaparece en cuanto se corrige el fallo, y al detener la simulación.

## Uso

- Montaje típico: pin del microcontrolador → resistencia de 1 kΩ → base de un PN2222A; emisor a masa; colector en el borne **2** del motor; borne **1** al + de la alimentación; diodo entre el borne 1 (cátodo) y el borne 2 (ánodo).
- Control PWM: `analogWrite()` (Arduino) o `PWM` (MicroPython) en el pin de mando; la velocidad sigue el ciclo de trabajo.
- **Leer la velocidad en pantalla**: a 6000 rpm los dientes del piñón pasan demasiado deprisa para el ojo — solo se ve un parpadeo, y cambiar la tensión no cambia nada visible. Por eso el piñón gira **a cámara lenta**: de 1 a 3,5 dientes por segundo según el régimen — un diente de engranaje es mucho más fino y está mucho más cerca de su vecino que un aspa de ventilador, así que necesita la mitad de ritmo que el ventilador. No es la velocidad real, lo que importa es su **cambio** — subir el ciclo de trabajo se ve de un vistazo. El **desenfoque del piñón** refuerza la mitad superior del rango.

---

*Componente propio de Kablix — dibujo de Frank Sauret.*
