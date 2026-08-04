# Relay OMRON G5V

![OMRON G5V relay](../../img/composants/relais.webp)

Electromechanical SPDT relay (one changeover contact). A coil, fed at its rated voltage, pulls a blade and moves the common from the **normally closed** contact to the **normally open** one. It fully separates the control side (the board) from the power side (lamp, motor, mains…).

## Pins

| Pin | Role |
|--------|------|
| **B1** | Coil, first terminal (no polarity) |
| **B2** | Coil, second terminal |
| **NF** | **Normally closed** contact (rest position) |
| **NO** | **Normally open** contact (energised position) |
| **Com** | Blade common — brought out on both sides of the case, it is the **same** pin |

Both "Com" pads are electrically identical: wiring one or the other is exactly the same, pick whichever routes better.

## Properties

| Property | Role | Default |
|-----------|------|--------|
| `voltage` | Coil voltage: 3, 5, 6, 9, 12 or 24 V | 5 |
| `angle` | Orientation (0/90/180/270°) | 0 |

The chosen voltage is **printed on the case** ("5VDC"), just like on the real part.

## Simulation

- The coil pulls in when the voltage reaching it is at least **80 % of its rated voltage** (the "must operate voltage") and the source can supply its current (about 40 mA for a 5 V G5V).
- Not enough voltage → the relay **does not work**, the common stays on NF.
- A **flyback diode is mandatory** between B1 and B2, **cathode towards the supply +**. Without it you get *"A flyback diode is required"*; wired the wrong way round, *"Flyback diode is reversed"* — in both cases the relay does not pull in.
- Every message **names the culprit** ("(Mod2)") **and draws a red frame around it** on the schematic, the same size as the selection rectangle: no more hunting for which relay to rework. The frame goes away once the fault is fixed, and when the simulation stops.
- Next to the frame, a **yellow-on-red label explains the problem** and what to fix (for instance: *"A relay coil is an inductor: when the current is cut it sends back a surge that destroys the driving transistor. The flyback diode absorbs it — it is not optional."*). It only shows while the simulation runs.
- Board output: a pin only sources 40 mA. Driving the coil directly barely makes it; the proper circuit uses a **transistor** (PN2222A) between the coil and ground.

## Usage

- Typical circuit: MCU pin → 1 kΩ resistor → PN2222A base; emitter to ground; collector to B2; B1 to +5 V; diode between B1 (cathode) and B2 (anode).
- The **NF** contact is the one for fail-safe circuits: with everything off, the circuit is already closed.

---

*Kablix in-house component — drawing by Frank Sauret.*
