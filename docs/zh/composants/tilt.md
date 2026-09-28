# 倾斜传感器

![倾斜传感器](../../img/composants/tilt.webp)

滚珠开关：根据倾斜情况闭合或断开。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **VCC** | 电源 (+) |
| **OUT** | 数字输出 |
| **GND** | 地 |

## 属性

| 属性 | 作用 | 默认值 |
|-----------|------|--------|
| `state` | 已倾斜 (0/1) | 0 |

## 用法

- OUT 接数字输入（通常用 `INPUT_PULLUP`）。
- 在检查器中切换状态。

---

*本页根据 [Wokwi 文档](https://docs.wokwi.com/parts/wokwi-tilt-switch) 改编并翻译 — © Wokwi。`@wokwi/elements` 元件（MIT 许可证）。*
