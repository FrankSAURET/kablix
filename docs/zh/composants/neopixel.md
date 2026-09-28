# NeoPixel

![NeoPixel](../../img/composants/neopixel.webp)

可寻址 RGB LED (WS2812)。可级联：一个 LED 的输出接下一个的输入。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **VDD** | 电源 (+) |
| **VSS** | 地 |
| **DIN** | 数据输入 |
| **DOUT** | 数据输出（接下一个像素） |

## 用法

- DIN 接数字引脚（第一个像素）。
- 可用 Adafruit_NeoPixel / FastLED 库。

## 仿真中：自动跟踪级联

把一个像素的 **DOUT** 接到下一个像素的 **DIN**：Kablix 会沿着级联链分配数据帧。接到微控制器引脚的第一个像素显示 `pixel[0]`，下一个显示 `pixel[1]`，依此类推。插在链中的灯环或点阵会占用与其 LED 数量相同的颜色。

因此请在程序中声明整条链的 LED **总数**：

```python
import neopixel
from machine import Pin
chain = neopixel.NeoPixel(Pin(0), 3)   # GP0 上串接 3 个像素
chain[2] = (0, 0, 255)                 # 第三个 像素变成蓝色
chain.write()
```

---

*本页根据 [Wokwi 文档](https://docs.wokwi.com/parts/wokwi-neopixel) 改编并翻译 — © Wokwi。`@wokwi/elements` 元件（MIT 许可证）。*
