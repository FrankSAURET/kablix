# Sensor de temperatura DS18B20

![Sensor de temperatura DS18B20](ds18b20-etanche.webp)

Un termómetro. No devuelve una tensión que haya que convertir: devuelve **un número**, ya en grados. Y lo hace por **un solo hilo**, lo que le permite algo que los demás sensores no pueden — compartir el mismo pin con otros.

Va alojado en un tubo de acero inoxidable estanco al final de un cable. Se puede poner **en el agua**, en la tierra, en un congelador, a la intemperie bajo la lluvia. Es la sonda de los acuarios, los calentadores de agua, las estaciones meteorológicas y los invernaderos.

Mide de **−55 a +125 °C**, con una precisión de **±0,5 °C** entre −10 y +85 °C.

Componente de biblioteca: se instala con el gestor de componentes, no está en la paleta integrada.

Existe en dos versiones, mismo chip y mismo programa: esta sonda estanca de acero inoxidable al final de un cable, y un [encapsulado **TO-92**](ds18b20.md) desnudo.

## Pines

| Pin               | Función                                          |
| ----------------- | ------------------------------------------------ |
| **GND** (negro)   | Masa                                             |
| **Data** (amarillo) | El hilo de datos, a conectar a un pin digital  |
| **VDD** (rojo)    | Alimentación, 3,3 V o 5 V                        |

## La resistencia de pull-up es obligatoria

Hace falta una **resistencia de 4,7 kΩ entre `Data` y `VDD`**. Sin ella no funciona nada — y es con diferencia la primera causa de «mi sensor devuelve −127».

## Lo que además conviene saber

**La resistencia de 4,7 kΩ entre `Data` y `VDD` sigue siendo obligatoria.** Muchas sondas vendidas «listas para conectar» ya la llevan, escondida en la funda termorretráctil junto a los hilos o en una pequeña placa suministrada con ellas. Si la suya tiene cuatro hilos, o un pequeño bloque con tres bornes, compruébelo antes de añadir una segunda.

**El tubo es estanco, los hilos no.** La parte de acero inoxidable va dentro del líquido; la de los extremos pelados, no. Una sonda sumergida hasta el final del cable acaba dejando entrar el agua por capilaridad.

**El cable puede ser largo** — varios metros funcionan sin problema. Más allá, o con un cable sin apantallar cerca de un motor, las lecturas se vuelven erráticas: entonces se baja la resistencia de pull-up hacia 2,2 kΩ.

**Es lento.** El acero inoxidable y el aire alrededor del chip tardan en alcanzar la temperatura del medio: cuente varios segundos tras la inmersión antes de que el valor se estabilice. No es un defecto del chip, es la masa que hay que calentar o enfriar.

## Varios sensores en un solo hilo

Es la gracia del DS18B20. Cada ejemplar sale de fábrica con una **dirección** única de 64 bits grabada. Se pueden conectar, por tanto, cinco al mismo pin — `Data` con `Data`, una sola resistencia de 4,7 kΩ para todos — e interrogarlos uno a uno por su dirección.

El programa los encuentra con `search()`, que devuelve las direcciones de una en una.

## En Arduino

Dos bibliotecas que instalar: **OneWire** y **DallasTemperature**.

```cpp
#include <OneWire.h>
#include <DallasTemperature.h>

OneWire wire(2);                 // Data en el pin 2
DallasTemperature sensors(&wire);

void setup() {
  Serial.begin(9600);
  sensors.begin();
}

void loop() {
  sensors.requestTemperatures();             // pedir una medida
  float t = sensors.getTempCByIndex(0);      // el primer sensor del hilo
  Serial.println(t);
  delay(1000);
}
```

Si la lectura es **−127**, el sensor no ha respondido: compruebe la resistencia de 4,7 kΩ, la alimentación y la orientación de los hilos.

## En el Pico (MicroPython)

Los dos módulos ya están en MicroPython, no hay nada que instalar.

```python
import machine, onewire, ds18x20, time

wire = onewire.OneWire(machine.Pin(2))
sensor = ds18x20.DS18X20(wire)
addresses = sensor.scan()          # los sensores encontrados en el hilo

while True:
    sensor.convert_temp()          # pedir una medida
    time.sleep_ms(750)             # el tiempo que tarda
    for a in addresses:
        print(sensor.read_temp(a))
    time.sleep(1)
```

Los `750 ms` no son una precaución: es el tiempo que tarda el chip en convertir a 12 bits. Leer antes es leer la medida anterior.

## Simulación

En simulación, el componente muestra un cursor **T°**, de −55 a +125 °C. Lo que se ajusta ahí es lo que lee el programa — el sensor responde de verdad al protocolo 1-Wire, dirección incluida, igual que lo haría el chip. Mueva el cursor mientras corre el programa: la siguiente lectura da el nuevo valor.

### Cursor totalmente a la izquierda: «lectura fallida»

A **exactamente −55 °C**, un programa Arduino que usa **DallasTemperature** muestra «lectura fallida» (`DEVICE_DISCONNECTED_C`) en lugar de la temperatura. No es un defecto de la simulación: esta biblioteca usa −55 °C como valor centinela que significa «sensor ausente», así que confunde el límite inferior del sensor con un fallo. Un DS18B20 real a −55 °C da exactamente el mismo resultado.

Ponga el cursor a **−54,5 °C** para que la lectura pase. En MicroPython (`ds18x20`), el problema no existe: −55 °C se lee como cualquier otro valor.

---

*Dibujo y ficha: Frank Sauret. Referencia: [Analog Devices DS18B20](https://www.analog.com/en/products/ds18b20.html).*
