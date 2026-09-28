// Dictionnaire chinois simplifié de la webview : clé = chaîne source anglaise (voir
// i18n.mts). Mêmes clés que le dictionnaire français.

export const ZH: Record<string, string> = {
  'Ready':
    '就绪',
  'Stopped':
    '已停止',
  'Running…':
    '运行中…',
  'Compiling…':
    '正在编译…',
  'Starting MicroPython… (a few seconds)':
    '正在启动 MicroPython…（需要几秒钟）',
  'Starting REPL…':
    '正在启动 REPL…',
  'Restarting in debug mode…':
    '正在以调试模式重新启动…',
  'REPL ready — type your commands in the console':
    'REPL 已就绪 — 请在控制台中输入命令',
  'Board: {0}':
    '开发板：{0}',
  'Error: {0}':
    '错误：{0}',
  'Wokwi project loaded':
    '已加载 Wokwi 项目',
  'Wokwi project loaded ({0} unsupported part(s) ignored)':
    '已加载 Wokwi 项目（忽略了 {0} 个不支持的元件）',
  'Paused':
    '已暂停',
  'Pause':
    '暂停',
  'Pause - resume the simulation':
    '暂停 / 继续仿真',
  'Resume':
    '继续',
  'Reset':
    '已复位',
  'Line {0}':
    '第 {0} 行',
  'Slowed down: {0}× real time':
    '已减速：{0}× 实时',
  'The page cannot keep up with the simulation.':
    '页面跟不上仿真速度。',
  'The emulated processor is at its limit: this program computes without ever pausing.':
    '模拟的处理器已达极限：该程序一直在计算，从不停顿。',
  'Flyback diode is reversed':
    '二极管接反了',
  'A flyback diode is required':
    '必须加续流二极管',
  'Coil voltage too low: the relay does not pull in':
    '线圈电压过低：继电器无法吸合',
  'The supply cannot deliver the coil current':
    '电源无法提供线圈电流',
  'The supply cannot deliver the motor current':
    '电源无法提供电机电流',
  'Motor overvoltage: it burned out':
    '过压：电机已烧毁',
  'Motor voltage too low: it does not turn':
    '电压过低：电机不转',
  'Diode reversed':
    '二极管接反了',
  'A relay coil is an inductor: when the current is cut it sends back a surge that destroys the driving transistor. The flyback diode absorbs it — it is not optional.':
    '继电器线圈是电感：切断电流时会产生反向高压，损坏驱动三极管。续流二极管用来吸收它 — 这不是可选项。',
  'Coil voltage too low: this relay does not pull in. Supply the coil at its rated voltage.':
    '线圈电压过低：该继电器无法吸合。请按额定电压为线圈供电。',
  'Too little voltage to overcome the motor friction: the rotor stays stalled and the winding heats up. Supply it at its rated voltage, or cut the losses in series with it.':
    '电压太低，无法克服电机的摩擦：转子卡住不动，绕组发热。请按额定电压供电，或减小与其串联的损耗。',
  'The supply cannot deliver the coil current: raise its maximum current, or share fewer coils on the same source.':
    '电源无法提供线圈电流：请提高其最大电流，或在同一电源上少接几个线圈。',
  'This LED burned out: with no series resistor (or far too small a one) the current goes past what the junction can take.':
    '这个 LED 烧坏了：没有串联电阻（或电阻太小），电流超过了 PN 结的承受能力。',
  'This capacitor broke down: the voltage across it went past its rated working voltage. Pick one rated well above the supply voltage.':
    '这个电容击穿了：其两端电压超过了额定工作电压。请选用额定电压远高于电路电压的电容。',
  'This board burned out: the V+ servo terminal takes 5 V, no more. Beyond 5.5 V the chip is destroyed.':
    '这块板烧坏了：舵机 V+ 端子只能接 5 V，不能更高。超过 5.5 V 芯片就会损坏。',
  'This motor burned out: it was fed more than 1.5 times its rated voltage. Its windings do not take that.':
    '这个电机烧坏了：它得到的电压超过了额定电压的 1.5 倍。其绕组承受不了。',
  'This transistor was destroyed: a motor is a coil, and cutting its current sends back a surge. A flyback diode across the motor absorbs it — it is not optional.':
    '这个三极管损坏了：电机是一个线圈，切断其电流会产生反向高压。在电机两端并联续流二极管来吸收它 — 这不是可选项。',
  'The supply cannot deliver the current this motor draws: a board pin is far too weak for a motor. Use a power supply and a transistor.':
    '电源无法提供该电机所需的电流：开发板的引脚远远不够驱动电机。请使用电源和三极管。',
  'Hall sensor is not powered':
    '霍尔传感器未供电',
  'This sensor is not powered: V+ must reach a supply rail (5 V / 3V3 / V+ of a supply) and GND a ground.':
    '该传感器未供电：V+ 必须接到电源轨（5 V / 3V3 / 电源的 V+），GND 接地。',
  'Hall sensor output is shorted to the supply':
    '霍尔传感器输出与电源短路',
  'The output is wired straight to the supply rail: when the sensor switches it would short the supply. Put a pull-up resistor (10 kΩ) in between.':
    '输出直接接在电源轨上：传感器翻转时会使电源短路。请在中间串一个上拉电阻（10 kΩ）。',
  'The Hall sensor output needs a pull-up':
    '霍尔传感器输出需要上拉电阻',
  'The output is open drain: it can only pull down to ground, never up. Add a pull-up resistor to VCC, or turn on the internal pull-up of the board pin (INPUT_PULLUP / Pin.PULL_UP).':
    '该输出为开漏：只能拉低到地，不能拉高。请加一个到 VCC 的上拉电阻，或打开开发板引脚的内部上拉（INPUT_PULLUP / Pin.PULL_UP）。',
  'Incompatible supply voltage':
    '电源电压不兼容',
  'Incompatible supply voltage: this chip is fed below the minimum of its family, so it does nothing. Check the supply against the family printed on the package.':
    '电源电压不兼容：该芯片的供电低于其系列的最低值，因此不工作。请对照封装上印的系列检查电源。',
  'This chip was destroyed: it was fed above the maximum supply voltage of its family. The family printed on the package sets that limit.':
    '该芯片已损坏：供电超过了其系列的最高电压。这个上限由封装上印的系列决定。',
  'Engine':
    '引擎',
  'Rendering':
    '渲染',
  'Browser':
    '浏览器',
  'Components':
    '元件',
  'Search a component…':
    '搜索元件…',
  'No component matches this search.':
    '没有符合搜索条件的元件。',
  'Recently used':
    '最近使用',
  'Show recently used':
    '显示最近使用',
  'Hide recently used':
    '隐藏最近使用',
  'R':
    'R',
  'Component help':
    '元件帮助',
  'Open the help for this part':
    '打开该元件的帮助',
  'Expand all categories':
    '展开所有类别',
  'Collapse all categories':
    '折叠所有类别',
  'Show the component library':
    '显示元件库',
  'Collapse the component library':
    '折叠元件库',
  'Show the properties panel':
    '显示属性面板',
  'Collapse the properties panel':
    '折叠属性面板',
  'Auto (accordion)':
    '自动（手风琴）',
  'Folding mode':
    '折叠模式',
  'All components':
    '所有元件',
  'Alphabetical':
    '按字母顺序',
  'By category':
    '按类别',
  'Boards':
    '开发板与面包板',
  'Displays & LEDs':
    '显示器与 LED',
  'Controls':
    '控制器件',
  'Sensors':
    '传感器',
  'Actuators':
    '执行器',
  'Systems':
    '系统',
  'Instruments':
    '测量仪器',
  'Misc':
    '其他',
  'Passive':
    '无源器件',
  'Custom parts':
    '自定义元件',
  '+ Create a part':
    '+ 创建元件',
  '⇪ Import (.json)':
    '⇪ 导入 (.json)',
  'Click: place on canvas — double-click: edit the model':
    '单击：放到画布上 — 双击：编辑模型',
  'Export this part (.json)':
    '导出该元件 (.json)',
  'Export this part (.kompix)':
    '导出该元件 (.kompix)',
  'Delete this part model':
    '删除该元件模型',
  'Import failed: {0}':
    '导入失败：{0}',
  'invalid JSON.':
    'JSON 无效。',
  'missing "label" field.':
    '缺少 “label” 字段。',
  'missing or invalid "svg" field.':
    '“svg” 字段缺失或无效。',
  'missing "pins" field.':
    '缺少 “pins” 字段。',
  'each pin needs name, x and y.':
    '每个引脚都需要 name、x 和 y。',
  'Delete':
    '删除',
  'Right-click drag to move':
    '按住右键拖动以移动',
  '⚠ Simulation running: wiring is locked.':
    '⚠ 仿真运行中：接线已锁定。',
  '⚠ Simulation running: editing is disabled.':
    '⚠ 仿真运行中：已禁用编辑。',
  '⚠ Simulation running (speed {0} %): editing is disabled.':
    '⚠ 仿真运行中（速度 {0} %）：已禁用编辑。',
  'Simulation thread stopped — restarting on the main thread…':
    '仿真线程已停止 — 正在主线程上恢复…',
  'Drag to move — Ctrl: H/V alignment':
    '拖动以移动 — Ctrl：水平/垂直对齐',
  '+ or − to rotate the part':
    '按 + 或 − 旋转元件',
  '+ or − to rotate the parts':
    '按 + 或 − 旋转这些元件',
  'Drag a part to move the whole selection.':
    '拖动一个元件会移动整个选择。',
  'Ctrl+C / Ctrl+V: copy / paste, from one project to another too — Ctrl+D: duplicate.':
    'Ctrl+C / Ctrl+V：复制 / 粘贴，也可在项目之间 — Ctrl+D：复制一份。',
  '{0} parts selected':
    '已选择 {0} 个元件',
  '{0} × {1} — shared properties':
    '{0} × {1} — 共同属性',
  'Changing a property applies to the whole selection.':
    '修改属性将应用于整个选择。',
  'Delete the selection':
    '删除所选内容',
  'Right-click to move it.':
    '右键单击以移动。',
  'Reset the view (zoom 100%)':
    '重置视图（缩放 100%）',
  'Flip':
    '翻转',
  'Orientation':
    '方向',
  'Rotate left (−90°)':
    '向左旋转 (−90°)',
  'Rotate right (+90°)':
    '向右旋转 (+90°)',
  'Flip horizontally':
    '水平翻转',
  'Flip vertically':
    '垂直翻转',
  'Show/hide the internal wiring':
    '显示/隐藏内部接线',
  'Show/hide the full pinout':
    '显示/隐藏完整引脚图',
  'Cross handle: move a corner.':
    '十字手柄：移动拐点。',
  'Ctrl: horizontal/vertical alignment.':
    'Ctrl：水平/垂直对齐。',
  'Double-click the wire: add a corner.':
    '双击导线：添加拐点。',
  'Click a corner then Del: remove it.':
    '单击拐点后按 Del：删除它。',
  'Cross handle: move a corner (hold Ctrl to align it with its neighbours).':
    '十字手柄移动拐点（按住 Ctrl 与相邻拐点对齐）。',
  'Drag a straight segment: it moves sideways, the neighbouring segments follow.':
    '拖动一段直线：它会侧向移动，相邻线段随之调整。',
  'Segment move snaps to the grid; hold Ctrl to move it freely.':
    '线段吸附网格；按住 Ctrl 可自由移动。',
  'Drag to move — Ctrl: H/V alignment — Del: remove this corner':
    '拖动以移动 — Ctrl：水平/垂直对齐 — Del：删除此拐点',
  'No file':
    '未关联代码',
  'Code file to run / debug — click to change, double-click to open':
    '要运行 / 调试的代码文件 — 单击更换，双击打开',
  'Code file: {0} — click to change, double-click to open':
    '代码文件：{0} — 单击更换，双击打开',
  'Code file {0} not found on this computer — click to choose the file to run':
    '在本机找不到代码文件 {0} — 单击选择要运行的文件',
  'Code file {0} has been deleted — click to choose the file to run':
    '代码文件 {0} 已被删除 — 单击选择要运行的文件',
  'Current project':
    '当前项目',
  'Current project: {0}':
    '当前项目：{0}',
  'Project {0} has been deleted from disk — save it again to keep it':
    '项目 {0} 已从磁盘删除 — 请重新保存以保留它',
  'Unsaved changes':
    '有未保存的修改',
  'Properties':
    '属性',
  'Click a part or a wire to edit it. Wiring: click a pin, add corners by clicking the background, finish on a pin (Esc: cancel).':
    '单击元件或导线进行编辑。接线：单击一个引脚，单击背景添加拐点，在另一个引脚上结束（Esc：取消）。',
  'Wire {0} → {1}':
    '导线 {0} → {1}',
  'Node {0}':
    '节点 {0}',
  'Select every wire of this node':
    '选择该节点的所有导线',
  'Color (Dupont cables)':
    '颜色（杜邦线）',
  'Delete the wire':
    '删除导线',
  'Delete the part':
    '删除元件',
  'No editable property for this part.':
    '该元件没有可编辑的属性。',
  'Suffixes allowed: p n µ m k M G (e.g. 2.2k)':
    '允许的后缀：p n µ m k M G（例如 2.2k）',
  'no':
    '否',
  'Wokwi help':
    'Wokwi 帮助',
  'Open the online Wokwi documentation for this part':
    '打开该元件的 Wokwi 在线文档',
  'Available online only':
    '仅在线可用',
  'Create a part':
    '创建元件',
  'Edit the part':
    '编辑元件',
  'Name':
    '名称',
  'My sensor':
    '我的传感器',
  'Simulation model':
    '仿真模型',
  'SVG drawing':
    'SVG 图形',
  'Click the preview to add a connection point.':
    '单击预览图以添加连接点。',
  'Preview':
    '预览',
  'External view':
    '外部视图',
  'Internal view':
    '内部视图',
  'Load an SVG…':
    '加载 SVG…',
  'Overlay':
    '叠加',
  'Remove the internal view':
    '移除内部视图',
  'Same scale as the external drawing; the green anchor aligns both views.':
    '与外部图形比例相同；绿色锚点用于对齐两个视图。',
  'Fit the drawing in the view':
    '使图形适应视图',
  'Import simulation models (.json)':
    '导入仿真模型 (.json)',
  'Imported models':
    '已导入的模型',
  '{0} model(s) available.':
    '有 {0} 个模型可用。',
  'Markers: red circle (opacity 0.8) = pin, green circle (0.5) = alignment anchor, red text = pin name. They are removed from the final part.':
    '标记：红色圆（不透明度 0.8）= 引脚，绿色圆（0.5）= 对齐锚点，红色文字 = 引脚名称。它们会从最终元件中移除。',
  'invalid SVG file.':
    'SVG 文件无效。',
  '{0} pin(s) detected.':
    '检测到 {0} 个引脚。',
  'No red circle found — click the preview to place the pins.':
    '未找到红色圆 — 请单击预览图放置引脚。',
  'Green anchor missing in one of the two views — top-left corners aligned.':
    '两个视图之一缺少绿色锚点 — 已按左上角对齐。',
  'Internal view aligned on the green anchor.':
    '内部视图已按绿色锚点对齐。',
  'Alignment anchor':
    '对齐锚点',
  'No internal view — load an SVG (optional).':
    '没有内部视图 — 可加载一个 SVG（可选）。',
  'Part parameters':
    '元件参数',
  'Add a parameter (usable in the characteristic)':
    '添加参数（可用于特性表达式）',
  'Delete this parameter':
    '删除此参数',
  'name':
    '名称',
  'label':
    '标签',
  'value':
    '值',
  'Simulation control':
    '仿真控件',
  'Add a simulation control (slider, switch)':
    '添加仿真控件（滑块、开关）',
  'Remove the simulation control':
    '移除仿真控件',
  'None':
    '无',
  'Slider (analog output)':
    '滑块（模拟输出）',
  'Switch (digital output)':
    '开关（数字输出）',
  'Control label':
    '控件标签',
  'Unit':
    '单位',
  'Min':
    '最小',
  'Max':
    '最大',
  'Step':
    '步长',
  'Characteristic (V)':
    '特性 (V)',
  'linear (min→max)':
    '线性（最小→最大）',
  'Output voltage in volts — empty = linear ramp. Variables: x{0}.':
    '输出电压（伏）— 留空 = 线性斜坡。变量：x{0}。',
  'Valid expression. Variables: x{0}.':
    '表达式有效。变量：x{0}。',
  'Invalid expression: {0}':
    '表达式无效：{0}',
  'Connection points':
    '连接点',
  'No point — click the preview.':
    '没有连接点 — 请单击预览图。',
  'Delete this point':
    '删除此点',
  'Pin for role "{0}"':
    '“{0}” 角色的引脚',
  'Maximum collector-emitter voltage':
    '最大集电极-发射极电压',
  'Current gain: Ic = β × Ib once saturated':
    '电流增益：饱和时 Ic = β × Ib',
  'Maximum collector current':
    '最大集电极电流',
  'Free drawing':
    '自由绘制',
  'Draws the package in the external view, pins included':
    '在外部视图中绘制封装，包括引脚',
  'Package “{0}” drawn — {1} pin(s).':
    '已绘制封装 “{0}” — {1} 个引脚。',
  'Symbol':
    '符号',
  'Draws the symbol in the internal view':
    '在内部视图中绘制符号',
  'Open in the SVG editor…':
    '在 SVG 编辑器中打开…',
  'Opens the drawing in the SVG editor of your choice (asked once, then remembered); it is reloaded here at every save.':
    '用你选择的 SVG 编辑器打开图形（只询问一次并记住）；每次保存后都会在这里重新加载。',
  'Drawing opened in your editor — it is reloaded at every save.':
    '图形已在编辑器中打开 — 每次保存后都会重新加载。',
  'Drawing updated from the external editor.':
    '已根据外部编辑器更新图形。',
  'Drag to resize':
    '拖动以调整大小',
  'Cancel':
    '取消',
  'Save':
    '保存',
  'Arduino Uno':
    'Arduino Uno',
  'Arduino Nano':
    'Arduino Nano',
  'Arduino Mega 2560':
    'Arduino Mega 2560',
  'Raspberry Pi Pico':
    'Raspberry Pi Pico',
  'Raspberry Pi Pico W':
    'Raspberry Pi Pico W',
  'Raspberry Pi Pico 2':
    'Raspberry Pi Pico 2',
  'Raspberry Pi Pico 2 W':
    'Raspberry Pi Pico 2 W',
  'LED':
    'LED',
  'Buzzer':
    '蜂鸣器',
  'NeoPixel':
    'NeoPixel',
  'DIP switch ×8':
    '8 位拨码开关',
  'TFT display (ILI9341, SPI)':
    'TFT 显示屏 (ILI9341, SPI)',
  'microSD card (SPI)':
    'microSD 卡 (SPI)',
  'Breadboard':
    '面包板',
  'Grove Shield (Pico)':
    'Grove 扩展板 (Pico)',
  'Grove VCC rail':
    'Grove 端口供电 (VCC)',
  '3.3 V':
    '3.3 V',
  '5 V (VBUS)':
    '5 V (VBUS)',
  'RGB LED':
    'RGB LED',
  'Pushbutton':
    '按钮',
  'Resistor':
    '电阻',
  'Mounting':
    '安装方式',
  'Horizontal':
    '水平',
  'Vertical':
    '垂直',
  'Diode':
    '二极管',
  'Threshold voltage (V)':
    '阈值电压 (V)',
  'Capacitor':
    '电容',
  'Capacitor (film)':
    '电容（薄膜）',
  'Capacitor (tantalum)':
    '电容（钽）',
  'Capacitor (electrolytic)':
    '电容（电解）',
  'Non-polarized':
    '无极性',
  'Polarized':
    '有极性',
  'Plastic':
    '塑料',
  'Tantalum':
    '钽',
  'Electrolytic':
    '电解',
  'Nominal value (F)':
    '标称值 (F)',
  'Max voltage (V)':
    '最大电压 (V)',
  'Nominal value (Ω)':
    '标称值 (Ω)',
  'Power rating (W)':
    '额定功率 (W)',
  'Film (¼ W)':
    '膜式 (¼ W)',
  'Power, finned aluminium':
    '功率型，带散热片铝壳',
  'Power, ceramic':
    '功率型，陶瓷',
  'Potentiometer':
    '电位器',
  'Slide potentiometer':
    '滑动电位器',
  'Trimmer potentiometer':
    '微调电位器',
  '7-segment display':
    '7 段数码管',
  'LED bar graph':
    'LED 条形显示',
  'Slide switch':
    '拨动开关',
  'Analog joystick':
    '模拟摇杆',
  'Light sensor':
    '光线传感器',
  'Sensitivity (%)':
    '灵敏度 (%)',
  'PIR motion sensor':
    '人体红外传感器 (PIR)',
  'Tilt sensor':
    '倾斜传感器',
  'Hall effect sensor':
    '霍尔效应传感器',
  'V+ pin':
    'V+ 引脚',
  'GND pin':
    'GND 引脚',
  'S (output) pin':
    'S（输出）引脚',
  'Trigger distance (mm)':
    '触发距离 (mm)',
  'Servo motor':
    '舵机',
  'Spider leg':
    '蜘蛛腿',
  'Spider robot':
    '蜘蛛机器人',
  'Pulse at 0° (µs)':
    '0° 时的脉宽 (µs)',
  'Pulse at 180° (µs)':
    '180° 时的脉宽 (µs)',
  'Rotation time (s/turn)':
    '旋转时间 (s/圈)',
  'Configure the 16-servo board':
    '配置 16 路舵机板',
  'Wire the servos':
    '舵机接线',
  'Reverse the servos':
    '反转舵机',
  'Set the servo zeros':
    '设置舵机零位',
  'Servo parameters':
    '舵机参数',
  'Type the output each servo is plugged into: 0 to 15, marked 1 to 16 on the board. The same channel cannot be used twice, and a servo left empty does not move.':
    '填写每个舵机所接的输出：0 到 15，板上标为 1 到 16。同一通道不能用两次，留空的舵机不会动。',
  'Channel {0} to {1} (marked {2} to {3} on the board).':
    '通道 {0} 到 {1}（板上标为 {2} 到 {3}）。',
  'Channel {0} is already used by another servo.':
    '通道 {0} 已被另一个舵机占用。',
  '{0} servo(s) have no channel: fill in the "Wire the servos" drawer — 0 to 15, marked 1 to 16 on the board. Without it, these joints do not move.':
    '有 {0} 个舵机没有通道：请填写 “舵机接线” 一栏 — 0 到 15，板上标为 1 到 16。否则这些关节不会动。',
  'Channel {0} is wired to two servos at once.':
    '通道 {0} 同时接了两个舵机。',
  'Front-left coxa channel':
    '左前基节通道',
  'Front-left patella channel':
    '左前膝节通道',
  'Front-right coxa channel':
    '右前基节通道',
  'Front-right patella channel':
    '右前膝节通道',
  'Rear-left coxa channel':
    '左后基节通道',
  'Rear-left patella channel':
    '左后膝节通道',
  'Rear-right coxa channel':
    '右后基节通道',
  'Rear-right patella channel':
    '右后膝节通道',
  'Reverse the coxa servo':
    '反转基节舵机',
  'Reverse the patella servo':
    '反转膝节舵机',
  'Reverse the front-left coxa':
    '反转左前基节',
  'Reverse the front-left patella':
    '反转左前膝节',
  'Reverse the front-right coxa':
    '反转右前基节',
  'Reverse the front-right patella':
    '反转右前膝节',
  'Reverse the rear-left coxa':
    '反转左后基节',
  'Reverse the rear-left patella':
    '反转左后膝节',
  'Reverse the rear-right coxa':
    '反转右后基节',
  'Reverse the rear-right patella':
    '反转右后膝节',
  'Coxa angle at 0° (horn offset)':
    '基节 0° 时的角度（舵盘偏置）',
  'Patella angle at 0° (horn offset)':
    '膝节 0° 时的角度（舵盘偏置）',
  'Front-left coxa angle at 0°':
    '左前基节 0° 时的角度',
  'Front-left patella angle at 0°':
    '左前膝节 0° 时的角度',
  'Front-right coxa angle at 0°':
    '右前基节 0° 时的角度',
  'Front-right patella angle at 0°':
    '右前膝节 0° 时的角度',
  'Rear-left coxa angle at 0°':
    '左后基节 0° 时的角度',
  'Rear-left patella angle at 0°':
    '左后膝节 0° 时的角度',
  'Rear-right coxa angle at 0°':
    '右后基节 0° 时的角度',
  'Rear-right patella angle at 0°':
    '右后膝节 0° 时的角度',
  'I²C address':
    'I²C 地址',
  'AD0 (bit 0)':
    'AD0（位 0）',
  'AD1 (bit 1)':
    'AD1（位 1）',
  'AD2 (bit 2)':
    'AD2（位 2）',
  'AD3 (bit 3)':
    'AD3（位 3）',
  'AD4 (bit 4)':
    'AD4（位 4）',
  'AD5 (bit 5)':
    'AD5（位 5）',
  'Ultrasonic sensor':
    '超声波传感器',
  'Min distance (cm)':
    '最小距离 (cm)',
  'Max distance (cm)':
    '最大距离 (cm)',
  'Air temperature (°C)':
    '空气温度 (°C)',
  'Temp/humidity sensor (DHT22)':
    '温湿度传感器 (DHT22)',
  'Temp/humidity sensor (DHT11)':
    '温湿度传感器 (DHT11)',
  'Fan':
    '风扇',
  'Rated voltage (V)':
    '额定电压 (V)',
  'Current draw (A)':
    '消耗电流 (A)',
  'DC motor':
    '直流电机',
  'No-load current (A)':
    '空载电流 (A)',
  'Transistor':
    '三极管',
  'Max Ic at least':
    'Ic 最大值至少',
  'Max Vce at least':
    'Vce 最大值至少',
  'Gain at least':
    '增益至少',
  'Any':
    '任意',
  'TO-92':
    'TO-92',
  'TO-220':
    'TO-220',
  'Matching models':
    '符合条件的型号',
  'No model matches these criteria.':
    '没有型号符合这些条件。',
  'Custom NPN':
    '自定义 NPN',
  'Custom PNP':
    '自定义 PNP',
  'Custom {0}':
    '自定义 {0}',
  'NPN Darlington':
    'NPN 达林顿',
  'PNP Darlington':
    'PNP 达林顿',
  'N-channel MOSFET':
    'N 沟道 MOSFET',
  'Max Id at least':
    'Id 最大值至少',
  'Max Vds at least':
    'Vds 最大值至少',
  'Rds(on) at most':
    'Rds(on) 至多',
  'Every characteristic stays editable':
    '所有特性仍可调整',
  'Change transistor…':
    '更换三极管…',
  'Save to my parts…':
    '保存到我的元件…',
  'Add this transistor to the library, under “Custom parts”':
    '将此三极管添加到元件库的 “自定义元件” 中',
  '“{0}” saved: you will find it in the library, under “Custom parts”.':
    '已保存 “{0}”：可在元件库的 “自定义元件” 中找到。',
  '“{0}” updated in the library, under “Custom parts”.':
    '已更新元件库 “自定义元件” 中的 “{0}”。',
  'Pinout (flat face)':
    '引脚排列（平面朝前）',
  'Pick a model, or a custom NPN/PNP to set everything yourself.':
    '选择一个型号，或选择自定义 NPN/PNP 自行设置全部参数。',
  'Transistor PN2222A (NPN)':
    '三极管 PN2222A (NPN)',
  'Transistor NPN (generic)':
    '三极管 NPN（通用）',
  'Transistor PNP (generic)':
    '三极管 PNP（通用）',
  'Package':
    '封装',
  'Emitter on pin':
    '发射极所在引脚',
  'Base on pin':
    '基极所在引脚',
  'Collector on pin':
    '集电极所在引脚',
  'Gate on pin':
    '栅极所在引脚',
  'Drain on pin':
    '漏极所在引脚',
  'Source on pin':
    '源极所在引脚',
  'Current gain (β)':
    '电流增益 (β)',
  'Vce(sat) (V)':
    'Vce(sat) (V)',
  'Rds(on) (Ω)':
    'Rds(on) (Ω)',
  'Vgs(th) (V)':
    'Vgs(th) (V)',
  'Marking':
    '印字',
  'Max Vce (V)':
    'Vce 最大值 (V)',
  'Max Ic (A)':
    'Ic 最大值 (A)',
  'Max Vds (V)':
    'Vds 最大值 (V)',
  'Max Id (A)':
    'Id 最大值 (A)',
  'Integrated circuits':
    '集成电路',
  'Model':
    '型号',
  '74 series family':
    '系列（74 系列）',
  'CD4081 quad 2-input AND gate':
    'CD4081 四路 2 输入与门',
  'CD4071 quad 2-input OR gate':
    'CD4071 四路 2 输入或门',
  'CD4070 quad 2-input XOR gate':
    'CD4070 四路 2 输入异或门',
  'CD4011 quad 2-input NAND gate':
    'CD4011 四路 2 输入与非门',
  'CD4001 quad 2-input NOR gate':
    'CD4001 四路 2 输入或非门',
  'CD40106 hex Schmitt-trigger inverter':
    'CD40106 六路施密特触发反相器',
  '74xx08 quad 2-input AND gate':
    '74xx08 四路 2 输入与门',
  '74xx32 quad 2-input OR gate':
    '74xx32 四路 2 输入或门',
  '74xx86 quad 2-input XOR gate':
    '74xx86 四路 2 输入异或门',
  '74xx00 quad 2-input NAND gate':
    '74xx00 四路 2 输入与非门',
  '74xx02 quad 2-input NOR gate':
    '74xx02 四路 2 输入或非门',
  '74xx14 hex Schmitt-trigger inverter':
    '74xx14 六路施密特触发反相器',
  'Relay OMRON G5V':
    '继电器 OMRON G5V',
  'Coil voltage (V)':
    '线圈电压 (V)',
  'Membrane keypad':
    '矩阵键盘',
  'Text LCD':
    '字符 LCD',
  'Interface':
    '接口',
  'I²C (4 wires)':
    'I²C（4 线）',
  'I²C (SDA/SCL)':
    'I²C (SDA/SCL)',
  'SPI (4 wires)':
    'SPI（4 线）',
  'Parallel (HD44780)':
    '并口 (HD44780)',
  '16 × 2':
    '16 × 2',
  '20 × 4':
    '20 × 4',
  'OLED display (SSD1306)':
    'OLED 显示屏 (SSD1306)',
  'NeoPixel matrix':
    'NeoPixel 点阵',
  'NeoPixel ring':
    'NeoPixel 灯环',
  'Pushbutton (6mm)':
    '轻触按钮 (6 mm)',
  'NTC temperature sensor':
    '温度传感器 (NTC)',
  'LDR (photoresistor)':
    '光敏电阻 (LDR)',
  'NTC thermistor':
    'NTC 热敏电阻',
  'PTC thermistor':
    'PTC 热敏电阻',
  'Resistance at 1 lx (Ω)':
    '1 lx 时的电阻 (Ω)',
  'Sensitivity coefficient (γ)':
    '灵敏度系数 (γ)',
  'Resistance at 25 °C (Ω)':
    '25 °C 时的电阻 (Ω)',
  'Beta coefficient (K)':
    'B 值 (K)',
  'Slider Tmin (°C)':
    '滑块最低温度 (°C)',
  'Slider Tmax (°C)':
    '滑块最高温度 (°C)',
  'Temp. coefficient (%/°C)':
    '温度系数 (%/°C)',
  'Gas sensor (MQ)':
    '气体传感器 (MQ)',
  'Heart-beat sensor':
    '心率传感器',
  'Flame sensor':
    '火焰传感器',
  'Sound sensor':
    '声音传感器',
  '16-channel PWM driver (PCA9685)':
    '16 路 PWM 驱动板 (PCA9685)',
  'Bench power supply':
    '实验室电源',
  'Voltage (V)':
    '电压 (V)',
  'Max current supplied (A)':
    '最大输出电流 (A)',
  'Power bank':
    '充电宝',
  'Voltage':
    '电压',
  'Current limit':
    '限流',
  'Photodiode':
    '光电二极管',
  'Phototransistor':
    '光电三极管',
  'Max irradiance (mW/cm²)':
    '最大辐照度 (mW/cm²)',
  'Resistance at max irradiance (Ω)':
    '最大辐照度时的电阻 (Ω)',
  'Dark resistance (Ω)':
    '暗电阻 (Ω)',
  'Multimeter':
    '万用表',
  'Measurement':
    '测量',
  'DC voltage':
    '直流电压',
  'DC current':
    '直流电流',
  'Current':
    '电流',
  'Oscilloscope':
    '示波器',
  'Volts/div':
    '伏/格',
  'Seconds/div':
    '秒/格',
  'Trigger edge':
    '触发沿',
  'Rising edge':
    '上升沿',
  'Falling edge':
    '下降沿',
  'Label':
    '标签',
  'The ammeter is short-circuiting the supply':
    '电流表使电源短路了',
  'In current mode the multimeter is a plain wire: put it IN SERIES, inside the branch whose current you want. Straight across the supply it shorts it out.':
    '在电流档，万用表就是一根导线：要把它 串联 在你想测电流的支路里。直接跨接在电源两端会使电源短路。',
  'Function generator':
    '信号发生器',
  'Waveform':
    '波形',
  'Frequency (Hz)':
    '频率 (Hz)',
  'Amplitude, peak-to-peak (V)':
    '峰峰值幅度 (V)',
  'DC offset (V)':
    '直流偏置 (V)',
  'Duty cycle (%)':
    '占空比 (%)',
  'Sine':
    '正弦波',
  'Triangle':
    '三角波',
  'Square':
    '方波',
  'sine':
    '正弦',
  'triangle':
    '三角',
  'square':
    '方波',
  'Simulation speed cannot be measured (engine clock)':
    '无法测量仿真速度（引擎时钟）',
  '{0}: this board cannot hear a UART reader — set the jumper to the other mode.':
    '{0}：该板听不到串口读卡器 — 请把跳线设到另一种模式。',
  'Wiring error':
    '接线错误',
  'Ref.':
    '位号',
  'Part':
    '元件',
  'Characteristics':
    '特性',
  'Value':
    '值',
  'Comment':
    '备注',
  'Color':
    '颜色',
  'Type':
    '类型',
  'Size':
    '尺寸',
  'Mini':
    '迷你',
  'Medium':
    '中',
  'Large':
    '大',
  'Flipped':
    '已翻转',
  'Value (Ω)':
    '值 (Ω)',
  'Position (%)':
    '位置 (%)',
  'Brightness (%)':
    '亮度 (%)',
  'Motion detected':
    '检测到运动',
  'Tilted':
    '已倾斜',
  'Temperature (%)':
    '温度 (%)',
  'Gas level (%)':
    '气体浓度 (%)',
  'Pulse (%)':
    '脉搏 (%)',
  'Flame detected':
    '检测到火焰',
  'Sound detected':
    '检测到声音',
  'Horn':
    '舵盘',
  'Single horn':
    '单臂舵盘',
  'Double horn':
    '双臂舵盘',
  'Cross horn':
    '十字舵盘',
  'State (0/1)':
    '状态 (0/1)',
  'Common pin':
    '公共引脚',
  'New project':
    '新项目',
  'Project saved':
    '项目已保存',
  'Category':
    '类别',
  'Submit to Kablix…':
    '提交给 Kablix…',
  'Share your component':
    '分享你的元件',
  'Export the component as .json (⇩ button next to it in the palette), then send it:':
    '将元件导出为 .json（元件库中其旁边的 ⇩ 按钮），然后发送：',
  'open a GitHub issue with the “Submit new component” template and attach the .json;':
    '使用 “Submit new component” 模板在 GitHub 上新建 issue，并附上 .json；',
  'or propose a pull request on the Kablix repository.':
    '或在 Kablix 仓库提交 pull request。',
  'Open the GitHub form':
    '打开 GitHub 表单',
  'Close':
    '关闭',
  'Hard keys (instead of membrane)':
    '硬按键（代替薄膜）',
  'All names':
    '全部名称',
  'Selected parts only':
    '仅所选元件',
  'Show part ids':
    '显示元件 id',
  'Ctrl+click to lock the position':
    'Ctrl + 单击锁定位置',
  '{0} wire(s) selected':
    '已选择 {0} 根导线',
  'Delete these wires':
    '删除这些导线',
  '{0} label(s) selected':
    '已选择 {0} 个标签',
  'Delete these labels':
    '删除这些标签',
  'Common cathode (K)':
    '共阴极 (K)',
  'Common anode (A)':
    '共阳极 (A)',
  'Digits':
    '位数',
  '1 digit':
    '1 位',
  '2 digits':
    '2 位',
  '4 digits':
    '4 位',
  'Colon (clock)':
    '冒号（时钟）',
  'Clock colon (:)':
    '时钟冒号 (:)',
  'Distance (cm)':
    '距离 (cm)',
  'Temperature (°C)':
    '温度 (°C)',
  'Humidity (%)':
    '湿度 (%)',
  'Columns':
    '列数',
  '3 columns (3×4)':
    '3 列 (3×4)',
  '4 columns (4×4)':
    '4 列 (4×4)',
  'LED (lit when A=high and K=low)':
    'LED（A=高且 K=低时点亮）',
  'Pushbutton (pulls the pin to GND)':
    '按钮（将引脚拉到 GND）',
  'Resistor (joins its two pins)':
    '电阻（连接其两个引脚）',
  'Buzzer (active when voltage across 1 and 2)':
    '蜂鸣器（1、2 之间有电压时发声）',
  'Bipolar transistor (saturated switch C→E)':
    '双极型三极管（饱和开关 C→E）',
  'Relay (coil B1/B2 switches Com from NF to NO)':
    '继电器（线圈 B1/B2 使 Com 从常闭切换到常开）',
  'Digital source (state set in Properties)':
    '数字信号源（状态在属性中设置）',
  'Analog source (value set in Properties)':
    '模拟信号源（数值在属性中设置）',
  'Decorative (no behavior)':
    '装饰（无行为）',
  'Red':
    '红',
  'Yellow':
    '黄',
  'Green':
    '绿',
  'Blue':
    '蓝',
  'Purple':
    '紫',
  'Gray':
    '灰',
  'Fuchsia':
    '品红',
  'Black':
    '黑',
  'Brown':
    '棕',
  'Orange':
    '橙',
  'White':
    '白',
  'GYR':
    '绿黄红',
  'Logic probe':
    '逻辑探头',
  'Colour':
    '颜色',
  'Amber':
    '琥珀色',
  'Dark green':
    '深绿',
  'Teal':
    '青色',
  'Pink':
    '粉红',
  '{0} — already used by another probe':
    '{0} — 已被另一个探头占用',
  'Pin {0}':
    '引脚 {0}',
  'unclipped':
    '未夹上',
  'No logic probe on the board — clip one onto a pin.':
    '电路上没有逻辑探头 — 请把一个探头夹到引脚上。',
  'No edge captured yet.':
    '尚未捕获到任何边沿。',
  'Probe not clipped: drop its tip right onto a pad.':
    '探头未夹上：请把探头尖端正好放在焊盘上。',
  'Nothing to listen to here: this point never reaches a board pin. Clip onto the signal pad.':
    '这里没有信号可听：该点没有连到开发板的任何引脚。请把探头夹到信号焊盘上。',
  'Power pad (VCC/GND): a steady level, no edge. Clip onto the signal pad.':
    '电源焊盘 (VCC/GND)：电平固定，没有边沿。请把探头夹到信号焊盘上。',
  'analog-capable pin: only 0/1 shown':
    '模拟引脚：只显示 0/1',
  'Waiting for the trigger edge…':
    '正在等待触发沿…',
  'Show hidden channels ({0})':
    '重新显示隐藏的通道（{0}）',
  'Capturing… {0} (waiting for the trigger edge)':
    '正在采集… {0}（等待触发沿）',
  'Capturing… {0}':
    '正在采集… {0}',
  'Last capture: {0} ms':
    '上次采集：{0} ms',
  'No trigger':
    '无触发',
  'No decoding':
    '无解码',
  'Bus':
    '总线',
  'none':
    '无',
  'Mode':
    '模式',
  'Format':
    '格式',
  'Sensor':
    '传感器',
  'Remove':
    '移除',
  'Remove this decoding':
    '移除此解码',
  'Active-low line: read the channel upside down (idle high).':
    '低电平有效的线路：将该通道反相读取（空闲为高电平）。',
  'Hide this channel: it keeps its capture, it just leaves the screen.':
    '隐藏此通道：采集数据保留，只是从屏幕上移走。',
  'Hide':
    '隐藏',
  'Baud':
    '波特率',
  'auto':
    '自动',
  'Tolerance %':
    '容差 %',
  'Capture full: {0} kept ({1} edges per channel). Click Restart capture to capture anew.':
    '采集已满：保留了 {0} 的数据（每通道 {1} 个边沿）。单击 “重新采集” 可再次采集。',
  'Frame start':
    '帧起始',
  'Values':
    '数值',
  'Write each bit under the signal, with a marker between bits.':
    '在信号下方写出每一位，位与位之间加标记。',
  'Bits':
    '位',
  'Invert':
    '反相',
  'Channel settings: name, invert, hide, baud rate, tolerance':
    '通道设置：名称、反相、隐藏、波特率、容差',
  'Trigger: wait for an edge on this channel, then freeze the capture on it':
    '触发：等待该通道上的一个边沿，然后在该处冻结采集',
  'Trigger on this channel: {0}. Click to change or remove it.':
    '该通道的触发：{0}。单击可更改或移除。',
  'Decoding: read a bus on this channel (I²C, SPI, UART, 1-Wire, DHT, DMX512)':
    '解码：读取该通道上的总线（I²C、SPI、UART、1-Wire、DHT、DMX512）',
  'Decoding: {0}. Click for its settings or to remove it.':
    '解码：{0}。单击查看其设置或将其移除。',
  'Marker {0}: drag it along the curves; drop it back in the names column to park it.':
    '标记 {0}：沿曲线拖动；拖回名称栏即可收起。',
  'Marker {0}: drag it onto the curves. With M1 and M2 placed, the time between them is shown and the exports keep only that span.':
    '标记 {0}：拖到曲线上。放好 M1 和 M2 后，会显示它们之间的时间，导出也只保留这段范围。',
  'Window marker {0}: drag it onto the curves. F1 and F2 frame a span set relative to the trigger: ⏮ ⏭ carry it to the same place in the frame they reach, so the same spot can be checked frame after frame.':
    '窗口标记 {0}：拖到曲线上。F1 和 F2 框出一段相对于触发点设置的范围：⏮ ⏭ 会把它带到所跳转帧的相同位置，便于逐帧检查同一处。',
  'Bring M1 and M2 back to their starting place':
    '将 M1 和 M2 放回初始位置',
  'Bring F1 and F2 back to their starting place':
    '将 F1 和 F2 放回初始位置',
  'START rep.':
    'START 重复',
  'truncated':
    '截断',
  'addr {0} {1}':
    '地址 {0} {1}',
  'framing':
    '帧错误',
  'parity':
    '校验错误',
  'checksum ✓':
    '校验和 ✓',
  'CHECKSUM ✗':
    '校验和 ✗',
  'REQUEST':
    '请求',
  'PRESENCE':
    '应答',
  '{0} %RH':
    '{0} %RH',
  'In simulation: Ctrl+click keeps it pressed.':
    '仿真时：Ctrl+单击可保持按下。',
  'Ctrl+click to lock the unstable state':
    'Ctrl+单击锁定不稳定状态',
  'No readable variable here (C: global variables only).':
    '这里没有可读取的变量（C：仅限全局变量）。',
  'ℹ Only global variables are shown':
    'ℹ 只显示全局变量',
  'In C/Arduino, declare a variable outside setup() and loop() (global) to inspect it here.':
    '在 C/Arduino 中，把变量声明在 setup() 和 loop() 之外（全局），才能在这里查看。',
  'No readable variable (define module-level variables to inspect them).':
    '没有可读取的变量（定义模块级变量才能查看）。',
  'No readable variable here.':
    '这里没有可读取的变量。',
  'ℹ Only global and static variables are shown':
    'ℹ 只显示全局变量和 static 变量',
  'In C/Arduino, a variable declared inside setup() or loop() has no fixed address. Declare it outside any function (global), or add “static” before its type, to inspect it here.':
    '在 C/Arduino 中，声明在 setup() 或 loop() 内的变量没有固定地址。请把它声明在任何函数之外（全局），或在类型前加上 “static”，才能在这里查看。',
  'Variables not readable here:':
    '这里无法读取的变量：',
  'and {0} more':
    '以及另外 {0} 个',
  'To be seen, declare variables outside any function, or add the word static in front (e.g. static int myVar = analogRead(A0);).':
    '要查看它们，请把变量声明在任何函数之外，或在前面加上 static（例如 static int myVar = analogRead(A0);）。',
  'Show the hidden variables':
    '显示隐藏的变量',
  'Click to hide':
    '单击隐藏',
  'Show this variable again':
    '重新显示该变量',
  'Show all again':
    '全部重新显示',
  'No hidden variable — click the 👁 of a variable to hide it.':
    '没有隐藏的变量 — 单击变量的 👁 即可隐藏。',
  'All variables are hidden (click “Variables” to show them again).':
    '所有变量都已隐藏（单击 “Variables” 重新显示）。',
  'Display of “{0}”':
    '“{0}” 的显示方式',
  'Click to change the display base':
    '单击更改显示进制',
  'Binary':
    '二进制',
  'Hexadecimal':
    '十六进制',
  'Decimal':
    '十进制',
  'Character':
    '字符',
  'Serial monitor':
    '串口监视器',
  'Console':
    '控制台',
  'Click to hide/show this curve':
    '单击隐藏/显示该曲线',
  'Freeze the display (data keeps being collected)':
    '冻结显示（数据仍在采集）',
  'Resume the display (data keeps being collected)':
    '恢复显示（数据仍在采集）',
  '⚙ Manage components':
    '⚙ 管理元件',
  'Auto-route the wires (right angles)':
    '自动布线（直角）',
  'Auto-routing the wires…':
    '正在自动布线…',
  'Re-routing the wires from scratch…':
    '正在重新布线…',
  'Auto-routing stopped: {0} of {1} wires routed':
    '自动布线中断：已布 {0} / {1} 根导线',
  'Zoom in':
    '放大',
  'Zoom out':
    '缩小',
  'Drag a pin endpoint onto another pin to reconnect it.':
    '把导线端点拖到另一个引脚上即可重新连接。',
  'Free text label. Drag it to move it; with the text mode (T) on, click it to edit it.':
    '自由文本标签。拖动可移动；在文本模式 (T) 下单击可编辑。',
  'Text color':
    '文字颜色',
  'Background color':
    '背景颜色',
  'Background opacity':
    '背景透明度',
  'Text size':
    '文字大小',
  'Workshop size':
    '工作区字号',
  'Font':
    '字体',
  'Workshop font':
    '工作区字体',
  'Sans serif':
    '无衬线',
  'Serif':
    '衬线',
  'Monospace':
    '等宽',
  'Handwriting':
    '手写体',
  'Delete this label':
    '删除此标签',
  'The driving transistor cannot pass enough current':
    '驱动三极管无法通过足够的电流',
  'This transistor saturates: it only passes gain × base current, less than the motor draws, so the motor stays stalled. Lower the base resistor to drive more base current, or use a transistor with more gain.':
    '该三极管已饱和：它只能通过 增益 × 基极电流，小于电机所需，因此电机卡住不转。请减小基极电阻以提供更大的基极电流，或换用增益更大的三极管。',
};
