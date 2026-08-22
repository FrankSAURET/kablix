import { IRPChip } from '../rpchip.js';

export interface IGDBTarget<ChipType extends IRPChip = IRPChip> {
  readonly executing: boolean;
  rpchip: ChipType;

  execute(): void;
  stop(): void;
}
