# Creating a Kablix part (drawing, internal schematic, simulation)

This guide describes the full chain followed by every part added since v2026.7.229: **a drawing in `Composants.svg` → a part you can drop, wire, simulate, test and document**. It is aimed at people working on **the repository** (built-in part, recompilation) — for a part you keep to yourself, without touching the code, the quick route is still the `.kablix-part.json` file described in [Editing part SVGs](Editing-svg-components.md).

Two ways to follow it: [by hand](#by-hand-the-full-chain), step by step, or [handing it to an AI](#with-an-ai) that you supply with the drawing and the rules of the game. Both go through the same files — the AI section is only a shortcut along the same road.

---

## What you need

- The repository cloned, `npm install` done, Node 20+.
- **Inkscape** (or any SVG editor) to draw in `Composants.svg`.
- **Chrome / Chromium** installed: extraction and illustration captures go through a headless browser (SVG geometry — CTM, `getBBox`, `defs` — cannot be resolved with regular expressions).

---

## The chain at a glance

| # | Step | File(s) touched |
| --- | --- | --- |
| 1 | Draw the part and its internal schematic | `Composants.svg` |
| 2 | Extract the SVGs | `src/webview/composants/externe/<type>.svg`, `.../interne/<type>-interne.svg` |
| 3 | Write the element | `src/webview/composants/<type>-element.mts` + one import in `src/webview/sim.mts` |
| 4 | Register it in the catalog | `src/webview/diagram/catalog.mts`, `src/webview/diagram/refnames.mts` |
| 5 | Hook up the internal schematic | `src/webview/diagram/internal-wiring.mts` |
| 6 | Give it a behaviour | `src/webview/diagram/model.mts` or `src/webview/engines/*.mts` |
| 7 | Translate | `src/webview/i18n.mts` |
| 8 | Two test files (Uno + Pico) | `testkablix/_spec.mjs`, `testkablix/README.md` |
| 9 | The help sheet in FR + EN and its picture | `docs/{fr,en}/composants/<type>.md`, `docs/img/composants/<type>.webp` |
| 10 | Ship | `todo.md`, `package.json`, build, `verify:all`, commit |

A purely decorative part stops at step 5. A part that must *do* something during simulation walks the whole road.

---

## By hand, the full chain

### 1. Draw in `Composants.svg`

`Composants.svg` is an A3 Inkscape sheet (units in **mm**) holding every original drawing. Its rules are not decorative: the extractor relies on them.

- **One part = one group whose `id` is the part name** (`diode`, `relais`, `moteur-dc`). That name becomes the part `type` everywhere else in the chain.
- **Its internal schematic = a group named `<name>-interne`** (`diode-interne`). No internal group simply means no **K** button on the part.
- The outside drawing and the internal schematic carry **the same pins**: same names, same order, same positions. That is what lets one be laid over the other without any realignment.
- The **red pads** (circles with `fill:#ee0000`) mark the connection points; **the centre of the pad is where the wire attaches**. The text placed just above gives **the pin name** (`A`, `K`, `B1`, `VCC`…). `nc` means not connected: drawn, but with no attachment point.
- Pads and labels are **working marks**: the extractor strips them from the delivered drawing.

> The 10 px pitch (0.1″, the pitch of breadboard holes) is the only hard geometric constraint. The extractor picks the delivered frame so that **every pad lands on a multiple of 10 px**, with at least 10 px of margin around; if your drawing puts two pins 9.7 px apart, no frame will save it.

### 2. Extract the SVGs

```bash
node scripts/_extract-composants.mjs diode
```

Output: `src/webview/composants/externe/diode.svg` (cleaned drawing, in grid pixels) and, if the group exists, `src/webview/composants/interne/diode-interne.svg`. The command prints the chosen frame and the position of every pin — **that list gives the coordinates to copy into `pinInfo`**.

| Option | Effect |
| --- | --- |
| `--png` | Produces a PNG preview only, writing nothing into `src/` — to check a drawing in progress. |
| `--drop=id1,id2` | Leaves elements out of the drawing by `id` (a sheet label, a construction mark). |
| `--suffix=-libre` | Adds a suffix to the file name produced (two variants of the same group). |
| `NPN1@to92` | Extracts `NPN1` **as an internal schematic**, aligned on the frame of the `to92` package already extracted (see below). |

Several names on the same command line are extracted in one go; a package named as a host (`…@to92`) must appear **before** on the line.

> Re-extracting a part rewrites **its outside drawing too**. If that outside file had been retouched since (a package watermark, say), restore it with `git checkout` after extraction — and capture the help picture again.

### 3. Write the element

A visible part is a Lit element in `src/webview/composants/<type>-element.mts`. Since v2026.6.87 there is no dependency on `@wokwi/elements` left: these are **local forks**, `kablix-*` tags, **plain Lit without decorators** (`static properties` + `declare`). The shortest model is [`diode-element.mts`](../../src/webview/composants/diode-element.mts):

```ts
import { css, html, LitElement } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { ElementPin } from './pin.mjs';
import drawing from './externe/diode.svg';

export class DiodeElement extends LitElement {
  // Threshold voltage (V) — informative on the drawing side, used by the model.
  declare vf: number;

  static properties = {
    vf: { type: Number },
  };

  constructor() {
    super();
    this.vf = 0.6;
  }

  // Pins: centre of the drawing pads (10 px grid, K on the band side).
  readonly pinInfo: ElementPin[] = [
    { name: 'K', x: 10, y: 10, signals: [] },
    { name: 'A', x: 50, y: 10, signals: [] },
  ];

  static get styles() {
    return css`
      :host { display: inline-block; }
    `;
  }

  render() {
    return html`
      <svg width="60" height="20" viewBox="0 0 60 20" xmlns="http://www.w3.org/2000/svg">
        ${unsafeSVG(drawing)}
      </svg>
    `;
  }
}

if (!customElements.get('kablix-diode')) {
  customElements.define('kablix-diode', DiodeElement);
}
```

Three things not to miss:

1. The `width`, `height` and `viewBox` of the `<svg>` repeat **exactly** the frame announced by the extractor; `pinInfo` repeats **exactly** the positions announced.
2. Every property is declared twice: `declare` (for TypeScript) and `static properties` (for Lit). Forget the `properties` side and the attribute redraws nothing.
3. The file does nothing until it is **imported**: add `import './composants/<type>-element.mjs';` to the list at the top of [`src/webview/sim.mts`](../../src/webview/sim.mts) (`.mjs` extension — that is the compiled name).

#### Shared packages (TO-92, TO-220…)

A package serves dozens of parts: **it is a drawing, not a part**. Its SVG lives in `src/webview/composants/externe/<package>.svg` and the element **dresses** it — the marking (`PN`, `2222A`…) is written by the part, never by the drawing. Adding a package means **one entry in the `PACKAGES` table** of [`transistor-element.mts`](../../src/webview/composants/transistor-element.mts), not a new element:

```ts
export const PACKAGES = {
  to92:  { svg: to92,  w: 40, h: 50, pinY: 40, pinX: [10, 20, 30], tx: 19.77, cy: 15.47, tw: 11.8, font: 3.8, fill: '#e6e6e6' },
  to220: { svg: to220, w: 60, h: 90, pinY: 80, pinX: [20, 30, 40], tx: 30,    cy: 50.25, tw: 32,   font: 5.5, fill: '#e6e6e6' },
} as const;
```

Two levels live side by side: the **fixed reference** (`pn2222a` — marking and parameters settled) and the **generic prototype** (`npn`, `pnp` — everything is a property). An internal schematic will be reused: keep it generic, pins numbered 1/2/3 on the prototype side, named on the reference side.

### 4. Register it in the catalog

[`catalog.mts`](../../src/webview/diagram/catalog.mts) is the list of parts in the palette. One entry is enough:

```ts
{
  type: 'diode', label: 'Diode', tag: 'kablix-diode', kind: 'diode', attrs: { vf: '0.6' },
  props: [
    { attr: 'vf', label: 'Threshold voltage (V)', kind: 'number', min: 0, max: 5, step: 0.1 },
  ],
},
```

| Field | Role |
| --- | --- |
| `type` | Part identifier: name of the SVG group, name of the help sheet, name inside `.projix` files. It **never changes** once published (saved projects contain it). |
| `label` | Displayed name, **written in English**: it is the translation key (step 7). |
| `tag` | Element tag (`kablix-…`). |
| `kind` | Behaviour family (`diode`, `resistor`, `transistor`, `logic-ic`, `motor`…). It decides both the **simulation** and the **palette category** (function at the end of `catalog.mts`, order in `CATEGORY_ORDER`). |
| `attrs` | Default property values, as strings. |
| `props` | What the inspector shows: `number` (with `min`/`max`/`step`, `suffixes: true` for k/M), `select` (with `options`), `text`. |
| `simControl` | `true` if the part carries a slider or a button **while simulating** (see step 6). |
| `variant` | `true` for a type that stays valid but **no longer appears** in the palette (an old variant of a merged part). |

Finally add its **reference prefix** in [`refnames.mts`](../../src/webview/diagram/refnames.mts): the `FAMILIES` table gives the prefix per language (`diode: { en: 'D', fr: 'D' }`) and the next table maps the `kind` to its family. Without it, the part you drop would be named after the default catch-all.

### 5. Hook up the internal schematic

The internal schematic is the wiring shown through the **K** button. It is mounted in [`internal-wiring.mts`](../../src/webview/diagram/internal-wiring.mts):

```ts
import diodeSchema from '../composants/interne/diode-interne.svg';
const DIODE_SCHEMA = parseSchema(diodeSchema);
```

Two cases:

- **Schematic drawn with the part** (group `<name>-interne`): same `viewBox` as the outside drawing, so **it lays over as is** — simply scaled to the part box.
- **Shared package schematic** (`NPN1`, `PNP1`, `NMOS-D`…): it is placed **by translating onto pin 1** (constant `TRANSISTOR_SCHEMA_PIN1`), **never by `scale`**. That is what keeps a TO-220, twice as tall as a TO-92, with its symbol at the same distance from its pins. Change a package frame and that constant follows.

A schematic may vary with an attribute: the seven-segment display turns its eight diodes towards the common pin according to `attrs.common`, transistors pick their symbol from the `schema` attribute.

### 6. Give it a simulation behaviour

Three routes, depending on the nature of the part. **Invent nothing**: the expected behaviour is decided case by case, it cannot be guessed from the drawing.

**a. Electrical part** — [`model.mts`](../../src/webview/diagram/model.mts). This is where the netlist lives: level propagation (`netLevel`), resistive graph, dividers, currents. The `kind` is the switch. Diode example: a **directed** edge that only lets current through from A to K, losing its threshold voltage (`vf`) — which is enough to drop the voltage of a LED downstream by that much.

**b. Part adjustable while simulating** — `simControl: true` in the catalog. The editor then sets the `simulating` attribute on the element while the simulation runs (and removes it when it stops); the element shows its slider or button **only in that state**, and fires an `input` event that `sim.mts` reads back to update the value. That is how the LDR, the NTC, the potentiometer and the flame and gas sensors are built.

**c. Bus device or protocol part** — `src/webview/engines/`: `i2c-devices.mts` (LCD, OLED, PCA9685…), `ws2812.mts`, `ultrasonic.mts`, `dht22.mts`. What is implemented there is the conversation, not the electricity.

A wiring fault (missing flyback diode, supply out of range, LED without a resistor) is reported by a **translated** error message and, where it applies, by blowing up the offending part — the label explains the cause, it does not merely name it.

### 7. Translate

Source strings are **in English**; [`i18n.mts`](../../src/webview/i18n.mts) holds the French dictionary, English key → translation. Concerned are: the catalog `label`, the property `label`s, the pin names displayed, the simulation control captions, the fault messages. Everything the user reads goes through it. `npm run verify:i18n` reports orphan keys.

### 8. The test files

Every new part gets **two** tests: one Arduino (`<type>-uno`) and one Pico (`<type>-pico`). They are not written by hand: the circuit is described in [`testkablix/_spec.mjs`](../../testkablix/_spec.mjs) (known pins of the type in `PART_PINS`, then a `test({ name, board, ext, parts, wires, code })` block), then generated:

```bash
node testkablix/_generate.mjs diode-uno diode-pico
```

> **Always name the tests to generate.** With no argument, `_generate.mjs` rewrites **every** file of the folder from the spec — and several `.ino`/`.py` files were retouched by hand after generation. Likewise, a board already retouched keeps the `x`/`y` of its spec: reworking a test does not rearrange the layout.

Add the part line to `testkablix/README.md`, then an automated check if the behaviour lends itself to it: the `scripts/verify-*.mjs` scripts render the real editor in headless Chrome and measure the result (`npm run verify:transistor`, `verify:motor`, `verify:capacitor`…).

### 9. The help sheet

Mandatory, **in French and in English**: `docs/fr/composants/<type>.md` and `docs/en/composants/<type>.md`, with at least one picture. The picture is produced by capturing the real element, never by a hand-made screenshot:

```bash
node scripts/_capture-part.mjs diode
```

The script renders the element in headless Chrome, on a transparent background, and writes `docs/img/composants/<type>.webp`. You first have to describe the variant to illustrate in its `PARTS` table (module, tag, attributes, output width if the part is narrow and tall). `npm run verify:docs` then checks FR/EN parity, that the pictures are there, and that no catalog type was left without a sheet.

### 10. Ship

```bash
npm run typecheck
npm run build
npm run verify:all
```

Then the repository ritual: `todo.md` up to date (version number **above** its items), version bumped in `package.json` (`YEAR.MONTH.increment`), commit, push. The `.vsix` is only built on request.

---

## With an AI

An agentic AI (Claude Code, for instance) handles steps 2 to 9 very well: they are mechanical steps, guided by existing files that serve as models. It does **not** do step 1 — the drawing — and it does **not** guess the electrical behaviour expected.

### What it already knows

The `CLAUDE.md` file at the root of the repository describes the conventions (the `Composants.svg` sheet, shared packages, mandatory tests, mandatory help sheet, code style). An AI reading the repository therefore starts with the rules in hand: no need to repeat them in your request.

### What you have to tell it

These five points are written nowhere in the code:

1. **The exact group name** you have just drawn in `Composants.svg` — the file also holds works in progress, which must not be picked up.
2. **The simulation behaviour**, in plain words: "the diode only conducts from A to K, losing `vf`", "above 1.5 times its rated voltage the motor burns out", "without a flyback diode the transistor blows up". Without that sentence, the AI will invent a plausible and wrong model.
3. **The properties** shown in the inspector, with their units, their bounds and their default value.
4. For a shared package: **what is written on it** (one line per line break) and **which internal schematic** it carries.
5. What you want to see in the **test circuits** — otherwise it will pick a plausible one, and it is on you to read it.

### A request template

```text
Add the part <name> to Kablix. The drawing and its internal schematic
<name>-interne are in Composants.svg.

Pins: <list and role of every pin>.
Properties: <name, unit, bounds, default value>.
Simulation: <the behaviour in one or two sentences, faults included>.

Do the full chain: extraction, element, catalog, reference prefix, internal
schematic, simulation model, FR/EN translations, tests <name>-uno and
<name>-pico (generated, not hand-written), help sheet in FR + EN with its
captured picture. Then typecheck, build, verify:all.
```

Point at a close part already integrated (`diode` for a two-pin part, `transistor` for a shared package, `moteur-dc` for an actuator with faults): "do it like the diode" saves a lot of back and forth.

### What to read back

| To check | Why |
| --- | --- |
| The `pinInfo` positions | One digit copied wrong shifts every connection of the part. |
| The simulation model | It is the one place where an AI can produce something coherent **and** wrong. |
| The regenerated test files | `git status` must only show the tests of the batch: generating with no argument overwrites the whole folder. |
| The help sheet picture | It must come from `_capture-part.mjs`, not from a screenshot. |
| The wording of sheets and messages | Sentences translated word for word stand out immediately. |

---

## Quick reference

- The SVG group name = the part `type` = the name of its help sheet = the name of its tests. One name, everywhere.
- The centre of a red pad is the connection point; everything lands on the 10 px grid.
- Outside drawing and internal schematic carry the same pins, in the same order.
- A package is a shared drawing: you dress it, you do not duplicate it.
- Nothing shows up until the element is imported in `sim.mts` **and** registered in `catalog.mts`.
- Two tests (Uno + Pico) and two help sheets (FR + EN): not optional.
- `_generate.mjs` with no argument overwrites the whole test folder.
