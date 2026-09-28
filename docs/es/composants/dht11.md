# Sensor de temperatura/humedad DHT11

![Sensor de temperatura/humedad DHT11](../../img/composants/dht11.webp)

Sensor digital de temperatura y humedad de un solo hilo, el hermano pequeño azul del DHT22: menos preciso y con un rango más estrecho, pero con el mismo protocolo y el mismo cableado.

## Pines

| Pin | Función |
|--------|------|
| **VCC** | Alimentación (+) |
| **DATA** | Datos (un hilo) |
| **NC** | No conectado |
| **GND** | Masa |

## Propiedades

| Propiedad | Función | Por defecto |
|-----------|------|--------|
| `temperature` | Temperatura (°C) | 22 |
| `humidity` | Humedad (%) | 50 |
| `angle` | Orientación (0/90/180/270°) | 0 |

## Uso

- DATA a un pin digital (pull-up de 10 kΩ).
- Biblioteca DHT: una lectura cada ~2 s. Si se le consulta más deprisa, devuelve su **valor en caché**, exactamente como un sensor real.
- En simulación, dos cursores ajustan la temperatura y la humedad **mientras** corre el programa: la siguiente lectura devuelve el nuevo valor.
- Límites del DHT11, respetados por la simulación: temperatura de 0 a +50 ℃, humedad de 20 a 90 %HR, siempre en **números enteros** (el DHT11 no codifica ni décimas ni negativos). Un ajuste fuera del rango se recorta a los límites del sensor. En el hardware real, añada ±2,0 ℃ y ±5,0 %HR de incertidumbre.
- ¿Necesita más precisión, temperaturas negativas o humedades extremas? Use el [DHT22](dht22.md).

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-dht22) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT). Dibujo de la cápsula: Frank Sauret.*
