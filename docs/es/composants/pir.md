# Detector de movimiento PIR

![Detector de movimiento PIR](../../img/composants/pir.webp)

Detector de movimiento por infrarrojos pasivo. La salida digital pasa a nivel alto al detectar.

## Pines

| Pin | Función |
|--------|------|
| **VCC** | Alimentación (+) |
| **OUT** | Salida digital (1 = movimiento) |
| **GND** | Masa |

## Propiedades

Ninguna: durante la simulación el movimiento se provoca **con el ratón** (ver más abajo).

## Uso

- OUT a una entrada digital.

## Durante la simulación: el ratón crea el movimiento

- **Mueva el ratón sobre el sensor** → OUT pasa a 1. Lo que cuenta es el *movimiento*, no la mera presencia del puntero: la salida vuelve a 0 poco después de que el ratón se detenga.
- **Ctrl+clic** sobre el sensor → movimiento **permanente** (OUT se queda en 1, aunque el ratón se aleje). Otro Ctrl+clic lo detiene.
- Una **burbuja de ayuda** recuerda estos gestos: aparece **25 px por debajo del puntero**, centrada en él, para no tapar nunca el sensor. Se mantiene visible mientras el ratón esté sobre el sensor, aunque esté quieto, y conserva su tamaño y su distancia al puntero **sea cual sea el zoom** del taller.

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-pir-motion-sensor) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
