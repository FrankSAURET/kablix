 <img src="https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/accroche.webp" alt="Kablix" width="1000" />

---

<div align="center">

[Français](README.md) · [English](README.en.md) · [Español](README.es.md)

</div>

---
> 新功能提示：可以通过 “管理元件” 按钮下载更多元件。
# Kablix
一款 **高卢** 风格的微控制器仿真应用（**Arduino Uno / Raspberry Pi Pico**），直接在 VS Code 中运行，
- **100% 离线**
- **100% 免费**
- **100% 开源**
- **100% 无遥测**

仿真基于扩展内置的三个开源引擎：[avr8js](https://github.com/wokwi/avr8js)（ATmega328P）、[rp2040js](https://github.com/wokwi/rp2040js)（RP2040）和 [rp2350js](https://github.com/c1570/rp2350js)（RP2350），均采用 MIT 许可证。

## 测试
我的测试库在这里：[TestKablix](https://github.com/FrankSAURET/kablix/tree/main/testkablix)
## 快速上手
1. 首先，单击左侧活动栏中的 <img src="https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/KNB.webp" alt="Kablix" width="30" /> 图标；
    - 或者，在项目文件夹中双击一个 projix 文件；
    - 或者，如果设置了文件关联，在 Windows 资源管理器中双击一个 projix 文件。

![alt text](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/demarrer.gif)
1. **搭建电路**：从左侧元件库中拖放元件。直接连接引脚，然后单击自动布线按钮（它会对所选元件布线；没有选择时对整个电路布线）。
 
![alt text](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/dessiner.gif)
1. **运行代码**：关联一个代码文件（注意，`.ino` 草图必须放在同名文件夹中），然后单击 **▶ “启动”**：
   - `.ino`/`.c`/`.cpp` → 用本地工具链编译；
   - `.py` → 在仿真的 Pico 上运行 MicroPython（需要 `.uf2` 固件，见下文）；
   - `.hex` / `.uf2`/`.elf` / `.bin` → 直接加载，无需编译。
   
1. **保存电路**：“Kablix：保存项目 (.projix)”；之后在资源管理器中双击 `.projix` 即可重新打开。也支持 Wokwi 导入/导出（`diagram.json`）。

![alt text](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/simuler.gif)
## 功能

- ✅ **可视化工作区**：自动布线。 
- ✅ **元件创建器**：可以用这个创建器制作自己的 “自定义” 元件；更好的做法是 fork 仓库，按照 [指南](docs/zh/Creating-components.md) 添加元件并提交 PR（发布请求）— 这样下一个版本所有人都能用到；请同时提供测试电路（Pico + Arduino）。
- ✅ **SVG 导出**。
- ✅ **76 个元件的元件库**，按类别整理，每个元件都有图文帮助页（❔ 按钮）和两个测试电路（Arduino 和 Pico）— [完整列表](#元件库)。
- ✅ **元件管理器**（元件栏底部的 ⚙ 按钮）：一个元件就是一个 `.kompix` 文件 — 包含图形、引脚、仿真和帮助页。从仓库一键安装，或把文件放进项目文件夹即可。
- ✅ **DMX512 灯光**：从硬件 UART **或** 位操作引脚（DmxSimple）解码灯光数据，实时驱动灯具。
- ✅ **支持的开发板**：Arduino Uno、Nano、Mega 2560 以及 Raspberry Pi Pico/Pico W/Pico 2/Pico 2 W，均可插到面包板上。
- ✅ **真实烧录 RP2040**。
- ✅ **直接加载编译产物**：在别处编译好的 `.hex`、`.uf2`、`.elf`、`.bin`，无需重新编译即可加载
- ✅ **真实编译 C/C++ 代码**
- ✅ **双向串口监视器**：实时输出，并提供输入框向微控制器发送数据。
- ✅ **绘图器**：实时曲线，还可以把 **探针** 放在引脚上观察其电压
- ✅ **物理仿真**：亮度取决于串联电阻，没有电阻的 LED 会烧坏，舵机无法启动，电源会考虑电流…
- ✅ **可交互的传感器**：用滑块和按钮模拟火焰、气体、声音、光线、温度和运动，实时驱动电路输入。
- ✅ **测量仪器**：万用表、示波器、信号发生器和逻辑分析仪。

> 帮助文件位于 `docs/<国家代码>/` 文件夹。  
> 📖 **完整指南**：USAGE.md — 界面、接线、创建自定义元件（附 AI 提示词）、`.kompix` 格式、元件管理器、在哪里找到现成的元件。  
> **向 Kablix 添加元件**（贡献者，仅在 GitHub 上）：Creating-components.md — 从 `Composants2D.svg` 中的图形到经过仿真、测试和文档化的元件，可手工完成，也可借助 AI。  
> **绘制立体系统**（蜘蛛、腿 — 贡献者，仅在 GitHub 上）：Drawing-systems.md — 你画出零件的轮廓，等轴测引擎把它变成立体。  
> 🌍 **四种语言的界面**：法语、英语、西班牙语和简体中文，跟随 VS Code 的语言（其他语言一律使用英语）。指南和元件帮助页均有四种语言版本。该机制可扩展到其他语言 — 见 [国际化](#国际化)。

## 元件库

**76 个元件**，可用鼠标放置，按元件栏顺序排列（另有其变体：有极性电容、PN2222A/NPN/PNP 三极管、3×4 和 4×4 键盘、mini/half/full 面包板…）。每个元件都有 **图文帮助页**（检查器中的 ❔ 按钮，离线，提供法语、英语、西班牙语和中文）和 **两个测试电路**，可在 [testkablix](https://github.com/FrankSAURET/kablix/tree/main/testkablix) 中直接仿真 — 一个是 Arduino 上的 C 程序，一个是 Pico 上的 MicroPython 程序。

| 类别 | 元件 |
| --- | --- |
| **开发板与面包板**（9） | Arduino Uno · Arduino Nano · Arduino Mega 2560 · Raspberry Pi Pico · Raspberry Pi Pico W · Raspberry Pi Pico 2 · Raspberry Pi Pico 2 W · Grove 扩展板 (Pico) · 面包板 |
| **分立元件**（11） | 电阻 · 电容（有极性或无极性）· 二极管 · 三极管（PN2222A、NPN、PNP — TO-92 封装）· LED · RGB LED · NTC 热敏电阻 · PTC 热敏电阻 · 光敏电阻 (LDR) · 光电二极管 · 光电三极管 |
| **指示与显示**（8） | 10 段 LED 条 · 7 段数码管（1 到 4 位）· NeoPixel · NeoPixel 点阵 · NeoPixel 灯环 · 字符 LCD 16×2 / 20×4（I²C 或并口）· SSD1306 OLED 显示屏 · ILI9341 TFT 显示屏 (SPI) |
| **控制器件**（10） | 按钮 · 6 mm 按钮 · 拨动开关 · 8 位拨码开关 · 矩阵键盘 3×4 / 4×4 · 电位器 · 滑动电位器 · 微调电位器 · OMRON G5V 继电器 · 模拟摇杆 |
| **传感器**（12） | 光线传感器 · 气体传感器 (MQ) · 火焰传感器 · 声音传感器 · PIR 人体传感器 · 倾斜传感器 · 霍尔效应传感器 · 心率传感器 · NTC 温度传感器 · 超声波传感器 (HC-SR04) · DHT22 温湿度 · DHT11 温湿度 |
| **执行器**（4） | 蜂鸣器 · 舵机 · 风扇 · 直流电机 |
| **系统**（2） | 蜘蛛机器人 · 蜘蛛腿 |
| **测量仪器**（5） | 实验室电源 · 台式万用表 · 台式示波器 · 信号发生器 · 逻辑探头（逻辑分析仪，实验性）|
| **其他**（3） | 充电宝 · microSD 卡 (SPI) · 16 路 PWM 驱动板 (PCA9685) |
| **集成电路**（12） | **CMOS 4000**：CD4081（4 × 与）· CD4071（4 × 或）· CD4070（4 × 异或）· CD4011（4 × 与非）· CD4001（4 × 或非）· CD40106（6 × 非，施密特触发）— **TTL/HC 74**：74xx08 · 74xx32 · 74xx86 · 74xx00 · 74xx02 · 74xx14（功能相同；所选系列决定供电范围）|

此外还有 **库元件**（`.kompix`），由管理器安装或放进项目文件夹，以及在内置创建器中绘制的 **自定义元件**。

> 📦 **公共元件库**：可下载元件的图文列表见 [kablix_components/README.md](kablix_components/README.md)。

## 国际化

界面跟随 VS Code 的语言（`vscode.env.language`）：**法语 (`fr`)、英语 (`en`)、西班牙语 (`es`) 或简体中文 (`zh-cn`)**，其他语言一律使用英语（后备语言）。翻译由三个相互独立的部分组成，因为它们翻译的内容性质不同：

| 内容 | 文件 | 形式 |
| --- | --- | --- |
| webview 文字（工具栏、元件栏、检查器、目录…） | `src/webview/i18n.mts` + `src/webview/i18n-<语言>.mts` | **键（英语）→ 译文** 字典（`DICTS`）；缺失时 `t()` 回退到英语键 |
| 扩展文字（命令、通知、对话框） | `package.nls.<语言>.json` + `l10n/bundle.l10n.<语言>.json` | VS Code 原生机制（`package.json` 中的 `%键%`，代码中的 `vscode.l10n.t()`）；无后缀的文件是英语 |
| 帮助：用户指南（❔）和元件帮助页 | `docs/<语言>/*.md` 和 `docs/<语言>/composants/*.md` | **纳入版本管理的 Markdown**，在 webview 中离线渲染（`src/markdown.ts` → `src/guide.ts` / `src/partHelp.ts`）|

帮助不是固化在代码中的 HTML 副本：显示的就是 **指南本身**，包括图片 — 因此永远不会落后于文档。较大的截图（演示 GIF、标志）不打包进 `.vsix`，而是从 GitHub 加载；其他图片都已内置，可离线阅读。

三个部分采用相同的选择规则：语言的 **基本代码**（`zh-cn` → `zh`）选中对应条目，缺失时以英语为后备。

### 添加一种语言（例如德语，`de`）

需要在 **全部三个** 部分中完成 — 只在一处声明的语言只会被部分翻译：

1. **Webview** — 仿照 [`i18n-es.mts`](src/webview/i18n-es.mts) 创建 `src/webview/i18n-de.mts`（`export const DE = { … }`，与 `FR` 使用相同的英语键），然后在 [`src/webview/i18n.mts`](src/webview/i18n.mts) 中把它加入 `DICTS` → `{ fr: FR, es: ES, zh: ZH, de: DE }`。未翻译的键会自动回退到英语。
2. **扩展** — 把 `package.nls.json` 复制为 `package.nls.de.json`，把 `l10n/bundle.l10n.fr.json` 复制为 `l10n/bundle.l10n.de.json`，然后翻译其中的值（键保持不变）。VS Code 会自动选择对应文件。
3. **帮助** — 创建 `docs/de/`：指南 `USAGE.md` 和 `composants/` 文件夹（文件 名 与 `docs/fr/` 相同，只翻译内容；图片共用 `docs/img/` 中的文件）。然后在 [`src/partHelp.ts`](src/partHelp.ts) 的 `DOC_LANGS` 中加入该语言 — 缺失的帮助页会先回退到英语，再回退到法语。

无需修改其他逻辑：选择和回退由 `initLocale()`（webview）和 `docLang()`（帮助）负责。`npm run verify:docs` 会检查指南和帮助页是否完整、配有插图并已打包。

## 致谢

Kablix 由 **[Frank SAURET](https://electropol.fr)** 开发，使用了以下开源库：

| 库 | 作用 | 许可证 |
| --- | --- | --- |
| [avr8js](https://github.com/wokwi/avr8js) | ATmega328P 仿真引擎（Arduino Uno） | MIT |
| [rp2040js](https://github.com/wokwi/rp2040js) | RP2040 仿真引擎（Raspberry Pi Pico） | MIT |
| [rp2350js](https://github.com/c1570/rp2350js) | RP2350 仿真引擎（Raspberry Pi Pico 2） | MIT |
| [@wokwi/elements](https://github.com/wokwi/wokwi-elements) | 可视化元件（开发板、LED、传感器…） | MIT |
| [JSZip](https://stuk.github.io/jszip/) | 读写 `.projix` 压缩包 | MIT/GPLv3 |
| RP2040 B1 bootrom | 仿真 RP2040 的启动 | © Raspberry Pi (Trading) Ltd — BSD-3-Clause |
| Raspberry Pi 官方开发板图 | Pico、Pico W、Pico 2 和 Pico 2 W 开发板图形 | © Raspberry Pi Ltd |
| MicroPython | 在仿真 Pico 上运行的 `.uf2` 固件（由用户提供） | MIT |
| [LED Board-7](http://www.styleseven.com) 字体 © Sizenko Alexander (Style-7) | 仿真 LCD 屏幕的 LED 显示效果 | 免费软件（可免费使用，须注明出处） |

项目格式和导入的元件与 [Wokwi](https://wokwi.com) 兼容（开放的 `diagram.json` 格式）。

## 许可证

MIT — 内置的 RP2040 bootrom 版权归 © Raspberry Pi (Trading) Ltd 所有，采用 BSD-3-Clause 许可证。
