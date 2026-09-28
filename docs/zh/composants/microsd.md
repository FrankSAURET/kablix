# microSD 卡 (SPI)

![microSD 卡 (SPI)](../../img/composants/microsd.webp)

SPI 接口的 microSD 读卡器：用于存储文件。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **VCC / GND** | 电源 |
| **SCK** | SPI 时钟 |
| **DI** | 数据输入 (MOSI) |
| **DO** | 数据输出 (MISO) |
| **CS** | 片选 |
| **CD** | 插卡检测 |

## 用法

- SPI 总线 + CS。使用 `SD` 库。
- 仿真的存储卡已 **格式化为 FAT16**（约 2 MB），就像刚买的卡一样：`SD.begin()`、`SD.open()`、写入和读回文件都无需任何准备。
- 其内容保存在内存中：**停止仿真后会丢失**，下次运行时卡是空的。

### Arduino

```cpp
#include <SD.h>
SD.begin(4);                              // CS 接 D4，硬件 SPI 总线 D11/D12/D13
File f = SD.open("essai.txt", FILE_WRITE);
f.println("Hello from Kablix!");
f.close();
```

### Pico (MicroPython)

MicroPython 不带 SD 卡驱动：把 `sdcard.py` 文件（来自官方 *micropython-lib*）放到 **程序旁边** 的 `lib/` 文件夹中 — Kablix 会自动注入它。

```python
from machine import Pin, SPI
import os, sdcard

spi = SPI(0, baudrate=1_320_000, sck=Pin(18), mosi=Pin(19), miso=Pin(16))
os.mount(sdcard.SDCard(spi, Pin(17)), "/sd")   # CS 接 GP17
with open("/sd/essai.txt", "a") as f:
    f.write("Hello from Kablix!\n")
```

---

*本页根据 [Wokwi 文档](https://docs.wokwi.com/parts/wokwi-microsd-card) 改编并翻译 — © Wokwi。`@wokwi/elements` 元件（MIT 许可证）。*
