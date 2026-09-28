# Raspberry Pi Pico 2

![Raspberry Pi Pico 2](../../img/composants/pico2.webp)

**RP2350** 微控制器开发板（双核 ARM Cortex-M33，150 MHz），Pico 的后继产品。外形相同，40 针布局相同，**3.3 V** 逻辑电平 — 26 个 GPIO 引脚和 3 个模拟输入 (ADC)。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **GP0–GP28** | 数字 I/O（GP26–GP28 = ADC0–ADC2） |
| **3V3** | 3.3 V 输出 |
| **VSYS / VBUS** | 输入电源 |
| **GND** | 地 |
| **RUN** | 复位（低电平有效） |

## 用法

- 用 **K** 按钮查看完整引脚图（引脚海报）— 与 Pico 相同。
- **3.3 V 逻辑电平**：不要给输入引脚加 5 V。
- 可用 **MicroPython** 编程：Kablix 加载 `RPI_PICO2` 固件。
- RP2350 还有 RISC-V 版本（Hazard3 内核）：Kablix 仿真的是 **Cortex-M33** 内核，`-RISCV-` 固件不适用。

> ⚠️ GPIO **不** 耐受 5 V。

> ℹ️ 这块板暂不支持裸机 C/C++：请使用 MicroPython，或用 Pico 运行 Arduino 程序。

---

*Kablix 自有元件。开发板图形依据 Raspberry Pi Ltd 官方图纸。RP2350 © Raspberry Pi Ltd。*
