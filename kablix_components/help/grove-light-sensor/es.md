# Sensor de luz Grove

![Sensor de luz Grove](grove-light-sensor.webp)

Una pequeña placa con un ojo electrónico. Cuanta más luz recibe, más corriente deja pasar: la placa convierte esa corriente en tensión y la entrega por un solo hilo. Es el sensor de las lamparitas que se encienden al anochecer y de las pantallas que se atenúan solas en la oscuridad.

Componente de biblioteca: se instala con el gestor de componentes, no está en la paleta de origen.

## Pines

Es un conector Grove de cuatro hilos, en el orden del cable:

| Pin | Función |
|--------|------|
| **GND** (negro) | Masa |
| **VCC** (rojo) | Alimentación, 3,3 V o 5 V |
| **NC** | Nada — este hilo no se usa |
| **SIG** (amarillo) | Salida, a conectar a una **entrada analógica** (A0, GP26…) |

La salida no es de todo o nada: es una tensión que sube de forma gradual. Por eso debe ir a una entrada capaz de medir, no a un simple pin digital.

## Qué vale la salida

| Luz | Tensión en **SIG** |
|---------|---------------------|
| Oscuridad total | cerca de **0 V** |
| Una habitación iluminada | a mitad |
| Pleno sol | cerca de la tensión de alimentación |

En el programa, `analogRead(A0)` devuelve **0** a oscuras y **1023** a plena luz en un Arduino; `ADC.read_u16()` devuelve de **0** a **65535** en un Pico. Basta un umbral para encender una lámpara al anochecer:

```c
if (analogRead(A0) < 200) { /* oscurece: encender */ }
```

## La propiedad «iluminancia a fondo de escala»

El inspector muestra un valor en **lux** (**500 lx** por defecto). El lux es la unidad de la luz recibida: unos pocos lux para una vela, 500 para un escritorio bien iluminado, más de 10 000 en el exterior en un día soleado.

Ese valor indica **con qué iluminancia llega el sensor al final de su recorrido**, es decir, cuándo su tensión de salida alcanza el máximo. Si lo cambia, el cursor de simulación cambia su graduación con él: ponga 10 000 lx y el cursor irá de 0 a 10 000.

## Simulación

En simulación, el componente muestra un cursor **Iluminancia**, graduado de **0** al valor de fondo de escala. Deslícelo: la tensión del pin `SIG` lo sigue al instante, en línea recta — 0 lx da 0 V y el fondo de escala da la tensión de alimentación de la placa (5 V o 3,3 V). El programa lee el cambio en la siguiente vuelta.

El sensor real no responde del todo en línea recta, y ve el verde un poco mejor que el rojo o el azul. En un montaje real, por tanto, se leen los valores que importan (habitación a oscuras, habitación iluminada) antes de elegir el umbral.

## Atención

- El sensor **no** da lux: da una tensión. Para leer lux de verdad hace falta un sensor de medida directa (un TSL2561 en el bus I²C, por ejemplo).
- No lo coloque frente a la lámpara que controla: la lámpara se encendería, lo iluminaría, él la apagaría, y así sucesivamente. Ese parpadeo sin fin se evita separándolos, o dejando un margen entre el umbral que enciende y el que apaga.

---

*Dibujo y ficha: Frank Sauret. Referencia: [Grove - Light Sensor](https://wiki.seeedstudio.com/Grove-Light_Sensor/).*
