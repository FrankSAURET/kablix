# Kablix — User guide

**Arduino Uno** / **Raspberry Pi Pico** simulator integrated into VS Code, 100% offline.

> Version française : [UTILISATION.md](UTILISATION.md)

## Contents

1. [Getting started](#getting-started)
2. [The interface](#the-interface)
3. [Building a circuit](#building-a-circuit)
4. [Running code](#running-code)
5. [MicroPython on the Pico](#micropython-on-the-pico)
6. [Step-by-step debugging](#step-by-step-debugging)
7. [Serial monitor](#serial-monitor)
8. [Exporting the diagram as SVG](#exporting-the-diagram-as-svg)
9. [Creating your own parts](#creating-your-own-parts)
10. [Part file format (.kablix-part.json)](#part-file-format-kablix-partjson)
11. [Where to find existing parts](#where-to-find-existing-parts)
12. [Library updates](#library-updates)
13. [Keyboard shortcuts](#keyboard-shortcuts)

---

## Getting started

Three ways to open the simulator:

- **Kablix icon** in the activity bar (left side) → the view opens and starts
  the simulator;
- Command palette (`Ctrl+Shift+P`) → **“Kablix: Open the simulator”**;
- Command **“Kablix: Compile & run the active file”** (opens the simulator and
  loads the file being edited).

On first display, the **drawing sheet is empty**: place your parts from the
palette, wire them, then click **▶ Start** (built-in demo program: blinking
LED on D13/GP25) or **⚙ Compile & run the active file** to run your own code.

## The interface

```
┌──────────────────────────────────────────────────────────────────┐
│ Kablix  [Board ▾] [▶ Start] [■] [⚙ Compile…] [↑ Load] [⬇ SVG]     │
├───────────┬────────────────────────────────────────┬─────────────┤
│ Palette   │                Canvas                  │ Properties  │
│ (parts)   │   (parts, wires, handles…)             │ (selected   │
│           │                                        │  part/wire) │
├───────────┴────────────────────────────────────────┴─────────────┤
│ Serial monitor  [output]                  [input field] [Send]    │
└──────────────────────────────────────────────────────────────────┘
```

- **Board selector**: Arduino Uno or Raspberry Pi Pico (the current circuit is
  kept, the simulation stops).
- **Palette**: click a part to place it on the canvas. Two sort modes (buttons
  at the top): **AZ** (alphabetical) or **🗂** (by category — Boards,
  Displays & LEDs, Controls, Sensors, Actuators, Passive). A **“Recently
  used”** zone (10 max) stays at the top, and the palette scrolls when taller
  than the window. Custom parts (★) keep their ⇩ (export) and ✕ (delete model)
  buttons.
- **🏷 Names**: forces the name above **every** part. When off (default), the
  name only appears on the **selected** part.
- **Properties** (inspector): edits the selected element — part (color, value,
  angle…) or wire (Dupont color, deletion).

## Building a circuit

### Placing and moving

- **Place**: click a part in the palette (placed at the center), or **drag and
  drop** it from the palette to wherever you want on the canvas.
- **Move**: drag the part (anywhere on its body), or **drag with the right
  mouse button** — essential for interactive parts (button, potentiometer,
  switches, joystick) whose left click operates the control. You can also
  select them (left click) then drag the **name bar** that appears above.
- **Rotate**: select the part then press **`+`** (45° clockwise) or **`-`**
  (45° counter-clockwise). Pins and wires follow; a reminder shows in the
  inspector help area.
- **Zoom**: **mouse wheel** over the canvas (centered on the cursor). The
  **⟳ %** badge at the bottom right shows the factor; click it to reset the view.
- **Delete**: ✕ on the name bar (visible when selected), 🗑 button in the
  inspector, or `Del` key.

### Breadboard

The **Breadboard** part (Boards category) comes in three sizes — *mini*
(17 columns, no rails), *half* (30 columns) and *full* (63 columns) — set in
**Properties**. Real internal connections are simulated: columns **a–e** and
**f–j** joined per strip, **+/− rails** along the full length.

While dragging a part over the breadboard, the **strips that would receive
its pins light up in yellow**. On release the part **plugs in**: it snaps to
the holes and the connections are made automatically (no visible wire). Wires
are drawn over boards and breadboards.

### Wiring

1. Click a **pin** (golden dot): the wire starts.
2. Each click on the **canvas background** adds a **corner**. Segments close to
   horizontal or vertical (±15°) **snap** to the axis.
3. Click **another pin** to finish the wire. `Esc` cancels.
4. Direct pin-to-pin drag also works.

Every change of direction is drawn with a **rounded corner**. Colors:

- a wire touching a **ground** (GND) starts **black**;
- a wire touching a **power rail** (5V, 3V3, VBUS, VSYS, VCC…) starts **red**;
- the others follow the rotation of the **rainbow Dupont ribbon** (10 colors).

The color stays **editable with one click** in the inspector — it is never
re-imposed.

### Reworking a wire

- **Select the wire**: **handles** appear on every corner.
- **Drag a handle** to move the corner.
- **Hold Ctrl** while dragging: a **horizontal/vertical crosshair** appears and
  the corner aligns with its neighbours — segments become exactly horizontal
  or vertical.
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

Button **⚙ Compile & run the active file** (or the command of the same name) —
the processing depends on the extension of the active file:

| File | Processing | Requirement |
| --- | --- | --- |
| `.ino`, `.c`, `.cpp` (Uno board) | Local compilation then execution | `arduino-cli` **or** `avr-gcc` |
| `.c`, `.cpp` (Pico board) | Bare-metal RAM compilation | `arm-none-eabi-gcc` |
| `.py` | MicroPython on the simulated Pico | `.uf2` firmware (see below) |
| `.hex` | Loaded directly (Uno) | — |
| `.uf2`, `.elf`, `.bin` | Loaded directly (Pico) | — |

Button **↑ Load workspace** (or command “Kablix: Load the compiled artifact of
the workspace”): detects and runs the **most recent `.hex`** (output folder of
`.vscode/arduino.json`, otherwise a scan) or the **`.uf2` in `build/`**
(pico-sdk / cmake / pico-vscode projects).

## MicroPython on the Pico

1. Download the official firmware:
   [micropython.org/download/RPI_PICO](https://micropython.org/download/RPI_PICO/).
2. Put it **in the workspace** (any folder) or set its path in the
   **`kablix.micropythonUf2`** setting.
3. Open a `.py` file → **⚙ Compile & run the active file**.

The firmware boots in the simulator (bootrom + flash + USB), then the script is
injected through the **raw REPL**. `print()` output shows up in the serial
monitor; when the script ends, the **interactive REPL** stays available through
the input field.

## Step-by-step debugging

Designed for watching a program run in class, without an external debugger.

- **⏸ Pause / ▶ Resume**: freezes the simulation; pin and LED states stay
  visible. The 🐇/🐢/🐌 selector slows execution down (Uno).
- **⏭ Step**: runs one line of the source file then pauses again. The
  **Variables** panel (below the canvas) shows the current line and the
  program's global variables; the line is also highlighted in the VS Code
  editor.
- **Breakpoints**: click in the editor gutter (left of the line numbers)
  before or during the run; the simulation pauses when the line is reached.

Requirements and limits:

| Language | How | Limits |
| --- | --- | --- |
| C / Arduino (Uno) | DWARF info extracted at compile time (`avr-objdump`, shipped with arduino-cli or avr-gcc) | simple **global** variables (int, float, bool…); a long `delay()` advances in 0.25 s simulated slices |
| MicroPython (Pico) | the script is instrumented automatically before injection | **global** variables only; pause takes effect on the next line; no slow motion |

Artifacts loaded directly (`.hex`, `.uf2`, `.elf`, `.bin`) run without debug
info: pause and slow motion still work, stepping does not.

## Serial monitor

- **Output**: USART (Uno), USB-CDC and UART0 (Pico), real time.
- **Input**: text field + `Enter` (or the Send button). On the Pico the input
  feeds the USB-CDC (MicroPython REPL) **and** the UART0.

## Exporting the diagram as SVG

Button **⬇ SVG**: the complete diagram (parts with their rotations, colored
wires with rounded corners) is exported as a **standalone SVG file** through a
save dialog. Usable in a document, a website, a printout…

> Note: a few parts styled through internal CSS may lose cosmetic details on
> export; the geometry and main colors are preserved.

## Creating your own parts

Button **“+ Create a part”** at the bottom of the palette:

1. **Name**: label shown in the palette.
2. **Simulation model**: defines the electrical behavior —

   | Model | Pin roles | Behavior |
   | --- | --- | --- |
   | LED | `A` (anode), `C` (cathode) | Glow when A=high and C=low |
   | Pushbutton | `1.l`, `2.l` | Click on the drawing = press (pin pulled LOW) |
   | Resistor | `1`, `2` | Electrically joins its two pins |
   | Buzzer | `1`, `2` | Glow when a voltage exists across the two pins |
   | Digital source | `OUT` | 0/1 state set in Properties |
   | Analog source | `AO` | 0–100 % value set in Properties |
   | Decorative | — | No behavior (annotation, decoration) |

3. **SVG drawing**: paste or write SVG code in the text area; the preview
   updates live.
4. **Connection points**: **click the preview** to place each pin where you
   want it, rename them in the list (✕ to remove one).
5. **Role mapping**: for each role of the chosen model, select the pin that
   plays it (e.g. role `A` → your pin `plus`).
6. **Save**: the part appears in the palette (★) and is **persisted across
   sessions**.

Managing from the palette: **click** = place on canvas, **double-click** =
edit the model, **⇩** = export as `.json`, **✕** = delete the model,
**⇪ Import (.json)** = load a shared part.

### Letting an AI generate a part

Copy the prompt below into your favorite AI assistant (Claude, ChatGPT…), fill
in the first line, then import the resulting JSON via **⇪ Import (.json)**:

```text
Create a part for the Kablix simulator: [DESCRIBE YOUR PART HERE, e.g.
"a 5V relay module with an indicator LED"].

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
  "buzzer" (active when voltage across roles 1 and 2), "digital-source"
  (digital output, role OUT, state set by the user), "analog-source" (analog
  output, role AO, 0-100 % value set by the user), "passive" (decorative, no
  role).
- "pinRoles": maps each role of the chosen kind to the "name" of one of your
  pins.
- "attrs": { "state": "0" } for digital-source, { "value": "50" } for
  analog-source, {} otherwise.
- The SVG: an <svg> tag with width/height in pixels (60 to 200), presentation
  attributes only (fill, stroke…), no <style> nor scripts, no typographic
  quotes. Draw golden pads (circles ~4 px) at the exact declared pin positions.
- Pin x/y coordinates are in pixels from the top-left corner of the SVG.
- Properly escape quotes inside the "svg" value.
```

The matching reference (roles, fields, constraints) is in the
[file format](#part-file-format-kablix-partjson) section — the prompt restates
the essentials so the AI needs no other context.

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

Tips for the SVG drawing:

- Use reasonable `width`/`height` (40–200 px): that is the display size on the
  canvas.
- Avoid `<style>` and scripts; prefer presentation attributes (`fill`,
  `stroke`…) — they survive the diagram SVG export.
- Visually place your connection pads (golden circles for instance) where you
  declare the `pins`.

## Where to find existing parts

- **Built into Kablix**: the whole palette (see the table above) — based on
  [@wokwi/elements](https://github.com/wokwi/wokwi-elements) (MIT license),
  visual gallery at [elements.wokwi.com](https://elements.wokwi.com).
- **SVG drawings for your custom parts**:
  - [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Electronic_component_symbols) (electronic symbols, free licenses);
  - [SVG Repo](https://www.svgrepo.com) and [Openclipart](https://openclipart.org) (free drawings);
  - the sources of [wokwi-elements](https://github.com/wokwi/wokwi-elements/tree/master/src)
    contain the SVG of each part (MIT — reusable in a custom part);
  - [Fritzing](https://github.com/fritzing/fritzing-parts) (breadboard views in
    SVG, CC-BY-SA license).
- **Sharing**: an exported part (`.kablix-part.json`) can be imported on any
  other machine via **⇪ Import (.json)** — handy to distribute a classroom
  library.

## Library updates

Kablix bundles three simulation libraries (`avr8js`, `rp2040js`,
`@wokwi/elements`). The extension is **offline by default**: no remote service
is contacted without your consent.

- **Manual check**: command palette (`Ctrl+Shift+P`) → **“Kablix: Check for
  library updates”**. Kablix then queries the npm registry and tells you whether
  a newer version exists (or that everything is up to date).
- **Startup check** (optional): enable the **`kablix.checkUpdatesOnStartup`**
  setting (off by default). A notification then appears only when an update is
  available, silently otherwise.

> **Warning**: updating these libraries may **break the extension** (API
> changes). If a problem occurs, open an issue on the GitHub repository:
> [github.com/franksauret/kablix/issues](https://github.com/franksauret/kablix/issues).
> A missing or failed network check stays silent and does not affect offline
> operation.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `+` / `=` | Rotate the selected part by +45° |
| `-` | Rotate by −45° |
| `Del` / `Backspace` | Delete the selection (part or wire) |
| `Esc` | Cancel the wire being drawn / deselect |
| `Ctrl` (while dragging a handle) | Crosshair + H/V alignment of the corner |
| `Enter` (serial field) | Send the line to the microcontroller |
