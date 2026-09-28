# DS18B20 温度传感器

![DS18B20 温度传感器](ds18b20.webp)

一个温度计。它输出的不是需要换算的电压，而是 **一个数字**，单位已经是摄氏度。而且只用 **一根线** 传输，这让它能做到其他传感器做不到的事 — 与其他传感器共用同一个引脚。

测量范围 **−55 到 +125 °C**，在 −10 到 +85 °C 之间精度为 **±0.5 °C**。

库元件：通过元件管理器安装，不在内置元件栏中。

它有两个版本，芯片相同，程序相同：这个裸 **TO-92** 封装，以及引线末端的不锈钢 [防水探头](ds18b20-etanche.md)。

## 引脚

| 引脚              | 作用                                             |
| ----------------- | ------------------------------------------------ |
| **GND**（黑）     | 地                                               |
| **Data**（黄）    | 数据线，接到一个数字引脚                         |
| **VDD**（红）     | 电源，3.3 V 或 5 V                               |

注意方向：三只引脚从同一侧伸出，接反会使元件持续发热而损坏。平面朝向你、引脚朝下时，从左到右依次是 **GND – Data – VDD**。

## 必须接上拉电阻

**`Data` 和 `VDD` 之间必须接一个 4.7 kΩ 电阻**。没有它什么都不工作 — 这也是 “传感器读数为 −127” 的头号原因。

## 一根线上接多个传感器

这正是 DS18B20 的特色。每个传感器出厂时都烧录了一个唯一的 64 位 **地址**。因此可以把五个传感器接在同一个引脚上 — `Data` 接 `Data`，所有传感器只用一个 4.7 kΩ 电阻 — 然后按地址逐个查询。

程序用 `search()` 找到它们，每次返回一个地址。

## Arduino 端

需要安装两个库：**OneWire** 和 **DallasTemperature**。

```cpp
#include <OneWire.h>
#include <DallasTemperature.h>

OneWire wire(2);                 // Data 接引脚 2
DallasTemperature sensors(&wire);

void setup() {
  Serial.begin(9600);
  sensors.begin();
}

void loop() {
  sensors.requestTemperatures();             // 请求一次测量
  float t = sensors.getTempCByIndex(0);      // 总线上的第一个传感器
  Serial.println(t);
  delay(1000);
}
```

如果读数为 **−127**，说明传感器没有应答：请检查 4.7 kΩ 电阻、电源以及引脚方向。

## Pico 端 (MicroPython)

两个模块 MicroPython 都已自带，无需安装。

```python
import machine, onewire, ds18x20, time

wire = onewire.OneWire(machine.Pin(2))
sensor = ds18x20.DS18X20(wire)
addresses = sensor.scan()          # 在总线上找到的传感器

while True:
    sensor.convert_temp()          # 请求一次测量
    time.sleep_ms(750)             # 转换所需的时间
    for a in addresses:
        print(sensor.read_temp(a))
    time.sleep(1)
```

这 `750 ms` 不是保险起见：这是芯片以 12 位精度完成转换所需的时间。提前读取，读到的是上一次的测量值。

## 仿真

仿真时，元件上有一个 **T°** 滑块，范围 −55 到 +125 °C。在这里设置的值就是程序读到的值 — 传感器真正按照 1-Wire 协议应答，包括地址，与芯片完全一样。在程序运行时移动滑块：下一次读取就会得到新值。

### 滑块拉到最左：“读取失败”

在 **恰好 −55 °C** 时，使用 **DallasTemperature** 的 Arduino 程序会显示 “读取失败”（`DEVICE_DISCONNECTED_C`），而不是温度。这不是仿真的缺陷：该库把 −55 °C 当作表示 “传感器不存在” 的特殊值，因此把传感器的下限误认为故障。真实的 DS18B20 在 −55 °C 时结果完全一样。

把滑块设为 **−54.5 °C** 即可正常读取。在 MicroPython (`ds18x20`) 中没有这个问题：−55 °C 和其他值一样能被读取。

---

*图形与说明：Frank Sauret。参考：[Analog Devices DS18B20](https://www.analog.com/en/products/ds18b20.html)。*
