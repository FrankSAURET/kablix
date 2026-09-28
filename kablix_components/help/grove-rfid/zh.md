# Grove 125 kHz RFID 读卡器

![Grove 125 kHz RFID 读卡器](grove-rfid.webp)

一块不用接触就能读卡的电路板。下方的大线圈会产生一个看不见的磁场。卡片进入磁场后，从中获得刚好足以唤醒自己的能量 — 它 **没有电池** — 然后报出自己的卡号。电路板听到后，把这个号码转告给微控制器。门禁卡和食堂卡用的就是这种读卡器。

库元件：通过元件管理器安装，不在原始元件栏中。

## 引脚

这是一个四线 Grove 接口：

| 引脚 | 作用 |
|--------|------|
| **GND**（黑） | 地 |
| **VCC**（红） | 电源，3.3 V 或 5 V |
| **Rx** | 模块输入 — Wiegand 模式下用作 **DATA1** |
| **Tx** | 模块输出 — 卡号，Wiegand 模式下为 **DATA0** |

模块会 **主动发送**，不等别人询问。因此它的两根数据线都要接到开发板的 **输入** 引脚。

## 跳线：两种通信方式

左上角的小跳线决定电路板以何种方式发送卡号。单击它即可切换。

**左边 — UART。** 卡号以文本形式从 **Tx** 明文发出，波特率 **9600**，后跟换行。一根线就够了。在 Arduino 上，用软件串口读取：

```c
#include <SoftwareSerial.h>
SoftwareSerial rfid(2, 3);   // 2 = Arduino 的 Rx，接模块的 Tx

void setup() { Serial.begin(9600); rfid.begin(9600); }
void loop() {
  if (rfid.available()) Serial.write(rfid.read());
}
```

**右边 — Wiegand。** 卡号以 **脉冲** 形式从两根线发出，**Tx** = DATA0，**Rx** = DATA1。两根线空闲时都为高电平；**0** 是 DATA0 上的一个短暂低脉冲，**1** 是 DATA1 上的一个短暂低脉冲 — 每个 50 µs，间隔 2 ms。共 **26 个脉冲**，从最高位到最低位。用中断来计数：

```c
volatile unsigned long word = 0;
volatile int count = 0;
void zero() { word = (word << 1);     count++; }
void one()  { word = (word << 1) | 1; count++; }

void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP); pinMode(3, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), zero, FALLING);
  attachInterrupt(digitalPinToInterrupt(3), one,  FALLING);
}
void loop() {
  if (count >= 26) { Serial.println(word, HEX); count = 0; word = 0; }
}
```

Wiegand 在任何开发板上都能用。而 UART 需要开发板一侧有串口：在 Arduino 上 **软件** 串口即可胜任，由它读取这根线。**在 Pico 上请选择 Wiegand**：仿真时芯片的硬件串口不监听这些引脚，UART 模式会没有任何输出。

## 仿真

线圈下方的绿蓝色 **箭头** 用来移动卡片。单击它：卡片滑入线圈，箭头翻转方向。再单击一次：卡片移出。

只要卡片 **在线圈中**，模块就会 **每秒一次** 重复发送卡号，与真实模块完全一样。发送的卡号显示在图形中的 **CodeRFID** 小窗口里。它从三张卡中随机选取，就像你口袋里有三张卡一样：

| 跳线 | 卡号 |
|----------|--------|
| UART | `0F0034AB12` · `0F00A17C45` · `0F0059D3E8` |
| Wiegand | `1A34B12` · `0C71D9E` · `23F80A5` |

卡片移出线圈后，小窗口清空，数据线重新安静下来。

跳线可以在仿真 **过程中** 移动：电路会自动重新读取，无需停止程序。

## 注意

- 真实模块会在卡号前后加上两个帧字符和一个校验和。这里只发送卡号本身，后跟换行：学习时更容易读懂，但为真实模块编写的程序会寻找那些额外的字符。
- 这些卡片是 **只读** 的，卡号很容易被复制：用来开个抽屉可以，用来保密不行。
- 卡片只有在距离线圈几厘米以内才能被读取，线圈正后方的金属会妨碍读取。
- 在 Arduino 上，只有引脚 **2** 和 **3** 能通过中断唤醒程序：两根 Wiegand 数据线必须接在这里。

---

*图形与说明：Frank Sauret。参考：[Grove - 125KHz RFID Reader](https://wiki.seeedstudio.com/Grove-125KHz_RFID_Reader/)。*
