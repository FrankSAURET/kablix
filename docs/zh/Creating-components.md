# 创建 Kablix 元件（图形、内部原理图、仿真）

本指南介绍自 v2026.7.229 以来每个新增元件所走过的完整流程：**`Composants2D.svg` 中的一张图 → 一个可以放置、接线、仿真、测试并有文档的元件**。它面向在**代码仓库**上工作的人（内置元件、重新编译）；如果只是自己用的元件、不想改代码，快捷方式仍然是 [修改元件的 SVG](Editing-svg-components.md) 中介绍的 `.kablix-part.json` 文件。

有两种方式：[手动](#手动完成整条流程)逐步进行，或者[交给 AI](#借助-ai)，由您提供图形和规则。两者经过的是同样的文件——AI 一节只是同一条路上的捷径。

---

## 准备工作

- 已克隆仓库，已执行 `npm install`，Node 20+。
- **Inkscape**（或任意 SVG 编辑器），用于在 `Composants2D.svg` 中绘图。
- 已安装 **Chrome / Chromium**：提取和插图截取都通过无头浏览器完成（SVG 几何——CTM、`getBBox`、`defs`——无法用正则表达式求解）。

---

## 流程一览

| # | 步骤 | 涉及的文件 |
| --- | --- | --- |
| 1 | 绘制元件及其内部原理图 | `Composants2D.svg` |
| 2 | 提取 SVG | `src/webview/composants/externe/<type>.svg`、`.../interne/<type>-interne.svg` |
| 3 | 编写元素 | `src/webview/composants/<type>-element.mts` + 在 `src/webview/sim.mts` 中加一行 import |
| 4 | 在目录中注册 | `src/webview/diagram/catalog.mts`、`src/webview/diagram/refnames.mts` |
| 5 | 接入内部原理图 | `src/webview/diagram/internal-wiring.mts` |
| 6 | 赋予行为 | `src/webview/diagram/model.mts` 或 `src/webview/engines/*.mts` |
| 7 | 翻译 | `src/webview/i18n.mts` |
| 8 | 两个测试文件（Uno + Pico） | `testkablix/_spec.mjs`、`testkablix/README.md` |
| 9 | 法文 + 英文帮助页及其插图 | `docs/{fr,en}/composants/<type>.md`、`docs/img/composants/<type>.webp` |
| 10 | 交付 | `todo.md`、`package.json`、构建、`verify:all`、提交 |

纯装饰性的元件到第 5 步为止。在仿真中需要*做*点什么的元件则要走完全程。

---

## 手动完成整条流程

### 1. 在 `Composants2D.svg` 中绘图

`Composants2D.svg` 是一张 A3 的 Inkscape 图纸（单位为 **mm**），汇集了元件库中**平面**元件的图形。需要做成立体的部件（型材、装配体、蜘蛛机器人）有自己的图纸 `Composants3D.svg`——参见 [绘制 3D 系统](Drawing-systems.md)。旧的单一图纸 `Composants.svg` 只要还在，就会作为备用继续被读取。这些规则不是摆设：提取器依赖它们。

- **一个元件 = 一个 `id` 为元件名称的组**（`diode`、`relais`、`moteur-dc`）。这个名称在流程的其余部分都成为元件的 `type`。
- **其内部原理图 = 一个名为 `<名称>-interne` 的组**（`diode-interne`）。没有内部组，元件上就没有 **K** 按钮。
- 外部图形和内部原理图具有**相同的引脚**：相同的名称、相同的顺序、相同的位置。正因如此，二者可以直接叠放，无需重新对齐。
- **红色焊盘**（`fill:#ee0000` 的圆）标记连接点；**焊盘的中心就是导线连接的位置**。紧贴其上方的文字给出**引脚名称**（`A`、`K`、`B1`、`VCC`……）。`nc` 表示不连接：画出来了，但没有连接点。
- 焊盘和标签是**工作标记**：提取器会把它们从交付的图形中去掉。

> 10 px 的间距（0.1″，面包板孔距）是唯一硬性的几何约束。提取器会选择交付图形的边框，使**每个焊盘都落在 10 px 的整数倍上**，四周至少留 10 px 边距；如果您的图形中两个引脚相距 9.7 px，任何边框都救不了它。

### 2. 提取 SVG

```bash
node scripts/_extract-composants.mjs diode
```

输出：`src/webview/composants/externe/diode.svg`（清理后的图形，以网格像素为单位），如果该组存在，还有 `src/webview/composants/interne/diode-interne.svg`。命令会显示所选边框和每个引脚的位置——**这份列表给出了要复制到 `pinInfo` 中的坐标**。

| 选项 | 作用 |
| --- | --- |
| `--png` | 只生成 PNG 预览，不向 `src/` 写入任何内容——用于检查进行中的图形。 |
| `--drop=id1,id2` | 按 `id` 把某些元素排除在图形之外（图纸上的标签、构造标记）。 |
| `--suffix=-libre` | 在生成的文件名后加后缀（同一组的两个变体）。 |
| `NPN1@to92` | 将 `NPN1` **作为内部原理图**提取，并与已提取的 `to92` 封装的边框对齐（见下文）。 |

同一命令行上的多个名称会一次性提取；作为宿主引用的封装（`…@to92`）必须在命令行中**先**出现。

> 重新提取元件也会**重写其外部图形**。如果该外部文件之后被修改过（比如封装上的印字），请在提取后用 `git checkout` 恢复它——并重新截取帮助插图。

### 3. 编写元素

可见的元件是 `src/webview/composants/<type>-element.mts` 中的一个 Lit 元素。自 v2026.6.87 起已不再依赖 `@wokwi/elements`：它们都是**本地分支**，标签为 `kablix-*`，**直接使用 Lit、不用装饰器**（`static properties` + `declare`）。最简短的范例是 [`diode-element.mts`](../../src/webview/composants/diode-element.mts)：

```ts
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/diode.svg';

export class DiodeElement extends LitElement {
  // Threshold voltage (V) — informative on the drawing side, used by the model.
  declare vf: number;

  static properties = {
    vf: { type: Number },
  };

  constructor() {
    super();
    this.vf = 0.6;
  }

  // Pins: centre of the drawing pads (10 px grid, K on the band side).
  readonly pinInfo: ElementPin[] = [
    { name: 'K', x: 10, y: 10, signals: [] },
    { name: 'A', x: 50, y: 10, signals: [] },
  ];

  static get styles() {
    return css`
      :host { display: inline-block; }
    `;
  }

  render() {
    return html`
      <svg width="60" height="20" viewBox="0 0 60 20" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-diode')) {
  customElements.define('kablix-diode', DiodeElement);
}
```

有三点不能遗漏：

1. `<svg>` 的 `width`、`height` 和 `viewBox` 必须与提取器给出的边框**完全一致**；`pinInfo` 必须与给出的位置**完全一致**。
2. 每个属性都要声明两次：`declare`（给 TypeScript）和 `static properties`（给 Lit）。漏掉 `properties` 一侧，属性改变时就不会重绘。
3. 文件在被**导入**之前不起任何作用：在 [`src/webview/sim.mts`](../../src/webview/sim.mts) 开头的列表中加上 `import './composants/<type>-element.mjs';`（扩展名为 `.mjs`——这是编译后的名称）。

#### 共用封装（TO-92、TO-220……）

一个封装服务于几十个元件：**它是一张图，而不是一个元件**。其 SVG 位于 `src/webview/composants/externe/<封装>.svg`，由元素为它**着装**——印字（`PN`、`2222A`……）由元件写上，从不画在图形里。添加封装就是在 [`transistor-element.mts`](../../src/webview/composants/transistor-element.mts) 的 **`PACKAGES` 表中加一项**，而不是新建一个元素：

```ts
export const PACKAGES = {
  to92:  { svg: to92,  w: 40, h: 50, pinY: 40, pinX: [10, 20, 30], tx: 19.77, cy: 15.47, tw: 11.8, font: 3.8, fill: '#e6e6e6' },
  to220: { svg: to220, w: 60, h: 90, pinY: 80, pinX: [20, 30, 40], tx: 30,    cy: 50.25, tw: 32,   font: 5.5, fill: '#e6e6e6' },
} as const;
```

两个层级并存：**固定型号**（`pn2222a`——印字和参数都已确定）和**通用原型**（`npn`、`pnp`——一切皆为属性）。内部原理图会被复用：请保持通用，原型一侧引脚编号为 1/2/3，型号一侧使用引脚名称。

### 4. 在目录中注册

[`catalog.mts`](../../src/webview/diagram/catalog.mts) 是元件栏中的元件列表。只需一项：

```ts
{
  type: 'diode', label: 'Diode', tag: 'kablix-diode', kind: 'diode', attrs: { vf: '0.6' },
  props: [
    { attr: 'vf', label: 'Threshold voltage (V)', kind: 'number', min: 0, max: 5, step: 0.1 },
  ],
},
```

| 字段 | 作用 |
| --- | --- |
| `type` | 元件标识符：SVG 组的名称、帮助页的名称、`.projix` 文件中的名称。一经发布**永不更改**（已保存的项目中包含它）。 |
| `label` | 显示名称，**用英文书写**：它是翻译键（第 7 步）。 |
| `tag` | 元素标签（`kablix-…`）。 |
| `kind` | 行为类别（`diode`、`resistor`、`transistor`、`logic-ic`、`motor`……）。它同时决定**仿真**和**元件栏分类**（`catalog.mts` 末尾的函数，顺序见 `CATEGORY_ORDER`）。 |
| `attrs` | 属性的默认值，以字符串表示。 |
| `props` | 检查器中显示的内容：`number`（带 `min`/`max`/`step`，`suffixes: true` 表示支持 k/M）、`select`（带 `options`）、`text`。 |
| `simControl` | 如果元件在**仿真期间**带有滑块或按钮，则为 `true`（见第 6 步）。 |
| `variant` | 对于仍然有效但**不再出现在**元件栏中的类型（已合并元件的旧变体），设为 `true`。 |

最后在 [`refnames.mts`](../../src/webview/diagram/refnames.mts) 中添加其**位号前缀**：`FAMILIES` 表按语言给出前缀（`diode: { en: 'D', fr: 'D' }`），下一张表把 `kind` 映射到其类别。否则，放置的元件会以默认的通用名称命名。

### 5. 接入内部原理图

内部原理图就是通过 **K** 按钮显示的接线。它在 [`internal-wiring.mts`](../../src/webview/diagram/internal-wiring.mts) 中装配：

```ts
import diodeSchema from '../composants/interne/diode-interne.svg';
const DIODE_SCHEMA = parseSchema(diodeSchema);
```

两种情况：

- **与元件一起绘制的原理图**（`<名称>-interne` 组）：`viewBox` 与外部图形相同，因此**可以直接叠放**——只需缩放到元件框的大小。
- **共用封装的原理图**（`NPN1`、`PNP1`、`NMOS-D`……）：通过**平移到引脚 1** 来放置（常量 `TRANSISTOR_SCHEMA_PIN1`），**绝不使用 `scale`**。正因如此，高度是 TO-92 两倍的 TO-220，其符号与引脚的距离仍保持不变。修改封装边框时，这个常量也要随之调整。

原理图可以随属性变化：七段数码管根据 `attrs.common` 让八个二极管朝向公共引脚，晶体管根据 `schema` 属性选择符号。

### 6. 赋予仿真行为

根据元件的性质有三条路径。**不要凭空编造**：预期行为需逐个确定，无法从图形推断出来。

**a. 电气元件**——[`model.mts`](../../src/webview/diagram/model.mts)。网表就在这里：电平传播（`netLevel`）、电阻网络、分压、电流。`kind` 就是开关。以二极管为例：一条**有向**边，只允许电流从 A 流向 K，并损失其阈值电压（`vf`）——这足以让下游 LED 的电压降低相应的量。

**b. 仿真期间可调的元件**——在目录中设 `simControl: true`。仿真运行期间，编辑器会在元素上设置 `simulating` 属性（停止时移除）；元素**只在此状态下**显示其滑块或按钮，并触发一个 `input` 事件，由 `sim.mts` 读取以更新数值。光敏电阻、NTC、电位器以及火焰和气体传感器都是这样做的。

**c. 总线设备或协议元件**——`src/webview/engines/`：`i2c-devices.mts`（LCD、OLED、PCA9685……）、`ws2812.mts`、`ultrasonic.mts`、`dht22.mts`。这里实现的是通信对话，而不是电气特性。

接线故障（缺少续流二极管、电源超出范围、LED 没有电阻）通过**已翻译**的错误信息报告，适用时还会让出问题的元件爆掉——标签会解释原因，而不仅仅是点名。

### 7. 翻译

源字符串**使用英文**；[`i18n.mts`](../../src/webview/i18n.mts) 保存法文词典，英文键 → 译文（`i18n-es.mts`、`i18n-zh.mts` 保存其他语言，在发布前的翻译批次中补全）。涉及：目录中的 `label`、属性的 `label`、显示的引脚名称、仿真控件的文字、故障信息。用户读到的一切都要经过它。`npm run verify:i18n` 会报告孤立的键。

### 8. 测试文件

每个新元件都有**两个**测试：一个 Arduino（`<type>-uno`）和一个 Pico（`<type>-pico`）。它们不是手写的：电路在 [`testkablix/_spec.mjs`](../../testkablix/_spec.mjs) 中描述（该类型的已知引脚写在 `PART_PINS` 中，然后是一个 `test({ name, board, ext, parts, wires, code })` 块），再生成：

```bash
node testkablix/_generate.mjs diode-uno diode-pico
```

> **务必指定要生成的测试。** 不带参数时，`_generate.mjs` 会根据 spec 重写文件夹中的**所有**文件——而有好几个 `.ino`/`.py` 在生成后被手工修改过。同样，已经调整过布局的测试电路会保留 spec 中的 `x`/`y`：重做测试不会重新排布电路。

在 `testkablix/README.md` 中加上该元件的一行；如果行为适合，再加一个自动检查：`scripts/verify-*.mjs` 脚本会在无头 Chrome 中渲染真实的编辑器并测量结果（`npm run verify:transistor`、`verify:motor`、`verify:capacitor`……）。

### 9. 帮助页

必须提供，**法文和英文**各一份：`docs/fr/composants/<type>.md` 和 `docs/en/composants/<type>.md`，至少带一张插图（`docs/es/` 和 `docs/zh/` 版本随翻译批次提供）。插图通过截取真实元素生成，绝不用手工截图：

```bash
node scripts/_capture-part.mjs diode
```

该脚本在无头 Chrome 中以透明背景渲染元素，并写出 `docs/img/composants/<type>.webp`。需要先在其 `PARTS` 表中描述要展示的变体（模块、标签、属性，元件窄而高时还要给出输出宽度）。随后 `npm run verify:docs` 会检查法文/英文是否对应、插图是否存在，以及目录中是否有类型缺少帮助页。

### 10. 交付

```bash
npm run typecheck
npm run build
npm run verify:all
```

然后是仓库的固定流程：更新 `todo.md`（版本号写在其条目**上方**），在 `package.json` 中递增版本（`年.月.增量`），提交，推送。`.vsix` 只在有要求时才构建。

---

## 借助 AI

具备代理能力的 AI（例如 Claude Code）能很好地完成第 2 到第 9 步：这些都是机械性的步骤，有现成文件作为范例。它**不做**第 1 步——绘图——也**不会**猜出预期的电气行为。

### 它已经知道的

仓库根目录的 `CLAUDE.md` 文件描述了各项约定（`Composants2D.svg` 图纸、共用封装、必需的测试、必需的帮助页、代码风格）。因此，读取仓库的 AI 一开始就掌握了规则：无需在请求中重复。

### 您必须告诉它的

以下五点在代码中无处可寻：

1. 您刚在 `Composants2D.svg` 中绘制的**确切组名**——该文件中还有进行中的作品，不能被误取。
2. **仿真行为**，用平实的话说明：“二极管只从 A 到 K 导通，损失 `vf`”，“超过额定电压 1.5 倍电机就会烧毁”，“没有续流二极管晶体管就会击穿”。没有这句话，AI 会编造一个看似合理却错误的模型。
3. 检查器中显示的**属性**，包括单位、范围和默认值。
4. 对于共用封装：**上面写什么**（每个换行一行）以及**带哪个内部原理图**。
5. 您希望在**测试电路**中看到什么——否则它会选一个看似合理的，需要您自己审阅。

### 请求模板

```text
为 Kablix 添加元件 <名称>。图形及其内部原理图 <名称>-interne
在 Composants2D.svg 中。

引脚：<每个引脚的列表和作用>。
属性：<名称、单位、范围、默认值>。
仿真：<用一两句话描述行为，包括故障>。

完成整条流程：提取、元素、目录、位号前缀、内部原理图、仿真模型、
法文/英文翻译、测试 <名称>-uno 和 <名称>-pico（生成而非手写）、
法文 + 英文帮助页及其截取的插图。然后执行 typecheck、build、verify:all。
```

指出一个已集成的相近元件（两引脚元件用 `diode`，共用封装用 `transistor`，带故障的执行器用 `moteur-dc`）：“照二极管那样做”能省去很多来回沟通。

### 需要复查的内容

| 检查项 | 原因 |
| --- | --- |
| `pinInfo` 的位置 | 抄错一位数字，元件的所有连接都会偏移。 |
| 仿真模型 | 这是 AI 唯一可能产出既自洽**又**错误结果的地方。 |
| 重新生成的测试文件 | `git status` 只应显示本批次的测试：不带参数生成会覆盖整个文件夹。 |
| 帮助页插图 | 必须来自 `_capture-part.mjs`，而不是截图。 |
| 帮助页和信息的措辞 | 逐字直译的句子一眼就能看出来。 |

---

## 速查

- SVG 组名 = 元件的 `type` = 其帮助页的名称 = 其测试的名称。一个名称，处处通用。
- 红色焊盘的中心是连接点；一切都落在 10 px 网格上。
- 外部图形和内部原理图具有相同的引脚，顺序相同。
- 封装是共用的图形：为它着装，而不是复制它。
- 元素在 `sim.mts` 中被导入**并且**在 `catalog.mts` 中注册之前，什么都不会显示。
- 两个测试（Uno + Pico）和两份帮助页（法文 + 英文）：必不可少。
- 不带参数的 `_generate.mjs` 会覆盖整个测试文件夹。
