# Grove 扩展板 (Pico)

![Grove 扩展板 (Pico)](../../img/composants/grove-pico.webp)

**Grove Shield for Pi Pico v1.0** 扩展板（Seeed Studio）。Pico（或 Pico W）插在中间两排插座上；扩展板把它的 I/O 引到 10 个四针 Grove 接口，另有一个 2×3 SPI 排针。

## Grove 接口

| 接口 | 引脚（从上到下） | Pico GPIO |
|------|---------------------|-----------|
| **I2C0** | GND · VCC · SDA · SCL | GP8 / GP9 |
| **I2C1** | GND · VCC · SDA · SCL | GP6 / GP7 |
| **A0** | GND · 3V3 · NC · A0 | GP26 |
| **A1** | GND · 3V3 · A0 · A1 | GP26 / GP27 |
| **A2** | GND · 3V3 · A1 · A2 | GP27 / GP28 |
| **UART0** | GND · VCC · TX · RX | GP0 / GP1 |
| **UART1** | GND · VCC · TX · RX | GP4 / GP5 |
| **D16** | GND · VCC · D17 · D16 | GP17 / GP16 |
| **D18** | GND · VCC · D19 · D18 | GP19 / GP18 |
| **D20** | GND · VCC · D21 · D20 | GP21 / GP20 |
| **SPI** | SCK · TX · RX / GND · 3V3 · CS | GP2 / GP3 / GP4 / GP5 |

数字和串口接口提供 **两个** 信号：第二个就是接口名称中的 GPIO。模拟接口与相邻接口共用一个通道（A1 重复 A0，A2 重复 A1）。

## 属性

| 属性 | 作用 | 默认值 |
|-----------|------|--------|
| `pwr` | Grove 接口的 VCC 电源轨：`3v3` 或 `5v` (VBUS) | `3v3` |

## 用法

- 先放置扩展板，然后 **把 Pico 拖到上面**：它会插入插座并位于前面。之后 Grove 接口的接线按上面的引脚表，无需再拉线到 Pico。
- `pwr` 开关设置 **I2C / UART / D16-D20** 接口的 VCC 电源轨。模拟接口和 SPI 排针始终为 3.3 V。
- 选 5 V 时，VCC 来自 VBUS (USB)：信号本身仍是 3.3 V — 请确认你的 Grove 模块能接受。
- 所有地（插座、接口、SPI）都在同一条电源轨上。
- **GPIO 写在引脚提示气泡上**：悬停在 `A1.A0` 上会显示 `A1.A0.GP26` — 程序中要用的是 `GP26`。电源引脚（VCC、GND、3V3、NC）保持原名。

---

*Kablix 元件 — 引脚取自 Seeed 官方原理图 `Grove_shield_for_PI_PICO v1.0.sch`。*
