# RGB LED

![RGB LED](../../img/composants/rgb-led.webp)

共阴极（或共阳极）三色 LED（红/绿/蓝）。混合三个通道即可得到任意颜色。

## 引脚

| 引脚 | 作用 |
|--------|------|
| **R** | 红 |
| **G** | 绿 |
| **B** | 蓝 |
| **COM** | 公共端（阴极或阳极） |

## 属性

| 属性 | 作用 | 默认值 |
|-----------|------|--------|
| `common` | 公共引脚（阴极/阳极） | 阴极 |

## 用法

- R/G/B 每个通道各串一个电阻。
- 共阴极：COM 接地，各通道接 +。共阳极：相反。
- 在 R/G/B 上用 PWM 调节每种颜色的强度。

---

*本页根据 [Wokwi 文档](https://docs.wokwi.com/parts/wokwi-rgb-led) 改编并翻译 — © Wokwi。`@wokwi/elements` 元件（MIT 许可证）。*
