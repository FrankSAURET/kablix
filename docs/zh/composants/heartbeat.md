# 心率传感器

![心率传感器](../../img/composants/heartbeat.webp)

光学心率传感器。模拟输出（脉搏）。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **VCC** | 电源 (+) |
| **OUT** | 模拟输出 |
| **GND** | 地 |

## 属性

| 属性 | 作用 | 默认值 |
|-----------|------|--------|
| `value` | 模拟的脉搏 (%) | 50 |

## 用法

- OUT 接模拟输入。
- 对信号滤波以提取心跳。

---

*本页根据 [Wokwi 文档](https://docs.wokwi.com/parts/wokwi-heart-beat-sensor) 改编并翻译 — © Wokwi。`@wokwi/elements` 元件（MIT 许可证）。*
