# Grove Shield (Uno)

![Grove Shield (Uno)](grove-uno.webp)

Una placa que se coloca **encima del Arduino Uno**. No calcula nada: sustituye a los cables. En lugar de clavar los hilos uno a uno en las filas del Uno, se enchufa un cable Grove de cuatro hilos en un conector blanco y queda cableado. No hay forma de equivocarse de sentido: la clavija solo entra en un sentido.

Componente de biblioteca: se instala con el gestor de componentes, no está en la paleta de origen.

## Colocarla sobre el Uno

Tome la placa y acérquela al Uno: cuando sus pines quedan frente a las filas, se enganchan y Kablix tiende los 31 cables de una vez. La placa pasa entonces DELANTE del Uno, como en la realidad, y al mover el Uno se la lleva consigo.

## El interruptor 3,3 V / 5 V

Abajo a la izquierda de la placa, un pequeño interruptor elige la tensión enviada al hilo rojo de **todos** los conectores Grove. Haga clic en él: el botón se desliza una posición y el ajuste se guarda con el esquema.

- **5 V** (posición inicial): lo que espera la mayoría de los módulos Grove.
- **3,3 V**: para los módulos que no soportan 5 V.

Atención, el interruptor SOLO cambia la alimentación. Los hilos de señal siguen a 5 V, ya que vienen del Uno.

## Los conectores y los pines del Uno

Cada conector lleva dos hilos de señal. El nombre del conector es el de su primera señal; la segunda es el pin justo superior. Dos conectores vecinos comparten, por tanto, siempre un pin: **D4** usa 4 y 5, **D5** usa 5 y 6 — enchufar dos módulos uno al lado del otro hace que el pin 5 trabaje para los dos.

| Conector | Hilo 1 | Hilo 2 | Pines del Uno |
|-------|-------|-------|-----------------|
| **D2** | D2 | D3 | 2 y 3 |
| **D3** | D3 | D4 | 3 y 4 |
| **D4** | D4 | D5 | 4 y 5 |
| **D5** | D5 | D6 | 5 y 6 |
| **D6** | D6 | D7 | 6 y 7 |
| **D7** | D7 | D8 | 7 y 8 |
| **D8** | D8 | D9 | 8 y 9 |
| **A0** | A0 | A1 | A0 y A1 |
| **A1** | A1 | A2 | A1 y A2 |
| **A2** | A2 | A3 | A2 y A3 |
| **A3** | A3 | A4 | A3 y A4 |
| **UART** | TX | RX | 1 y 0 |
| **I2C0** a **I2C3** | SDA | SCL | A4 y A5 |

Los cuatro conectores **I2C** están cableados en paralelo: es el mismo hilo para los cuatro. Es normal — el bus I²C admite varios módulos en los mismos dos hilos, siempre que cada uno tenga una dirección distinta.

Dos trampas que conviene conocer:

- el conector **A3** y los conectores **I2C** comparten A4 (SDA). Un módulo I²C y un sensor analógico en A3 no pueden funcionar juntos;
- el conector **UART** está cableado a los pines 0 y 1, los que usa también el cable USB. Un módulo que hable por ese conector embrolla el monitor serie.

Pase el ratón sobre un pad: Kablix escribe en él el pin real del Uno. `I2C0.SDA.A4` significa «el hilo SDA del conector I2C0 llega a A4» — es **A4** lo que hay que escribir en el programa.

## Lo que la placa no hace

El botón **RESET** y el pequeño LED de la placa no se simulan: son casos especiales y Kablix los deja de lado. Todo lo demás — conectores, raíles de alimentación, interruptor — funciona.
