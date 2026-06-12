# Kablix — User guide

**Arduino Uno** / **Raspberry Pi Pico** simulator integrated into VS Code, 100% offline.

> Version française : [UTILISATION.md](UTILISATION.md)

## Contents

1. [Getting started](#getting-started)
2. [The interface](#the-interface)
3. [Building a circuit](#building-a-circuit)
4. [Running code](#running-code)
5. [MicroPython on the Pico](#micropython-on-the-pico)
6. [Serial monitor](#serial-monitor)
7. [Exporting the diagram as SVG](#exporting-the-diagram-as-svg)
8. [Creating your own parts](#creating-your-own-parts)
9. [Part file format (.kablix-part.json)](#part-file-format-kablix-partjson)
10. [Where to find existing parts](#where-to-find-existing-parts)
11. [Keyboard shortcuts](#keyboard-shortcuts)

---

## Getting started

Three ways to open the simulator:

- **Kablix icon** in the activity bar (left side) → the view opens and starts
  the simulator;
- Command palette (`Ctrl+Shift+P`) → **“Kablix: Open the simulator”**;
- Command **“Kablix: Compile & run the active file”** (opens the simulator and
  loads the file being edited).

On first display, a **starter diagram** is placed on the canvas:

| Board | Diagram |
| --- | --- |
| Arduino Uno | LED on D13 (through a resistor) + pushbutton on D2 |
| Raspberry Pi Pico | LED on GP25 (through a resistor) + pushbutton on GP13 |

Click **▶ Start**: the demo program runs, the LED blinks, the button is
interactive.

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

- **Board selector**: Arduino Uno or Raspberry Pi Pico. Switching boards resets
  the canvas with the matching starter diagram.
- **Palette**: click a part to place it on the canvas. Custom parts (★) appear
  below, with their ⇩ (export) and ✕ (delete model) buttons.
- **Properties** (inspector): edits the selected element — part (color, value,
  angle…) or wire (Dupont color, deletion).

## Building a circuit

### Placing and moving

- **Place**: click a part in the palette.
- **Move**: drag the part (anywhere on its body). Interactive parts (button,
  potentiometer, switches, joystick) are moved by their **title bar** so they
  stay clickable.
- **Rotate**: select the part then press **`+`** (45° clockwise) or **`-`**
  (45° counter-clockwise). Pins and wires follow.
- **Delete**: ✕ on the title bar, 🗑 button in the inspector, or `Del` key.

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

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `+` / `=` | Rotate the selected part by +45° |
| `-` | Rotate by −45° |
| `Del` / `Backspace` | Delete the selection (part or wire) |
| `Esc` | Cancel the wire being drawn / deselect |
| `Ctrl` (while dragging a handle) | Crosshair + H/V alignment of the corner |
| `Enter` (serial field) | Send the line to the microcontroller |
