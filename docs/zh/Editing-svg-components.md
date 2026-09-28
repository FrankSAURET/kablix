# 编辑元件的 SVG（及其内部原理图）

本指南说明 **如何自己修改 Kablix 元件的 SVG 图形**，以及 **内部原理图如何工作 / 如何修改**（选中元件时以半透明方式显示的内部接线）。

> 如果你要这样做，想必有充分的理由。请把修改后的版本发给我，或提交发布请求。
---

## 1. 两类元件

| 类别 | SVG 图形 | 用户可以编辑吗？ |
| --- | --- | --- |
| **内置元件**（`@wokwi/elements`：Uno、LED、电阻…） | 位于 `node_modules/@wokwi/elements` 包中 | 不能直接编辑（只读）— 见 §4 |
| **自定义元件**（`.kablix-part.json`） | JSON 文件中的 `svg` 字段 | **可以**，随意修改 |

因此，掌控图形最简单的方法是通过 **自定义元件**：新建一个，或者导出一个现有元件，以它为基础修改。

---

## 2. 黄金法则：10 px 网格

所有引脚都必须落在 **10 px 网格** 上（= 0.1″，即面包板孔距和画布网格的间距）。否则元件无法整齐地插上。

- 使用 **网格为 10 px 的 SVG 文档**。
- 把每个连接点（`pins[].x` / `pins[].y`）放在 10 的倍数上。
- `x`/`y` 以 **像素为单位，相对于 `<svg>` 标签的左上角**（因此取决于 `width`/`height` 和 `viewBox`）。

> 提示：`@wokwi/elements` 的开发板使用 9.6 px 的物理间距；Kablix 会自动缩放它们（`pinScale = 10/9.6`，见 `catalog.mts`）。对于 **自定义** 元件，请直接按 10 px 间距绘制。

---

## 3. 编辑自定义元件的 SVG

### a. 获取一个基础

- 元件栏 → **⇪ 导入 (.json)** 一个现有文件，或者
- **+ 创建元件** 按钮（元件栏）→ 内置编辑器，或者
- 从 [`parts/`](../../parts) 文件夹中的参考示例开始（`hc-sr04.kablix-part.json`）。

一个 `.kablix-part.json` 看起来像这样：

```json
{
  "label": "我的特殊 LED",
  "kind": "led",
  "svg": "<svg width=\"40\" height=\"56\" xmlns=\"http://www.w3.org/2000/svg\">…</svg>",
  "pins": [
    { "name": "A", "x": 10, "y": 50 },
    { "name": "K", "x": 30, "y": 50 }
  ],
  "pinRoles": { "A": "plus", "C": "minus" },
  "attrs": {}
}
```

（完整格式：见内置帮助中的 *元件文件格式* 一节，或 [`docs/zh/USAGE.md`](USAGE.md)。）

### b. 编辑图形

两种方法：

1. **手工（文本）**：`svg` 字段是一个 SVG 字符串。修改颜色（`fill`、`stroke`）、形状（`rect`、`circle`、`path`）… 记得 **转义引号**（`\"`），因为 SVG 位于 JSON 字符串中。

2. **在 Inkscape / SVG 编辑器中**：
   - 把文档设置为 10 px 网格；
   - 绘制元件，把引脚放在网格上；
   - **文件 → 另存为 → 普通 SVG**；
   - 打开 `.svg`，把整个 `<svg>…</svg>` 内容复制成 **一行**，（转义后）粘贴到 JSON 的 `svg` 字段中。

### c. 绘图限制

- 给出合理的 `width`/`height`（40 到 200 px）— 这就是它在屏幕上的大小。可以在 Kablix 中数一数类似元件占几个格子（10 px）。
- **避免使用 `<style>` 和脚本**；尽量使用表现属性（`fill`、`stroke`、`stroke-width`…）。这样在导出电路图 SVG 时它们能保留下来。
- 在声明每个 `pin` 的位置画一个可见的焊盘（小圆），方便定位 — 连接点始终是 `(x, y)` 的 **中心**。

### d. 重新导入

元件栏 → **⇪ 导入 (.json)**。元件（★）会出现，可以直接放置。要精细调整，**+ 创建 / 编辑** 会打开编辑器：预览可以缩放（−/+），每个引脚都有可直接 **编辑的 X / Y 字段**。

---

## 4. 内置元件 (@wokwi/elements) 怎么办？

它们的 SVG 位于 `node_modules/@wokwi/elements/dist/esm/*-element.js`（MIT 许可证），并在 **编译时嵌入**：无法在界面中修改。两种选择：

- **推荐**：把变体重新做成 **自定义元件**（§3），用它来代替。
- **高级**（需要重新编译）：Pico 开发板是一个 “自有” 元素（[`src/webview/composants/pico-board.mts`](../../src/webview/composants/pico-board.mts)），它以 Frank 的图形为基础，加上边距和引脚名称。要制作自己的内置元素，可以参照这个模型。

---

## 5. 编辑内部原理图（K 视图）

**内部原理图** 是选中元件并单击 **K** 按钮时，以半透明方式（白色背景上）显示的接线，或者（对于微控制器开发板）显示的引脚图。它 **不** 保存在 `.kablix-part.json` 中：它由 **代码生成**，位于 [`src/webview/diagram/internal-wiring.mts`](../../src/webview/diagram/internal-wiring.mts)（修改它 = 重新编译扩展）。

### 原理

- 每种元件类型一个函数（`led`、`resistor`、`buzzer`、`led-bar`、`7segment`、`pushbutton`…）。
- 在 `internalWiringSvg(kind, pins, attrs)` 中按 **`kind`** 分派。
- 线条与 **`pinInfo` 中的引脚处于同一坐标系**：因此会自动跟随元件的旋转和翻转。

### 提供的工具

```ts
line(a, b)                 // 两点 {x,y} 之间的线段
dot(p, r?)                 // 黑色焊点（节点）
mid(a, b)                  // [a,b] 的中点
diode(from, to, catEnd)    // 二极管符号 A→K（catEnd 时竖线在 `to` 一侧）
find(pins, 'NAME')         // 按名称找到引脚的位置 {x,y}（找不到则为 null）
```

### 添加 / 修改原理图

1. 编写一个函数 `myComponent(pins, attrs?): string | null`，返回一段 SVG 片段（用 `line`/`dot`/`diode` 组合而成），缺少所需引脚时返回 `null`（`find` 返回 `null`）。
2. 在 `internalWiringSvg` 的 `switch` 中添加一个 `case '<kind>':`。
3. 重新编译（`npm run build`）。该 `kind` 的元件上会自动出现 K 按钮（参见 `editor.mts`、`internalWiringSvg(...)`）。

> 示例：`sevenSegment(pins, attrs)` 读取 `attrs.common`（`cathode`/`anode`），把 8 个二极管朝向公共端 — 因此原理图可以 **随元件的某个属性而变化**。

---

## 6. 小结

| 我想要… | 在哪里修改 |
| --- | --- |
| 修改自定义元件的 **图形** | `.kablix-part.json` 的 `svg` 字段（§3） |
| 按 10 px 间距添加 **引脚** | JSON 中的 `pins` 数组（§2） |
| 修改 **内置** 元件 | 重新做成自定义版本（§4） |
| 修改 **内部原理图**（K 视图） | `src/webview/diagram/internal-wiring.mts`（§5） |
