# Kablix — User guide
![Kablix](../../Kablix.png)
> Version française : [UTILISATION.md](../fr/UTILISATION.md)

## Contents

1. [Getting started](#getting-started)
2. [Features](#features)
3. [The interface](#the-interface)
4. [Building a circuit](#building-a-circuit)
5. [Running code](#running-code)
6. [MicroPython on the Pico](#micropython-on-the-pico)
7. [Step-by-step debugging](#step-by-step-debugging)
8. [Serial monitor](#serial-monitor)
9. [Plotter](#plotter)
10. [Exporting the diagram as SVG](#exporting-the-diagram-as-svg)
11. [Creating your own parts](#creating-your-own-parts)
12. [Part file format (.kablix-part.json)](#part-file-format-kablix-partjson)
13. [Where to find existing parts](#where-to-find-existing-parts)
14. [Saving / opening a project (.projix)](#saving--opening-a-project-projix)
15. [Wokwi interoperability (diagram.json)](#wokwi-interoperability-diagramjson)
16. [Library updates](#library-updates)
17. [Keyboard shortcuts](#keyboard-shortcuts)

---

## Getting started

1. To start, click the <img src="../../media/KNB.png" alt="Kablix" width="30" /> icon in the activity bar on the left;
  - Or, inside a project folder, double-click a projix file;
  - Or, if you set up the association, double-click a projix file in Windows Explorer.
![Start Kablix](../../media/demarrer.gif)

2. **Build your circuit**: drag and drop a part from the palette on the left. Wire the pins directly and click the autoroute button (routes the selected parts, or the whole circuit if none is selected).
![Build a circuit](../../media/dessiner.gif)

3. **Run your code**: associate a code file (note that `.ino` files must be inside a folder with the same name) then **▶ “Start”**:
  - `.ino`/`.c`/`.cpp` -> compilation through the local toolchain;
  - `.py` -> MicroPython on the simulated Pico (`.uf2` firmware required, see below);
  - `.hex` / `.uf2` / `.elf` / `.bin` -> loaded directly, no compilation.

4. **Save your circuit**: “Kablix: Save the project (.projix)”;
  a `.projix` then reopens with a double-click in Explorer.
  Import/export in the Wokwi format (`diagram.json`) are also available.
![Simulate in Kablix](../../media/simuler.gif)

## The interface
![interface](../../media/interface.png)
*Kablix interface: **①** the parts **palette** on the left, **②** the circuit **canvas** in the center, **③** the **inspector** (Properties/variables) on the right, **④** the **serial monitor/Console/REPL**, **⑤** the **Plotter** at the bottom and **⑥** the **toolbars** (Simulation and drawing) at the top.*

- **Palette**: clicking a part places it on the canvas. Two sort modes to choose from (buttons at the top) ![sort buttons](<../../media/boutons trie.png>): alphabetical or by categories.
A **“Recently used”** zone (10 max) can stay at the top (third button). The last button changes the palette's reaction mode.
- **Kablix toolbar**
![Kablix bar](<../../media/barre kablix.png>)
    - the usual file-management functions,
    - the Names button, which shows the name on the **selected** part or on all parts,
    - the hamburger menu for less frequent functions,
    - access to this help.
- **Simulation bar**
![Simulation bar](../../media/BarreSimulation.png)
    - **▶ start**
    - **■ stop**
    - **⏸ pause/resume**
    - **step**
    - the **speed** selector 🐇/🐢/🐌 to speed up or slow down the simulation
    - **code file** click = change, double-click = open (opens the project's code file on the left)
    - **REPL**: for Pico only, shows the traditional Python console
    - **serial monitor / console**
    - **Plotter**.
- **Drawing bar**
![Drawing bar](../../media/BarreDessin.png)
  - **Kablix button** shows the internal schematic or the full pinout of the part.
    - **autoroute** routes the selection or the whole circuit
    - **grid** (show/hide)
    - **recenter/fit the view**
    - **⟲ reset** the parts
    - **eraser** (clear the diagram).
- **Properties/Variables** (inspector):
    - While drawing, edits the selected part (color, value, angle…) or wire (Dupont color, deletion, node [equipotential])
    - during the simulation, shows the variables.

## Building a circuit

### Placing and moving

- **Place**: click a part in the palette (placed at the center), or
  **drag and drop** it from the palette to wherever you want on the canvas.
- **Move**: drag the part (anywhere on its body), or **drag with the right click** — essential for interactive parts (button, potentiometer, switches, joystick) whose left click operates the control.
- **Rotate**: select the part then press **`+`** (45° clockwise) or **`-`** (45° counter-clockwise). Pins and wires follow; a reminder appears in the inspector help area.
- **Zoom**: **mouse wheel** over the canvas (centered on the cursor). The **⟳ %** badge at the bottom right gives the factor; clicking it resets the view.
- **Delete**: 🗑 button in the inspector, or `Del` key.

### Breadboard

The **Breadboard** part (Boards & breadboards category) comes in three sizes — *mini* (17 columns, no rails), *half* (30 columns) and *full*
(63 columns) — set in **Properties**. Real internal connections are simulated: columns **a–e** and **f–j** joined per strip, **+/− rails**
along the full length.

While dragging a part over the breadboard, the **strips that would receive its pins light up in yellow**. On release, the part **plugs in**: it snaps to the holes and the connections are made automatically (no visible wire). Wires are drawn over boards and breadboards.

### Wiring

1. Click a **pin** (golden dot): the wire starts.
2. Each click on the **canvas background** adds a **corner**. Segments close to horizontal or vertical (±15°) **snap** to the axis.
3. Click **another pin** to finish the wire. `Esc` cancels.
4. Direct pin-to-pin drag also works, and it is the method I recommend — autoroute does the rest.

Every change of direction is drawn with a **rounded corner**. Colors:

- a wire touching a **ground** (GND) starts **black**;
- a wire touching a **power rail** (5V, 3V3, VBUS, VSYS, VCC…) starts **red**;
- the others follow the rotation of the **rainbow Dupont ribbon** (10 colors).

The color stays **editable with one click** in the inspector — it is never re-imposed.

Some special parts (only the RGB LED for now) have preset initial colors (I'll let you guess which ones in that case).

### Reworking a wire

- **Select the wire**: **handles** appear on every corner.
- **Drag a handle** to move the corner.
- **Hold Ctrl** while dragging: a **horizontal/vertical crosshair** appears and the corner aligns with its neighbours — segments become exactly horizontal or vertical.
- **Double-click the wire**: inserts a new corner at that spot.

### Available parts

| Part | Simulated behavior |
| --- | --- |
| Arduino Uno / Raspberry Pi Pico | Boards (simulated processor) |
| Breadboard (mini/half/full) | Conductive a–e / f–j strips and +/− rails, automatic plug-in |
| LED, RGB LED, 10-LED bar graph | Lit according to net levels (anode high, cathode low) |
| 7-segment display | Segments A–G + dot, common cathode DIG1 |
| Pushbutton | Pulls the MCU pin LOW when pressed (wired pin ↔ GND) |
| Slide switch | Connects the common (2) to side 1 or 3 |
| DIP switch ×8 | 8 independent channels (na ↔ MCU, nb ↔ GND) |
| Resistor | Joins its two legs (editable value/angle) |
| Buzzer | Animated note when a voltage exists across its pins |
| Potentiometer (rotary / slide) | Interactive analog input (A0–A5 Uno, GP26–GP28 Pico) |
| Analog joystick | 2 analog axes (VERT/HORZ) + SEL button |
| Photoresistor (LDR) | Analog output AO, brightness set in Properties |
| PIR sensor, tilt sensor | Digital output OUT, state set in Properties |
| Servo motor | Horn at 90° when the PWM pin is high (simplified) |

## Running code

Button **Compile & run the active file** (or the command of the same name) — the processing depends on the extension of the active file:

| File | Processing | Requirement |
| --- | --- | --- |
| `.ino`, `.c`, `.cpp` (Uno board) | Local compilation then execution | `arduino-cli` **or** `avr-gcc` |
| `.c`, `.cpp` (Pico board) | Bare-metal RAM compilation | `arm-none-eabi-gcc` |
| `.py` | MicroPython on the simulated Pico | `.uf2` firmware (see below) |
| `.hex` | Loaded directly (Uno) | — |
| `.uf2`, `.elf`, `.bin` | Loaded directly (Pico) | — |

## MicroPython on the Pico
1. Open a `.py` file → **Compile & run the active file**.
2. On first run, if no firmware is found, Kablix **offers to download it automatically** (choose **Pico / Pico W**) from [micropython.org](https://micropython.org/download/RPI_PICO/). The firmware is cached in the extension storage and **reused across all your projects** — you are only asked once.

To supply your own firmware (offline, a specific version…): put an official `.uf2` **in the workspace** (any folder) or set its path in the **`kablix.micropythonUf2`** setting; it then takes precedence.

> ⚠ **Fully offline use.** So that a machine with no Internet never has to download the firmware, **put the `.uf2` in the project folder**: it is then versioned and shipped with the project. Kablix looks for the firmware **in the workspace first**, then in the downloaded/cached firmware, and only offers to download as a last resort. A project that bundles its firmware is thus reproducible and self-contained.

The firmware boots in the simulator (bootrom + flash + USB), then the script is injected through the **raw REPL**. `print()` output shows up in the serial monitor; when the script ends, the **interactive REPL** stays available through the input field or by clicking the REPL button.

## Step-by-step debugging

Designed for watching a program run, without an external debugger.

- **⏸ Pause / ▶ Resume**: freezes the simulation; pin and LED states stay displayed. The 🐇/🐢/🐌 selector slows execution down (Uno).
- **Step**: runs one line of the source file then pauses again. The **Variables** panel then shows the current line and the program's global variables; the line is also highlighted in the VS Code editor.
A variable that has just changed is shown in red.
- **Breakpoints**: click in the editor gutter (left of the line numbers) before or during the run; the simulation pauses when the line is reached. Breakpoints can be conditional.

Requirements and limits:

| Language | How | Limits |
| --- | --- | --- |
| C / Arduino (Uno) | DWARF info extracted at compile time (`avr-objdump`, shipped with arduino-cli or avr-gcc) | simple **global** variables (int, float, bool…); a long `delay()` advances in 0.25 s simulated slices |
| MicroPython (Pico) | the script is instrumented automatically before injection | **global** variables only; pause takes effect on the next line; no slow motion |

Artifacts loaded directly (`.hex`, `.uf2`, `.elf`, `.bin`) run without debug info: pause and slow motion still work, stepping does not.

## Serial monitor

- **Output**: USART (Uno), USB-CDC and UART0 (Pico), real time.
- **Input**: text field + `Enter` (or the Send button). On the Pico the input feeds the USB-CDC (MicroPython REPL) **and** the UART0.

## Plotter

Panel at the bottom of the screen: visualizes numeric quantities in real time, without leaving Kablix or adding any dependency.

Two sources plotted automatically:

- **Program telemetry**: every line in the **Teleplot** format `>name:value` (optional unit `§u`) emitted on the serial port becomes a curve. Compatible with the Teleplot tool on real hardware — the same sketch plots here and there. These lines are **absorbed** by the plotter: they do not clutter the serial monitor.
- **Internal probes**: the voltage each analog sensor puts on its pin is plotted **without a line of code** in the sketch (step plot, the value holds between two changes).

Emission examples:

| Language | Line |
| --- | --- |
| C / Arduino | `Serial.print(">temp:"); Serial.println(t);` |
| C / Arduino (unit) | `Serial.print(">voltage:"); Serial.print(v); Serial.println("§V");` |
| MicroPython | `print(">temp:{}".format(t))` |

Panel controls:

- **Window**: displayed duration (5, 10, 30 or 60 s), a sliding window that follows real time.
- **⏸ / ▶**: freezes the display; collection continues in the background.
- **Legend chips**: click to hide/show a curve; the current value is shown there live.
- **Hover**: crosshair + tooltip with each curve's value at the pointed instant.
- **CSV**: exports every series (long format `time ; quantity ; value ; unit`, separator and decimal adapted to the language — opens directly in Excel FR).
- **Clear**: empties the curves.

When the simulation stops, the curves stay displayed for analysis.

## Exporting the diagram as SVG

Button **SVG floppy disk**: the complete diagram (parts with their rotations, colored wires with their rounded corners) is exported as a **standalone SVG file** through a save dialog. Usable in a document, a website, a printout…

> Note: a few parts styled through internal CSS may lose cosmetic details on export; the geometry and main colors are preserved.

## Creating your own parts
> ⚠ Experimental ⚠

> Detailed guide: [Editing component SVGs and their internal schematics](Editing-svg-components.md) — editing a part's SVG drawing, the 10 px grid, and changing the internal schematics (K view).

Button **“+ Create a part”** at the bottom of the palette: a full-screen window opens, with the form on the left and **two previews** on the right (external view and internal view). The **zoom** buttons at the top (−, %, +, ⛶ *fit*) scale both previews.

**1. Name and category.** The name is the label shown in the palette. The category picks the palette section where the part is filed (Boards, Passive, Displays & LEDs, Controls, Sensors, Actuators, Instruments, Misc); left blank, it goes into **Custom parts**.

**2. Simulation model.** Defines the electrical behavior:

| Model | Pin roles | Behavior |
| --- | --- | --- |
| LED | `A` (anode), `C` (cathode) | Glow when A=high and C=low |
| Pushbutton | `1.l`, `2.l` | Click on the drawing = press (pin pulled to GND) |
| Resistor | `1`, `2` | Electrically joins its two pins |
| Buzzer | `1`, `2` | Glow when a voltage exists across the two pins |
| Digital source | `OUT` | 0/1 state set in Properties |
| Analog source | `AO` | 0–100 % value set in Properties |
| Ultrasonic sensor HC-SR04 | `TRIG`, `ECHO` | Distance echo (adjustable) |
| I²C LCD display (HD44780) | — (I²C bus) | Screen driven by the I²C bus |
| I²C PWM driver (PCA9685) | — (I²C bus) | 16 PWM outputs on the I²C bus |
| I²C OLED display (SSD1306) | — (I²C bus) | I²C graphic screen |
| SPI OLED display (SSD1306) | `DC` | SPI graphic screen |
| Decorative | — | No behavior (annotation, decoration) |

The **⇪** button next to the list imports extra **simulation models** from a `.json` (roles and attributes pre-assigned); they are added under “Imported models” and are persisted.

**3. External drawing.** Button **“Load an SVG…”**: load the drawing from a `.svg` file. Kablix reads the **convention markers** placed in the SVG (under Inkscape for instance) and removes them from the final part:

- **red circle** (opacity 0.8) = a pin → detected and placed automatically;
- **red text** near a pin = its name (becomes the tooltip);
- **green circle** (opacity 0.5) = alignment anchor of the internal view (see 5).

Without a red marker, **click the preview** to place each pin by hand.
> ⚠ Legs must be on a 10 px grid.

**4. Connection points.** The list under “Connection points” lets you **rename** each pin, adjust its **x / y** coordinates to the pixel, or remove it (✕). A click on the external preview always adds a point.

**5. Internal view (optional).** The internal column's **“Load an SVG…”** button: a second drawing (schematic) shown when the part is opened. It aligns with the external view through the **green circle** (anchor) present in both SVGs — same scales required. The **Overlay** checkbox controls the alignment on the external preview; **✕** removes the internal view.

**6. Definition parameters** (button **＋**). Named numeric fields (a resistor's nominal value, etc.): they appear in the part inspector **and** become variables reusable in the simulation control characteristic.

**7. Simulation control.** Adds to the part, during the simulation, a **slider** (analog output) or a **switch** (digital output):

- **Slider**: label, unit, min / max / step, and a **characteristic** — an expression giving the output voltage **in volts** as a function of `x` (slider position) and the parameters defined in 6. Empty = linear ramp min→max. The expression is validated live.
- **Switch**: a label, 0/1 output.

**8. Save.** The part appears in the palette (★) and is **persisted across sessions**. The **“Submit to Kablix…”** button explains how to share the part (GitHub “Submit new component” issue or pull request).

Managing from the palette: **click** = place on canvas, **double-click** = reopen the creator to edit, **⇩** = export as `.json`, **✕** = delete, **⇪ Import (.json)** = load a shared part.

## Part file format (.kablix-part.json)

An exported part is a standalone **JSON** file:

```json
{
  "type": "custom-m4k2xyz",
  "label": "My special LED",
  "kind": "led",
  "svg": "<svg width=\"40\" height=\"56\" xmlns=\"http://www.w3.org/2000/svg\">…</svg>",
  "pins": [
    { "name": "plus",  "x": 12, "y": 50 },
    { "name": "minus", "x": 28, "y": 50 }
  ],
  "pinRoles": { "A": "plus", "C": "minus" },
  "attrs": {}
}
```

| Field | Type | Description |
| --- | --- | --- |
| `type` | string | Unique identifier. Generated automatically if missing at import. |
| `label` | string | **Required.** Name shown in the palette. |
| `kind` | string | Simulation model: `led`, `pushbutton`, `resistor`, `buzzer`, `digital-source`, `analog-source` or `passive` (default). |
| `svg` | string | **Required.** Complete SVG code of the drawing (an `<svg>` tag with `width`/`height` in pixels). |
| `pins` | array | **Required.** Connection points: `name` (unique), `x`, `y` in pixels **relative to the top-left corner of the drawing**. |
| `pinRoles` | object | Mapping *model role* → *pin name* (see the models table). If absent, pins must directly bear the role name. |
| `attrs` | object | Initial attributes. For `digital-source`: `{ "state": "0" }`; for `analog-source`: `{ "value": "50" }`. |
| `category` | string | Palette section (`Boards`, `Passive`, `Displays & LEDs`, `Controls`, `Sensors`, `Actuators`, `Instruments`, `Misc`). Absent = “Custom parts”. |
| `params` | array | Definition parameters: `name` (identifier), `label`, `value` (number). Inspector fields, reusable in `control.expr`. |
| `control` | object | Simulation control: `{ "type": "slider", "label", "unit", "min", "max", "step", "expr" }` (voltage in volts, `expr` as a function of `x` and the `params`) **or** `{ "type": "switch", "label" }`. |
| `innerSvg` | string | Optional internal view (schematic shown when opening the part). |
| `innerOffset` | object | Offset `{ x, y }` of the internal view in the external drawing's coordinate frame (alignment). |
| `extAnchor` / `intAnchor` | object | Green anchors `{ x, y }` measured at import; recompute the alignment if a single SVG is re-imported. |

The `kind` values available for the full I²C/SPI modules are also:
`ultrasonic` (HC-SR04, roles `TRIG`/`ECHO`), `i2c-lcd`, `i2c-pwm`, `i2c-oled`
(I²C bus, no role), `spi-oled` (role `DC`).

Tips for the SVG drawing:

- Use reasonable `width`/`height` (40–200 px): that is the display size on the canvas.
- Avoid `<style>` and scripts; prefer presentation attributes (`fill`, `stroke`…) — they survive the diagram SVG export.
- Visually place your connection pads where you declare the `pins`.

### Letting an AI generate a part

Copy the prompt below into your favorite AI assistant (Claude, ChatGPT…), fill in the first line, then import the resulting JSON via **⇪ Import (.json)**:

```text
Create a part for the Kablix simulator: [DESCRIBE YOUR PART HERE, e.g. "a 5V relay module with an indicator LED"].

Answer ONLY with a valid JSON file (no surrounding text), in this format:

{
  "label": "<short name shown in the palette>",
  "kind": "<simulation model, see list>",
  "svg": "<complete SVG drawing on a single line>",
  "pins": [ { "name": "<name>", "x": <px>, "y": <px> } ],
  "pinRoles": { "<role>": "<pin name>" },
  "attrs": {}
}

Constraints:
- "kind" among: "led" (lit when role A=high and C=low), "pushbutton" (click =
  pin pulled to GND, roles 1.l and 2.l), "resistor" (joins roles 1 and 2),
  "buzzer" (active when voltage across roles 1 and 2), "digital-source" (digital
  output, role OUT, state set by the user), "analog-source" (analog output,
  role AO, 0-100 % value set by the user), "passive" (decorative, no role).
- "pinRoles": maps each role of the chosen kind to the "name" of one of your pins.
- "attrs": { "state": "0" } for digital-source, { "value": "50" } for
  analog-source, {} otherwise.
- The SVG: an <svg> tag with width/height in pixels (60 to 200), presentation
  attributes only (fill, stroke…), no <style> nor scripts, no typographic
  quotes. Draw golden pads (circles ~4 px) at the exact declared pin positions.
- Pin x/y coordinates are in pixels from the top-left corner of the SVG.
- Properly escape quotes inside the "svg" value.
```

The matching reference (roles, fields, constraints) is in the [file format](#part-file-format-kablix-partjson) section — the prompt restates the essentials so the AI needs no other context.

## Where to find existing parts

- **Built into Kablix**: the whole palette (see the table above) — based on [@wokwi/elements](https://github.com/wokwi/wokwi-elements) (MIT license), visual gallery at [elements.wokwi.com](https://elements.wokwi.com).
- **SVG drawings for your custom parts**:
  - [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Electronic_component_symbols) (electronic symbols, free licenses);
  - [SVG Repo](https://www.svgrepo.com) and [Openclipart](https://openclipart.org) (free drawings);
  - the sources of [wokwi-elements](https://github.com/wokwi/wokwi-elements/tree/master/src) contain the SVG of each part (MIT — reusable in a custom part);
  - [Fritzing](https://github.com/fritzing/fritzing-parts) (breadboard views in SVG, CC-BY-SA license).
- **Sharing**: an exported part (`.kablix-part.json`) can be imported on any other machine via **⇪ Import (.json)** — handy to distribute a library.

## Saving / opening a project (.projix)

A **Kablix project** gathers in a single `.projix` file (a ZIP archive) **the diagram** (parts, wires, custom parts) and the target **board**. The `.projix` is light and self-contained — ideal to archive, share or hand in a diagram. It **does not embed the code**: the code file is only **referenced** (by its path), it stays on the machine.

- **💾 Save the project** (toolbar button or command **“Kablix: Save the project (.projix)”**): choose the location of the `.projix` file. Kablix puts the current diagram, the custom parts used and the board in it. The associated code file (if any) is stored as a **reference** in the manifest; its content is not copied into the archive.
- **📂 Open a project** (button or command **“Kablix: Open a project (.projix)”**): select a `.projix`. The diagram and the board are reloaded into the simulator. If a code file was referenced, Kablix tries to find it again on the machine (path relative to the workspace, then absolute fallback path).

Contents of a `.projix` archive:

| Entry | Role |
| --- | --- |
| `kablix.json` | Manifest: format, version, app version, board, date, **reference** of the code file |
| `diagram.json` | Diagram (parts + wires) and custom parts |

> ⚠ The code is **not included** in the `.projix`: only the diagram is archived. To share the code as well, hand the source file along with the `.projix`.

## Wokwi interoperability (diagram.json)

Kablix's built-in parts are the **@wokwi/elements** elements (same types, same pin names), which allows exchanging diagrams with the **Wokwi** project format (`diagram.json`).

- **Export** (hamburger button or command palette → **“Kablix: Export the Wokwi diagram (diagram.json)”**): writes the current diagram in the Wokwi format.
- **Import** (hamburger button or **“Kablix: Import a Wokwi diagram (diagram.json)”**):
  loads a `diagram.json`; Wokwi types not supported by Kablix are ignored (their count is shown in the status bar).

> ⚠ **Flipping** (flipH/flipV) and **wire corners** have no standard equivalent in `diagram.json`: Kablix keeps them in a `kablix` extension block (key ignored by Wokwi), so that a round trip Kablix → diagram.json → Kablix restores them identically. Opened in Wokwi, the diagram stays valid (standard parts and links), simply without the flipping or the corners.
>
> Remaining limit: Kablix **custom parts** (`kablix-custom-part`) and unknown Wokwi types are not converted (ignored, counted in the status bar).

## Library updates

Kablix bundles three simulation libraries (`avr8js`, `rp2040js`, `@wokwi/elements`). The extension is **offline by default**: no remote service is contacted without your consent.

- **Manual check**: command palette (`Ctrl+Shift+P`) → **“Kablix: Check for library updates”**. Kablix then queries the npm registry and tells you whether a newer version exists (or that everything is up to date).
- **Startup check** (optional): enable the **`kablix.checkUpdatesOnStartup`** setting (off by default). A notification then appears only when an update is available, silently otherwise.

> **Warning**: updating these libraries may **break the extension** (API changes). If a problem occurs, open an issue on the GitHub repository: [github.com/franksauret/kablix/issues](https://github.com/franksauret/kablix/issues). A missing or failed network check stays silent and does not affect offline operation.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `+` / `=` | Rotate the selected part by +45° |
| `-` | Rotate by −45° |
| `Del` / `Backspace` | Delete the selection (part or wire) |
| `Esc` | Cancel the wire being drawn / deselect |
| `Ctrl` (while dragging a handle) | Crosshair + H/V alignment of the corner |
| `Enter` (serial field) | Send the line to the microcontroller |
