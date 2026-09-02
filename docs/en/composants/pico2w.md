# Raspberry Pi Pico 2 W

![Raspberry Pi Pico 2 W](../../img/composants/pico2w.webp)

Identical to the Pico 2 (RP2350, dual-core Cortex-M33 at 150 MHz, 3.3 V, same pins) with a built-in **Wi-Fi/Bluetooth** module. The physical pinout is the same as the Pico.

## Pins

| Pin | Role |
|--------|------|
| **GP0–GP28** | Digital I/O (GP26–GP28 = ADC0–ADC2) |
| **3V3** | 3.3 V output |
| **VSYS / VBUS** | Input power |
| **GND** | Grounds |
| **RUN** | Reset (active low) |

## Usage

- Full pinout via the **K** button.
- **3.3 V** logic level (not 5 V tolerant).
- Programmable in **MicroPython**: Kablix loads the `RPI_PICO2_W` firmware.
- Wi-Fi is **not emulated** by the core: network requests go through the host — see *Talking to the outside world* below.

> ℹ️ Bare-metal C/C++ is not supported on this board yet: use MicroPython, or the Pico W for an Arduino program.


## Talking to the outside world

The Wi-Fi chip (CYW43439) is **not emulated**: it does not exist inside the simulated core. Kablix replaces it with a **network bridge** — the script talks to the extension, which makes the real request from your machine and hands back the answer. The program therefore stays the one of a real board:

```python
import network, urequests, time

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("my-ssid", "my-password")         # taken as is, connection is immediate
while not wlan.isconnected():
    time.sleep(0.1)
print(wlan.ifconfig())                         # ('192.168.1.50', ...): front address

r = urequests.get("https://api.github.com/repos/FrankSAURET/kablix")
print(r.status_code, r.json()["name"])
r.close()
```

What is true, and what is not:

- `network.WLAN` is a **façade**: `connect()` always succeeds (SSID and password are ignored), `isconnected()` turns true, `ifconfig()` returns a fixed address. No Wi-Fi packet is ever sent.
- `urequests` (aliased as `requests`) makes **REAL HTTP requests**, run by VS Code: `get`, `post`, `put`, `patch`, `delete`, `head`, with `data=`, `json=` and `headers=`. The answer carries `status_code`, `reason`, `text`, `content` and `.json()`.
- Only **http://** and **https://** are relayed, with a 15 s timeout and a response body capped at **64 KB**: the tunnel borrows the simulated serial link, it is slow.
- **Client** `socket` (outgoing connection) is not relayed, nor is MQTT, nor Bluetooth: go through `urequests`. **Server** `socket`, on the other hand, works — see below.
- To cut off any outgoing access: uncheck **`kablix.picowNetworkBridge`** in the settings (enabled by default). The script then gets an `OSError`.


### Access point and web server

The classic setup — the board declares itself an **access point**, a phone connects to it and drives the LED from a web page — works, with one difference: it is **your machine** that holds the TCP socket, not the board. No Wi-Fi network is created: the phone stays on the **same network as the PC** and opens the address announced at startup.

```python
import network, socket
from machine import Pin

led = Pin(15, Pin.OUT)

ap = network.WLAN(network.AP_IF)
ap.config(essid="Kablix-Pico", password="kablix2026")
ap.active(True)
print("Address:", ap.ifconfig()[0])           # the REAL address of the machine

address = socket.getaddrinfo("0.0.0.0", 80)[0][-1]
server = socket.socket()
server.bind(address)
server.listen(1)

while True:
    client, _ = server.accept()
    request = client.recv(1024).split(b"\r\n")[0].decode()
    if "/on" in request:
        led.value(1)
    elif "/off" in request:
        led.value(0)
    client.send("HTTP/1.1 200 OK\r\n\r\n<a href='/on'>ON</a> <a href='/off'>OFF</a>")
    client.close()
```

- `network.WLAN(network.AP_IF)` is a **façade**: `config(essid=…, password=…)` is accepted and remembered, `active(True)` succeeds, but no access point is broadcast. `ifconfig()[0]`, however, returns the **real IPv4 address** of your machine — that is the one to open from the phone.
- The **server** `socket` is relayed for real: `getaddrinfo`, `bind`, `listen`, `accept`, `recv`/`read`/`readline`, `send`/`sendall`/`write`, `makefile`, `close`. The bytes go back and forth as they are — it is your program that speaks HTTP, exactly as on the real board.
- **The requested port is not always granted**: port 80 is reserved on most machines. Kablix then falls back to 8080, then to any free port, and prints the open address in the console: `[Kablix] Pico W server: http://…`. That is **the** address to aim at, not the port in the program.
- On the first run, the **firewall** asks for permission: grant it for the private network, otherwise the phone knocks on an empty door.
- The socket closes when the simulation stops; the **`kablix.picowNetworkBridge`** setting cuts it off too (the script then gets an `OSError`).
- Ready-made test bench: `testkablix/wifi-picow.projix` (and its twin `testkablix/wifi-pico2w.projix`).

---

*Kablix in-house component. Board drawing after the official Raspberry Pi Ltd artwork. RP2350 © Raspberry Pi Ltd.*
