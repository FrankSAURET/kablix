# Push button

![Push button](../img/button.png)

12 mm momentary tactile button. At rest the circuit is open; when pressed, it links its two contacts.

## Pins

| Pin | Role |
|--------|------|
| **1.l / 1.r** | First contact (left/right, always linked) |
| **2.l / 2.r** | Second contact (left/right) |

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `color` | Color | green |
| `label` | Text under the button | — |
| `key` | Keyboard shortcut | — |

## Usage

- Wiring: one contact to a pin in **`INPUT_PULLUP`**, the other to ground → reads `LOW` when pressed.
- **Ctrl+click**: keeps the button held down.
- Provide **debouncing**.

---

*Sheet adapted and translated from the [Wokwi documentation](https://docs.wokwi.com/parts/wokwi-pushbutton) — © Wokwi. `@wokwi/elements` components (MIT license).*
