# Kablix — User guide
![Kablix](../../Kablix.webp)
> Version française : [USAGE.md](../fr/USAGE.md)

## Contents

1. [Getting started](#getting-started)
2. [The interface](#the-interface)
3. [Building a circuit](#building-a-circuit)
1. [Simulating](#simulating)
    1. [Running code](#running-code)
    2. [MicroPython on the Pico](#micropython-on-the-pico)
    1. [Debugging](#debugging)
    1. [Serial monitor](#serial-monitor)
    1. [Plotter](#plotter)
1. [Exporting the diagram as SVG](#exporting-the-diagram-as-svg)
1. [Creating your own parts](#creating-your-own-parts)
1. [Part file format (.kablix-part.json)](#part-file-format-kablix-partjson)
1. [Where to find existing parts](#where-to-find-existing-parts)
1. [Saving / opening a project (.projix)](#saving--opening-a-project-projix)
1. [Wokwi interoperability (diagram.json)](#wokwi-interoperability-diagramjson)
1. [Library updates](#library-updates)
1. [Keyboard shortcuts](#keyboard-shortcuts)

---

## Getting started

1. To start, click the <img src="../../media/KNB.webp" alt="Kablix" width="30" /> icon in the activity bar on the left;
  - Or, inside a project folder, double-click a projix file;
  - Or, if you set up the association, double-click a projix file in Windows Explorer.
<video src="../../media/demarrer.mp4" title="Start Kablix" controls autoplay loop muted playsinline></video>

  The icon **only creates a new project when none is open**: if a circuit is already there — including one reopened on its own after you switched folders — it brings that one back instead of opening a second workbench.

2. **Build your circuit**: drag and drop a part from the palette on the left. Wire the pins directly and click the autoroute button (routes the selected parts, or the whole circuit if none is selected).
<video src="../../media/dessiner.mp4" title="Build a circuit" controls autoplay loop muted playsinline></video>

3. **Run your code**: associate a code file (note that `.ino` files must be inside a folder with the same name) then **▶ “Start”**:
  - `.ino`/`.c`/`.cpp` -> compilation through the local toolchain;
  - `.py` -> MicroPython on the simulated Pico (`.uf2` firmware required, see below);
  - `.hex` / `.uf2` / `.elf` / `.bin` -> loaded directly, no compilation.

  **▶ saves first**: the circuit and the code file are written to disk before the simulation starts, so what runs is always what is on disk. A project that was never saved (no name yet) is left alone — no dialog interrupts the launch.

4. **Save your circuit**: “Kablix: Save the project (.projix)”; a `.projix` then reopens with a double-click in Explorer. On reopening, the project's code file opens **too**, in the code pane next to the circuit — while the caret stays in Kablix. Import/export in the Wokwi format (`diagram.json`) are also available.
<video src="../../media/simuler.mp4" title="Simulate in Kablix" controls autoplay loop muted playsinline></video>

## The interface
![interface](../../media/interface.webp)
*Kablix interface: **①** the parts **palette** on the left, **②** the circuit **canvas** in the center, **③** the **inspector** (Properties/variables) on the right, **④** the **serial monitor/Console/REPL**, **⑤** the **Plotter** at the bottom and **⑥** the **toolbars** — the Kablix one right at the top, the **simulation** one on the left of the canvas and the **drawing** one on the right.*

- **Palette**: clicking a part places it on the canvas. Two sort modes to choose from (buttons at the top) ![sort buttons](<../../media/boutons trie.webp>): alphabetical or by categories. A **“Recently used”** zone (10 max) can stay at the top (third button). The last button changes the palette's reaction mode.
- **Kablix toolbar** (at the top of the window)
![Kablix bar](<../../media/barre kablix.webp>)
    - **Load binary**: loads an already-compiled .hex/.uf2 from the workspace, without recompiling. **Hidden by default** — the *Show the “Load binary” button* checkbox in Kablix's settings brings it back.
    - the usual file-management functions: **new project**, **open**, **save**, **save as**, **export the diagram as SVG**,
    - the **Names** button, which shows the name on the **selected** part or on all parts, or the parts' id (the reference).
    - **rearrange**: restores the Kablix layout (code on one side, Kablix on the other, panels closed). You can swap the two zones and set their width with the mouse, then use **Save this layout as the default** (hamburger menu): both the side of Kablix **and** the width are remembered, and “rearrange” restores them — including moving Kablix back to the chosen side if it has changed since.
    - the **hamburger menu** for less frequent functions: import / export a **Wokwi** diagram, export the **part list (CSV)**, update the **Pico firmware**, check for **library updates**, save the default layout,
    - access to this **help**,
    - the current **project name**.
    - the project's **code file**, right next to the name: **click = change**, **double-click = open** (it opens on the code side),
    - the **status** area (“Ready”, build messages…) and, only when the page can no longer keep up, the **“Slowed down: 0.45× real time”** badge.
- **Simulation bar** (on the left, over the canvas)
![Simulation bar](../../media/BarreSimulation.webp)
    - **▶ start** (saves the diagram and the code first)
    - **■ stop**
    - **⏸ pause/resume**
    - **step**
    - the **speed** selector, one animal per setting: 🦅 500 %, 🐆 200 %, 🐇 100 % (real time), 🐢 10 %, 🐌 1 %. Speeding up is a **wish**: the simulation runs as fast as it can, never faster.
    - **REPL**: for Pico only, shows the traditional Python console (it only appears when the board on the canvas is a Pico)
    - **serial monitor / console**
    - **Plotter**
    - **fault explanations**: the red frame and the yellow label put on a faulty part. On by default; the button hides them when they get in the way of reading the diagram.
- **Drawing bar** (on the right, over the canvas)
![Drawing bar](../../media/BarreDessin.webp)
    - **part button**: shows the **internal schematic** of the selected part, or the **full pinout** of the board. It only appears when the selected part offers one.
    - **autoroute** routes the selection or the whole circuit
    - **grid** (show/hide)
    - **recenter/fit the view**
    - **⟲ reset all components**: puts every part back to its idle state (switches released, sliders at rest) without touching the wiring. **Hidden by default** — the *Show the “Reset all components” button* checkbox in the Kablix settings brings it back.
    - **eraser**: clears the whole diagram, parts and wires (Ctrl+Z undoes it). **Hidden by default** too — *Show the “Clear the diagram” button* checkbox.
- **Properties/Variables** (inspector):
    - While drawing, edits the selected part (color, value, angle…) or wire (Dupont color, deletion, node [equipotential])
    - during the simulation, shows the variables.
    - Parts with a lot of settings (the spider robot and its 33 of them) file their properties into **collapsible drawers**, all closed when the part is selected. They work as an **accordion**: opening one closes the one that was open.

## Building a circuit

### Placing and moving

- **Place**: click a part in the palette (placed at the center), or **drag and drop** it from the palette to wherever you want on the canvas.
- **Move**: drag the part (anywhere on its body), or **drag with the right click** — essential for interactive parts (button, potentiometer, switches, joystick) whose left click operates the control.
- **Rotate**: select the part then press **`+`** (45° clockwise) or **`-`** (45° counter-clockwise). Pins and wires follow; a reminder appears in the inspector help area.
- **Zoom**: **mouse wheel** over the canvas (centered on the cursor). The **⟳ %** badge at the bottom right gives the factor; clicking it resets the view. The **fit view** button frames the **drawing** of the circuit — not the invisible frames of the parts, which are bigger than what they show: a spider robot on its own now fills the screen instead of floating in the middle of a margin.
- **Delete**: 🗑 button in the inspector, or `Del` key.

### Breadboard

The **Breadboard** part (Boards & breadboards category) comes in three sizes — *mini* (17 columns, no rails), *half* (30 columns) and *full* (63 columns) — set in **Properties**. Real internal connections are simulated: columns **a–e** and **f–j** joined per strip, **+/− rails** along the full length.

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
| Potentiometer (rotary / slide / trimmer) | Interactive analog input (A0–A5 Uno, GP26–GP28 Pico); the trimmer prints its value as a 3-digit code |
| Analog joystick | 2 analog axes (VERT/HORZ) + SEL button |
| Photoresistor (LDR) | Analog output AO, brightness set in Properties |
| PIR sensor, tilt sensor | Digital output OUT, state set in Properties |
| Hall effect sensor | Open-drain output S (active low), magnet dragged with the mouse during simulation |
| Servo motor | Horn at 90° when the PWM pin is high (simplified) |

## Simulating

### Running code
Button **Compile & run the active file** (or the command of the same name) — the processing depends on the extension of the active file:

| File | Processing | Requirement |
| --- | --- | --- |
| `.ino`, `.c`, `.cpp` (Uno board) | Local compilation then execution | `arduino-cli` **or** `avr-gcc` |
| `.c`, `.cpp` (Pico board) | Bare-metal RAM compilation | `arm-none-eabi-gcc` |
| `.py` | MicroPython on the simulated Pico | `.uf2` firmware (see below) |
| `.hex` | Loaded directly (Uno) | — |
| `.uf2`, `.elf`, `.bin` | Loaded directly (Pico) | — |

#### On-board LEDs of the boards

While the simulation runs, the board lights up like the real one: the **green ON LED** stays lit as long as the program runs, and the **L LED** — the one of `LED_BUILTIN`, pin **D13** on Uno, Nano and Mega — follows that pin. A `blink` on `LED_BUILTIN` is therefore visible **without wiring any LED at all**. On the Pico, the on-board **GP25** LED plays that part.

#### Simulation speed

The simulation follows **real time**: one second on screen is one second on the real board, and `delay(1000)` really lasts one second. When the page is busy for a moment (drawing a part, a scrolling serial monitor), the simulation **catches up** as soon as it gets the thread back; only long stalls (more than a quarter of a second, a tab left in the background) are given up — that time is then **skipped**, never replayed fast-forward.

The animal selector deliberately slows execution down — 🐢 10 %, 🐌 1 % of real time — to watch a fast phenomenon. The other way round, 🐆 200 % and 🦅 500 % **ask** for a speed-up: the simulation then takes everything the machine can give, but it only goes past real time on a program that lets the core sleep. 🐇 100 % is real time.

If the board still cannot keep up, a **“Slowed down: 0.45× real time”** badge appears next to the status bar: the page is too busy for the simulation (large diagram, loaded machine). Slowing down on purpose with the selector is not counted as a fault. The badge disappears as soon as the simulation is back on time, and when it stops.

#### Faulty parts: red frame and explanation

When the simulation spots a wiring mistake or a destroyed part, it **draws a red frame around the culprit** on the schematic and shows **a yellow-on-red label next to it** explaining the problem and what to fix. The status bar only keeps the last sentence; the label stays put, right where you are looking.

| What Kablix sees | What the label says |
| --- | --- |
| Flyback diode wired the wrong way round | Diode reversed |
| Relay with no flyback diode | The coil sends back a surge when the current is cut; it destroys the driving transistor, the diode absorbs it |
| Coil voltage too low | The relay does not pull in: supply the coil at its rated voltage |
| Supply too weak for the coil | Raise its maximum current, or share fewer coils on the same source |
| Motor with no flyback diode (💥) | A motor is a coil: the switch-off surge destroys the driving transistor, the diode absorbs it |
| Supply too weak for the motor | A board pin is far too weak: use a power supply and a transistor |
| Motor overvoltage (💥) | More than 1.5 times its rated voltage: its windings do not take that |
| Burned LED (💥) | With no series resistor (or far too small a one) the current goes past what the junction can take |
| Blown capacitor (💥) | Rated working voltage exceeded: pick one rated well above the supply |
| Burned 16-servo board (💥) | The V+ terminal takes 5 V, no more |

Frame and label only show **while the simulation runs**; they go away as soon as the fault is fixed, and when it stops.

### MicroPython on the Pico
1. Open a `.py` file → **Compile & run the active file**.
2. On first run, if no firmware is found, Kablix **offers to download it automatically** (choose **Pico / Pico W**) from [micropython.org](https://micropython.org/download/RPI_PICO/). The firmware is cached in the extension storage and **reused across all your projects** — you are only asked once.

To supply your own firmware (offline, a specific version…): put an official `.uf2` **in the workspace** (any folder) or set its path in the **`kablix.micropythonUf2`** setting; it then takes precedence.

> ⚠ **Fully offline use.** So that a machine with no Internet never has to download the firmware, **put the `.uf2` in the project folder**: it is then versioned and shipped with the project. Kablix looks for the firmware **in the workspace first**, then in the downloaded/cached firmware, and only offers to download as a last resort. A project that bundles its firmware is thus reproducible and self-contained.

The firmware boots in the simulator (bootrom + flash + USB), then the script is injected through the **raw REPL**. `print()` output shows up in the serial monitor; when the script ends, the **interactive REPL** stays available through the input field or by clicking the REPL button.

### Debugging

- **⏸ Pause / ▶ Resume**: freezes the simulation; pin and LED states stay displayed. The animal selector (🦅 500 % → 🐌 1 %) sets the execution rate.
- **Step**: runs one line of the source file then pauses again. The **Variables** panel then shows the current line and the program's global variables; the line is also highlighted in the VS Code editor. A variable that has just changed is shown in red.
- **Breakpoints**: click in the editor gutter (left of the line numbers) before or during the run; the simulation pauses when the line is reached. Breakpoints can be conditional.

Requirements and limits:

| Language | How | Limits |
| --- | --- | --- |
| C / Arduino (Uno) | Debug data extracted at compile time (`avr-objdump`, shipped with arduino-cli or avr-gcc) | simple **global** variables (int, float, bool…); a long `delay()` advances in 0.25 s simulated slices |
| MicroPython (Pico) | the script is instrumented automatically before injection | **global** variables only; pause takes effect on the next line; no slow motion |

Artifacts loaded directly (`.hex`, `.uf2`, `.elf`, `.bin`) run without debug info: pause and slow motion still work, stepping does not.

#### Hiding variables

A program often exposes variables you do not care about (constants, configuration objects) that bury the two or three you are actually watching. The **Variables** panel lets you weed them out:

- **Hide**: click the **👁** on the left of the variable (tooltip “Click to hide”). The variable leaves the panel.
- **Show again**: click the **🔍 Variables ▾** title — the drop-down list of the currently hidden variables opens. Clicking one puts it back in the panel; **Show all again** restores every one of them.
- **Remember**: nothing more to do. The hidden list is stored **in the project** (`.projix`) and re-applied when you reopen it. It is written the next time the project is **saved**, exactly like the page framing: hiding a variable does not mark the project as modified.

A hidden variable is still **tracked** in the background: when it comes back, its red mark (“changed on the last step”) is accurate, as if it had never left the panel. As long as the project is not saved, hiding lasts for the open workshop — it survives stopping and restarting the simulation.

#### Display base of a variable

A bit mask or a register reads better in binary than in decimal. The name and the value of a variable are **clickable** (the cursor turns into a hand): a **click** opens a menu offering four display bases: **Binary**, **Hexadecimal**, **Decimal** (the default one) and **Character**. The current base is ticked ✓. Right-click opens the same menu.

The value then carries its base **prefix** — the very one you write in C or Python, so it can be typed straight back into the program — and its digits are grouped to stay readable:

| Base | `160` shown as | Grouping |
| --- | --- | --- |
| Binary | `0b 1010 0000` | 4 bits |
| Hexadecimal | `0x A0` | 4 digits |
| Decimal | `160` | 3 digits |
| Character | `' '` | — |

The group separator, like the one detaching the prefix, is a **narrow no-break space**: groups stand out at a glance and the number never breaks at the end of a line, even in a narrow panel.

In **Character**, control codes come out escaped (`'\n'`, `'\t'`, `'\0'`…), other values outside the printable range as `'\x1f'`. Values that are not integers (floats, strings, lists, objects) are left **as they are** whatever base you pick. In every case the value tooltip recalls the raw form.

The choice applies to **that variable** and is stored **in the project**, just like the hidden list: reopening the `.projix` gives every variable its base back. Since those settings belong to the file, changing them marks the project **to be saved** (the ● on the tab): `Ctrl+S` writes them.

### Serial monitor

- **Output**: USART (Uno), USB-CDC and UART0 (Pico), real time.
- **Input**: text field + `Enter` (or the Send button). On the Pico the input feeds the USB-CDC (MicroPython REPL) **and** the UART0.
- **Compilation errors**: when the program does not compile, the **full** compiler messages appear here, under a `── Compilation failed ──` heading (the monitor unfolds by itself if it was collapsed). The notification only repeats the **first** error — `file.ino:12 : 'digitalWrit' was not declared in this scope` — as it is almost always the one to fix first, the others following from it.

### Plotter

Panel at the bottom of the screen: visualizes numeric quantities in real time, without leaving Kablix or adding any dependency.

Two sources plotted automatically:

- **Program telemetry**: every line in the **Teleplot** format `>name:value` (optional unit `§u`) emitted on the serial port becomes a curve. Compatible with the Teleplot tool on real hardware — the same sketch plots here and there. These lines are **absorbed** by the plotter: they do not clutter the serial monitor.
- **Internal probes**: the voltage each analog sensor puts on its pin is plotted **without a line of code** in the sketch (step plot, the value holds between two changes). Each curve is named after the **converter channel followed by the pin** — `ADC0 (A0)` on Arduino, `ADC0 (GP26)` on Pico — so it matches the `analogRead(A0)` or `machine.ADC(0)` in your program at a glance.

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

## Exporting the part list (CSV bill of materials)

Hamburger menu → **“Export the part list (CSV)”**. One row per part, five columns:

| Ref. | Part | Type | Value | Comment |
| --- | --- | --- | --- | --- |
| `C2` | Electrolytic capacitor | `condo-p-1` | `10 µF` | `Max voltage: 400 V` |
| `R1` | Resistor | `resistor` | `10 kΩ` | `Power: 0.25 W` |
| `T1` | Transistor | `transistor` | | `Max Vce: 40 V · Current gain (β): 100 · …` |

- **Value**: the one printed on the part, with its unit and prefix (`10 µF`, `100 kΩ`, `4.7 mH`). A part without one — a transistor, a display — leaves the cell empty.
- **Comment**: every other inspector characteristic, separated by `·`, written `Max voltage: 400 V`.
- The three capacitors are told apart by their name: **plastic**, **tantalum** or **electrolytic**.
- The list is sorted by family then by number (`R2` before `R10`), and the suggested file is **`<project name>.csv`**, next to the project.

Separator `;`, UTF-8 byte-order mark and CRLF line endings: the file opens straight into a spreadsheet set up for French.

## Exporting the diagram as SVG

Button **SVG floppy disk**: the complete diagram (parts with their rotations, colored wires with their rounded corners) is exported as a **standalone SVG file** through a save dialog. Usable in a document, a website, a printout…

> Note: a few parts styled through internal CSS may lose cosmetic details on export; the geometry and main colors are preserved.

## Creating your own parts
> ⚠ Experimental ⚠

> Detailed guide: [Editing component SVGs and their internal schematics](Editing-svg-components.md) — editing a part's SVG drawing, the 10 px grid, and changing the internal schematics (K view).

Button **“+ Create a part”** at the bottom of the palette: a full-screen window opens, with the form on the left and **two previews** on the right (external view and internal view). The **zoom** buttons at the top (−, %, +, ⛶ *fit*) scale both previews.

**1. Name and category.** The name is the label shown in the palette. The category picks the palette section where the part is filed (Boards, Passive, Displays & LEDs, Controls, Sensors, Actuators, Systems, Instruments, Misc, Integrated circuits); left blank, it goes into **Custom parts**.

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
| `category` | string | Palette section (`Boards`, `Passive`, `Displays & LEDs`, `Controls`, `Sensors`, `Actuators`, `Systems`, `Instruments`, `Misc`, `Integrated circuits`). Absent = “Custom parts”. |
| `params` | array | Definition parameters: `name` (identifier), `label`, `value` (number). Inspector fields, reusable in `control.expr`. |
| `control` | object | Simulation control: `{ "type": "slider", "label", "unit", "min", "max", "step", "expr" }` (voltage in volts, `expr` as a function of `x` and the `params`) **or** `{ "type": "switch", "label" }`. |
| `innerSvg` | string | Optional internal view (schematic shown when opening the part). |
| `innerOffset` | object | Offset `{ x, y }` of the internal view in the external drawing's coordinate frame (alignment). |
| `extAnchor` / `intAnchor` | object | Green anchors `{ x, y }` measured at import; recompute the alignment if a single SVG is re-imported. |

The `kind` values available for the full I²C/SPI modules are also: `ultrasonic` (HC-SR04, roles `TRIG`/`ECHO`), `i2c-lcd`, `i2c-pwm`, `i2c-oled` (I²C bus, no role), `spi-oled` (role `DC`).

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
- **`Ctrl+S`** does exactly what the 💾 button does: on a project that was **never saved** but already has a code file, the suggested name is the **code**'s (`my-program.py` → `my-program.projix`), not some “New project”. On an already named project it rewrites the file without asking anything.
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
- **Import** (hamburger button or **“Kablix: Import a Wokwi diagram (diagram.json)”**): loads a `diagram.json`; Wokwi types not supported by Kablix are ignored (their count is shown in the status bar).

> ⚠ **Flipping** (flipH/flipV) and **wire corners** have no standard equivalent in `diagram.json`: Kablix keeps them in a `kablix` extension block (key ignored by Wokwi), so that a round trip Kablix → diagram.json → Kablix restores them identically. Opened in Wokwi, the diagram stays valid (standard parts and links), simply without the flipping or the corners.
>
> Remaining limit: Kablix **custom parts** (`kablix-custom-part`) and unknown Wokwi types are not converted (ignored, counted in the status bar).

## Library updates

Kablix bundles three simulation libraries (`avr8js`, `rp2040js`, `@wokwi/elements`). The extension is **offline by default**: no remote service is contacted without your consent.

- **Manual check**: command palette (`Ctrl+Shift+P`) → **“Kablix: Check for library updates”**. Kablix then queries the npm registry and tells you whether a newer version exists (or that everything is up to date).
- **Startup check** (optional): enable the **`kablix.checkUpdatesOnStartup`** setting (off by default). A notification then appears only when an update is available, silently otherwise.
- **The notification offers three answers**: **Install** (opens the npm page; inside the extension repository it runs `npm install` directly), **Later** (it comes back on the next startup) and **Not this version** (that one is never offered again; a newer one still will be). The manual check always answers — even for a version you turned down.

> **Warning**: updating these libraries may **break the extension** (API changes). If a problem occurs, open an issue on the GitHub repository: [github.com/franksauret/kablix/issues](https://github.com/franksauret/kablix/issues). A missing or failed network check stays silent and does not affect offline operation.

## Recommended extensions

Kablix **simulates**; these two extensions cover the rest of the chain and pair well with it. They are **optional** — Kablix works on its own.

| Extension | What it does |
| --- | --- |
| [`electropol-fr.arduino-vscode-ide`](https://marketplace.visualstudio.com/items?itemName=electropol-fr.arduino-vscode-ide) | Arduino toolchain inside VS Code: boards, libraries, compilation and **uploading to a real board** |
| [`raspberry-pi.raspberry-pi-pico`](https://marketplace.visualstudio.com/items?itemName=raspberry-pi.raspberry-pi-pico) | Raspberry Pi Pico with MicroPython: pushing files to the board, hardware REPL |

Kablix offers them **once**, on its first activation. To bring them back: command palette (`Ctrl+Shift+P`) → **“Kablix: Recommended extensions”**.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `+` / `=` | Rotate the selected part by +45° |
| `-` | Rotate by −45° |
| `Del` / `Backspace` | Delete the selection (part or wire) |
| `Esc` | Cancel the wire being drawn / deselect |
| `Ctrl` (while dragging a handle) | Crosshair + H/V alignment of the corner |
| `Ctrl+A` | Select every part |
| `Ctrl+C` | Copy the selection (parts + wires) — allowed even during simulation |
| `Ctrl+V` | Paste the selection, **including into another Kablix project** |
| `Ctrl+D` | Duplicate the selection in place |
| `Ctrl+S` | Save the project — same as the **Save** button (default name = the code file's name) |
| `Enter` (serial field) | Send the line to the microcontroller |

### Copy and paste from one project to another

`Ctrl+C` puts **an SVG image** of the selection on the clipboard: pasted into a document, an e-mail or a drawing program, it still is the vector picture it always was. That same SVG quietly carries the diagram (parts, positions, settings, wires) inside a `<metadata>` tag that viewers ignore.

As a result, `Ctrl+V` in **another Kablix project** recreates the parts and their wires, offset by 20 px so they stay visible; a second paste offsets them again. Parts unknown to the receiving project (missing custom parts) are skipped, the rest is pasted. Pasting arbitrary text does nothing, and pasting is refused while a simulation runs.
