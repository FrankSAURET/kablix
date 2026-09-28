# 火焰传感器

![火焰传感器](../../img/composants/flame.webp)

火焰探测器（红外）。带模拟和数字输出。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **VCC** | 电源 (+) |
| **GND** | 地 |
| **DOUT** | 数字输出（1 = 有火焰） |
| **AOUT** | 模拟输出 |

## 属性

| 属性 | 作用 | 默认值 |
|-----------|------|--------|
| `state` | 检测到火焰 (0/1) | 0 |

## 用法

- DOUT 接数字输入。
- 在检查器中切换状态。

---

*本页根据 [Wokwi 文档](https://docs.wokwi.com/parts/wokwi-flame-sensor) 改编并翻译 — © Wokwi。`@wokwi/elements` 元件（MIT 许可证）。*
