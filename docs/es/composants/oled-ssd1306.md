# Pantalla OLED (SSD1306)

![Pantalla OLED (SSD1306)](../../img/composants/oled-ssd1306.webp)

Pequeña pantalla OLED monocroma de 128×64 (SPI). Ideal para texto y gráficos.

## Pines

| Pin | Función |
|--------|------|
| **VIN** | Alimentación (+) |
| **GND** | Masa |
| **CLK** | Reloj SPI (SCK) |
| **DATA** | Datos SPI (MOSI) |
| **DC** | Datos/Comando |
| **CS** | Selección del chip |
| **RST** | Reinicio |

## Uso

- Bus SPI + DC + CS. Bibliotecas Adafruit_SSD1306 / U8g2.
- En simulación, la memoria de pantalla se decodifica y se dibuja.

---

*Ficha adaptada y traducida de la [documentación de Wokwi](https://docs.wokwi.com/parts/wokwi-ssd1306) — © Wokwi. Componentes `@wokwi/elements` (licencia MIT).*
