 <img src="https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/accroche.webp" alt="Kablix" width="1000" />

*[Version française](README.md)*

>Extension under development. And if you feel I write like an AI, it is probably because there is some truth in it.
# Kablix
A **Gaulish** application to simulate microcontrollers (**Arduino Uno / Raspberry Pi Pico**) straight inside VS Code,
- **100 % Offline**
- **100 % Free of charge**
- **100 % Open source**
- **100 % Telemetry-free**

The simulation relies on two open-source engines bundled with the extension:
[avr8js](https://github.com/wokwi/avr8js) (ATmega328P) and
[rp2040js](https://github.com/wokwi/rp2040js) (RP2040), both under the MIT licence.

## Tests
My test library is available here: [TestKablix](https://github.com/FrankSAURET/kablix/tree/main/testkablix)
## Getting started
1. To begin, click the <img src="https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/KNB.webp" alt="Kablix" width="30" /> icon in the activity bar on the left;
    - Or, inside a project folder, double-click a projix file;
    - Or, if you set up the file association, double-click a projix file in Windows Explorer.

![alt text](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/demarrer.gif)
1. **Build your circuit**: drag and drop a part from the library on the left. Connect the pins directly, then click the auto-routing button (it routes the selected parts, or the whole circuit when nothing is selected).
 
![alt text](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/dessiner.gif)
1. **Run your code**: attach a code file (beware, `.ino` sketches must live in a folder of the same name) then hit **▶ “Start”**:
   - `.ino`/`.c`/`.cpp` → compiled with the local toolchain;
   - `.py` → MicroPython on the simulated Pico (a `.uf2` firmware is required, see below);
   - `.hex` / `.uf2`/`.elf` / `.bin` → loaded as is, without compilation.
   
1. **Save your circuit**: “Kablix: Save project (.projix)”;
   a `.projix` then reopens with a double-click from the explorer.
   Wokwi import/export (`diagram.json`) is available too.

![alt text](https://raw.githubusercontent.com/FrankSAURET/kablix/main/media/simuler.gif)
## Features

- ✅ **Visual workshop**: automatic routing. 
- ✅ **Part creator**: you can build your own “custom” parts with this creator or, better still, fork the repository, follow the [guide](docs/en/Creating-components.md) to add the part and open a PR (publication request) — it will then ship with the next release for everyone, and please provide the test circuits as well (Pico + Arduino).
- ✅ **SVG export**.
- ✅ **A library of 63 parts** in 9 categories, each with its illustrated help sheet (❔ button) and two ready-to-run test circuits, Arduino and Pico — [full list](#part-library).
- ✅ **Supported development boards**: Arduino Uno, Nano, Mega 2560 and Raspberry Pi Pico/Pico W, all pluggable onto a breadboard.
- ✅ **Real RP2040 flashing**.
- ✅ **Direct artifact loading**: `.hex`, `.uf2`, `.elf`, `.bin` compiled elsewhere, loaded without recompiling
- ✅ **Real C/C++ code compilation**
- ✅ **Two-way serial monitor**: live output plus an input field to send data to the microcontroller.
- ✅ **Plotter**: live curves, plus **probes** dropped on a pin to watch its voltage
- ✅ **Physical simulation**: brightness follows the series resistor, LEDs without a resistor burn out, servos fail to start, the power supply accounts for current…
- ✅ **Interactive sensors**: sliders and buttons for flame, gas, sound, light, temperature and motion, driving the circuit input live.
- ✅ **Windows integration**.


> 📖 **Full guide**: [docs/en/USAGE.md](docs/en/USAGE.md) (English) /
> [docs/fr/USAGE.md](docs/fr/USAGE.md) (français) — interface, wiring, building
> custom parts (with an AI prompt), the `.kablix-part.json` format,
> where to find existing parts.
>
> **Adding a part to Kablix** (contributors, on GitHub only):
> [docs/en/Creating-components.md](docs/en/Creating-components.md) (English) /
> [docs/fr/Creating-components.md](docs/fr/Creating-components.md) (français) —
> from the drawing in `Composants.svg` to a simulated, tested and documented part,
> by hand or with an AI.
>
> 🌍 **Bilingual interface**: French when VS Code runs in French, English otherwise.
> The mechanism extends to other languages — see [Internationalisation](#internationalisation).

## Part library

**63 parts** you can drop with the mouse, listed in palette order. Each one comes with its **illustrated help sheet** (❔ button in the inspector, offline, English and French) and **two test circuits** ready to simulate in [testkablix](https://github.com/FrankSAURET/kablix/tree/main/testkablix) — one in C on Arduino, one in MicroPython on the Pico.

| Category | Parts |
| --- | --- |
| **Boards & breadboards** (7) | Arduino Uno · Arduino Nano · Arduino Mega 2560 · Raspberry Pi Pico · Raspberry Pi Pico W · Grove Shield (Pico) · Breadboard |
| **Discrete** (9) | LED · RGB LED · Resistor · Diode · Capacitor (film, tantalum, electrolytic) · LDR (photoresistor) · NTC thermistor · PTC thermistor · Transistor (NPN, PNP, darlington, MOSFET — PN2222A and generic models) |
| **Displays** (8) | 7-segment display (1 to 4 digits) · 10-LED bar graph · Text LCD 16×2 / 20×4 (I²C or parallel) · SSD1306 OLED display (I²C) · ILI9341 TFT display (SPI) · NeoPixel · NeoPixel matrix · NeoPixel ring |
| **Controls** (9) | Pushbutton · 6 mm pushbutton · Potentiometer · Slide potentiometer · Slide switch · DIP switch ×8 · Analog joystick · OMRON G5V relay · Membrane keypad 3×4 / 4×4 |
| **Sensors** (11) | Light sensor · PIR motion sensor · Tilt sensor · NTC temperature sensor · Gas sensor (MQ) · Heart-beat sensor · Flame sensor · Sound sensor · Ultrasonic sensor (HC-SR04) · DHT22 temperature/humidity · DHT11 temperature/humidity |
| **Actuators** (4) | Buzzer · Servo motor · Fan · DC motor |
| **Instruments** (1) | Bench power supply |
| **Misc** (2) | microSD card (SPI) · 16-channel PWM driver (PCA9685) |
| **Integrated circuits** (12) | **CMOS 4000**: CD4081 (quad AND) · CD4071 (quad OR) · CD4070 (quad XOR) · CD4011 (quad NAND) · CD4001 (quad NOR) · CD40106 (hex Schmitt-trigger inverter)<br>**TTL/HC 74**: 74xx08 · 74xx32 · 74xx86 · 74xx00 · 74xx02 · 74xx14 (same functions; the chosen family sets the supply range) |

On top of these come **custom parts**: drawn in the built-in creator, or imported as `.kablix-part.json`.

## Internationalisation

The interface follows the VS Code language (`vscode.env.language`): **French when it starts with `fr`, English otherwise** (fallback language). Translation rests on three independent registries, because they translate things of a different nature:

| What | File | Form |
| --- | --- | --- |
| Webview strings (toolbar, palette, inspector, catalogue…) | `src/webview/i18n.mts` | **key (English) → translation** dictionary (`DICTS`); `t()` falls back to the English key when missing |
| Extension strings (commands, notifications, dialogs) | `package.nls.<lang>.json` + `l10n/bundle.l10n.<lang>.json` | native VS Code mechanism (`%key%` in `package.json`, `vscode.l10n.t()` in the code); the file without a suffix is English |
| Help: user guide (❔) and part sheets | `docs/<lang>/*.md` and `docs/<lang>/composants/*.md` | **versioned Markdown**, rendered offline in a webview (`src/markdown.ts` → `src/guide.ts` / `src/partHelp.ts`) |

Help is no longer an HTML copy frozen in the code: what you read is **the guide itself**,
images included — so it can never lag behind the documentation. The heavy captures
(demo GIFs, logo) stay out of the `.vsix` and are served from GitHub;
every other image is embedded, hence readable offline.

All three registries share the same resolution: the language **base code**
(`fr-FR` → `fr`) selects the matching entry, and English is the fallback when
it is missing.

### Adding a language (e.g. German, `de`)

To be done in **all three** registries — a language declared in a single place will only
be partly translated:

1. **Webview** — in [`src/webview/i18n.mts`](src/webview/i18n.mts): create the
   `const DE = { … }` dictionary (same English keys as `FR`) then add it to
   `DICTS` → `{ fr : FR, de : DE }`. Untranslated keys automatically fall back
   to English.
2. **Extension** — copy `package.nls.json` to `package.nls.de.json` and
   `l10n/bundle.l10n.fr.json` to `l10n/bundle.l10n.de.json`, then translate the values
   (the keys stay identical). VS Code picks the right file on its own.
3. **Help** — create `docs/de/`: the `USAGE.md` guide and the `composants/` folder
   (same file NAMES as `docs/fr/`, only the content is translated; images are
   shared in `docs/img/`). Then widen `docLang()` in
   [`src/guide.ts`](src/guide.ts) and [`src/partHelp.ts`](src/partHelp.ts) — a missing
   sheet already falls back to another language.

No other logic change is needed: selection and fallback are handled by
`initLocale()` (webview) and `docLang()` (help). `npm run verify:docs` checks
that the guides and sheets stay complete, illustrated and shipped in the package.

## Credits

Kablix is developed by **[Frank SAURET](https://electropol.fr)** and builds on the following open-source libraries:

| Library | Role | Licence |
| --- | --- | --- |
| [avr8js](https://github.com/wokwi/avr8js) | ATmega328P simulation engine (Arduino Uno) | MIT |
| [rp2040js](https://github.com/wokwi/rp2040js) | RP2040 simulation engine (Raspberry Pi Pico) | MIT |
| [@wokwi/elements](https://github.com/wokwi/wokwi-elements) | Visual parts (boards, LEDs, sensors…) | MIT |
| [JSZip](https://stuk.github.io/jszip/) | Reading/writing `.projix` archives | MIT/GPLv3 |
| RP2040 B1 bootrom | Boot of the simulated RP2040 | © Raspberry Pi (Trading) Ltd — BSD-3-Clause |
| MicroPython | `.uf2` firmware run on the simulated Pico (supplied by the user) | MIT |
| [LED Board-7](http://www.styleseven.com) font © Sizenko Alexander (Style-7) | LED-display look of the simulated LCD screens | Freeware (free use, credit required) |

The project format and imported parts are compatible with [Wokwi](https://wokwi.com) (open `diagram.json` format).

## Licence

MIT — the embedded RP2040 bootrom is © Raspberry Pi (Trading) Ltd, BSD-3-Clause licence.
