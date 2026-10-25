import { IRPChip } from '../rpchip.js';
import { BasePeripheral, Peripheral } from './peripheral.js';

const FRCE_ON = 0x00;
const FRCE_OFF = 0x04;
const WDSEL = 0x08;
const DONE = 0x0c;

// KABLIX PATCH: the RP2350 PSM has 25 domains, PROC_COLD (bit 0) up to
// PROC1 (bit 24) — 0x1ffff was the RP2040 width. Truncated, the PROC1 bit
// never read back, and multicore_reset_core1() (MicroPython soft reset,
// Ctrl-D) spun forever waiting for it.
const PSM_BITS_MASK = 0x01ffffff;
const PSM_PROC1 = 1 << 24;

/**
 * RP2350 PSM (Power State Machine) peripheral.
 * Reference: RP2350 datasheet §7.4, base 0x40018000.
 */
export class RP2350PSM<ChipType extends IRPChip = IRPChip>
  extends BasePeripheral<ChipType>
  implements Peripheral
{
  private frceOn = 0;
  private frceOff = 0;
  private wdsel = 0;

  readUint32(offset: number) {
    switch (offset) {
      case FRCE_ON:
        return this.frceOn;
      case FRCE_OFF:
        return this.frceOff;
      case WDSEL:
        return this.wdsel;
      case DONE:
        return (PSM_BITS_MASK & ~this.frceOff) | (this.frceOn & this.frceOff);
    }
    return 0;
  }

  writeUint32(offset: number, value: number) {
    switch (offset) {
      case FRCE_ON:
        this.frceOn = value & PSM_BITS_MASK;
        break;
      case FRCE_OFF: {
        const avant = this.frceOff;
        this.frceOff = value & PSM_BITS_MASK;
        // KABLIX PATCH: releasing PROC1 restarts core 1 from the bootrom, as
        // the silicon does, so it is back in its launch wait loop.
        if (avant & PSM_PROC1 && !(this.frceOff & PSM_PROC1)) this.rpchip.core[1].reset();
        break;
      }
      case WDSEL:
        this.wdsel = value & PSM_BITS_MASK;
        break;
    }
  }
}
