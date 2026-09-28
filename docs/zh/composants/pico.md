# Raspberry Pi Pico

![Raspberry Pi Pico](../../img/composants/pico.webp)

RP2040 微控制器开发板（双核 ARM Cortex-M0+）。26 个 GPIO 引脚，3 个模拟输入 (ADC)，**3.3 V** 逻辑电平。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **GP0–GP28** | 数字 I/O（GP26–GP28 = ADC0–ADC2） |
| **3V3** | 3.3 V 输出 |
| **VSYS / VBUS** | 输入电源 |
| **GND** | 地 |
| **RUN** | 复位（低电平有效） |

## 用法

- 用 **K** 按钮查看完整引脚图（引脚海报）。
- **3.3 V 逻辑电平**：不要给输入引脚加 5 V。
- 可用 MicroPython 或 C/C++ (Arduino) 编程。

> ⚠️ GPIO **不** 耐受 5 V。

---

*Kablix 自有元件（开发板图形）。RP2040 © Raspberry Pi Ltd。*
