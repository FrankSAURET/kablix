# Lector RFID Grove 125 kHz

![Lector RFID Grove 125 kHz](grove-rfid.webp)

Una placa que lee tarjetas sin tocarlas. El gran bucle de hilo, abajo, crea un campo invisible. Cuando una tarjeta entra en él, toma la energía justa para despertarse — **no tiene pila** — y recita su número. La placa escucha y repite ese número al microcontrolador. Es el lector de las tarjetas de acceso a edificios y de las tarjetas de comedor.

Componente de biblioteca: se instala con el gestor de componentes, no está en la paleta de origen.

## Pines

Es un conector Grove de cuatro hilos:

| Pin | Función |
|--------|------|
| **GND** (negro) | Masa |
| **VCC** (rojo) | Alimentación, 3,3 V o 5 V |
| **Rx** | Entrada del módulo — usada como **DATA1** en modo Wiegand |
| **Tx** | Salida del módulo — el número, o **DATA0** en modo Wiegand |

El módulo **habla**, no espera a que le pregunten. Sus dos hilos de datos van por tanto a **entradas** de la placa.

## El puente: dos lenguajes

El pequeño puente, arriba a la izquierda, elige cómo cuenta la placa el número. Haga clic en él para moverlo.

**Izquierda — UART.** El número sale en claro por **Tx**, como texto, a **9600 baudios**, seguido de un salto de línea. Basta un solo hilo. En Arduino, lo lee un enlace serie por software:

```c
#include <SoftwareSerial.h>
SoftwareSerial rfid(2, 3);   // 2 = Rx del Arduino, conectado al Tx del módulo

void setup() { Serial.begin(9600); rfid.begin(9600); }
void loop() {
  if (rfid.available()) Serial.write(rfid.read());
}
```

**Derecha — Wiegand.** El número sale en forma de **impulsos** por dos hilos, **Tx** = DATA0 y **Rx** = DATA1. Los dos hilos están a nivel alto en reposo; un **0** es una breve bajada en DATA0 y un **1** una breve bajada en DATA1 — 50 µs cada una, 2 ms entre dos. Hay **26 impulsos**, del bit de mayor peso al de menor peso. Se cuentan con interrupciones:

```c
volatile unsigned long word = 0;
volatile int count = 0;
void zero() { word = (word << 1);     count++; }
void one()  { word = (word << 1) | 1; count++; }

void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP); pinMode(3, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), zero, FALLING);
  attachInterrupt(digitalPinToInterrupt(3), one,  FALLING);
}
void loop() {
  if (count >= 26) { Serial.println(word, HEX); count = 0; word = 0; }
}
```

Wiegand funciona en todas partes. UART, en cambio, necesita un enlace serie en la placa: en un Arduino sirve un enlace **por software**, y es el que lee el hilo. **En un Pico, elija Wiegand**: el enlace serie hardware del chip no escucha los pines en simulación, y el modo UART se quedaría mudo.

## Simulación

La **flecha** verde y azul, bajo el bucle, mueve la tarjeta. Haga clic en ella: la tarjeta entra en el bucle y la flecha se da la vuelta. Otro clic: vuelve a salir.

Mientras la tarjeta está **en el bucle**, el módulo repite su número **una vez por segundo**, igual que el real. El número enviado aparece en la pequeña ventana **CodeRFID** del dibujo. Se elige al azar entre tres tarjetas, como si llevara tres en el bolsillo:

| Puente | Tarjetas |
|----------|--------|
| UART | `0F0034AB12` · `0F00A17C45` · `0F0059D3E8` |
| Wiegand | `1A34B12` · `0C71D9E` · `23F80A5` |

Cuando la tarjeta sale del bucle, la ventana se vacía y los hilos vuelven a callarse.

El puente se puede mover **durante** la simulación: el circuito se vuelve a leer solo, sin detener el programa.

## Atención

- El módulo real añade dos caracteres de encuadre y una suma de control alrededor del número. Aquí el número sale solo, seguido de un salto de línea: es más fácil de leer para aprender, pero un programa escrito para el módulo real buscará esos caracteres de más.
- Estas tarjetas son de **solo lectura** y su número se copia sin ninguna dificultad: sirven para abrir un cajón, no para guardar un secreto.
- Una tarjeta solo se lee a unos centímetros del bucle, y el metal justo detrás del bucle dificulta la lectura.
- En un Arduino, solo los pines **2** y **3** pueden despertar el programa mediante una interrupción: ahí es donde deben conectarse los dos hilos Wiegand.

---

*Dibujo y ficha: Frank Sauret. Referencia: [Grove - 125KHz RFID Reader](https://wiki.seeedstudio.com/Grove-125KHz_RFID_Reader/).*
