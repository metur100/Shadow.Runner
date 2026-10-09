import type { ObstacleKind } from '../levels/LevelDefinition';
import { RunnerForm } from './RunnerForm';

/**
 * The physical character, running through the colourful reality world (top lane).
 * Collects coins, activates physical switches and is stopped by every solid obstacle.
 * Light is harmless to it.
 */
export class PhysicalCharacter extends RunnerForm {
  readonly side = 'real' as const;
  readonly collects = 'coin' as const;
  readonly label = 'Runner';

  isLethal(kind: ObstacleKind): boolean {
    switch (kind) {
      case 'wall':
      case 'ceiling':
      case 'spikes':
      case 'blade':
      case 'laser':
      case 'falling':
      case 'train':
      case 'pendulum':
      case 'gate':
        return true;
      default:
        // Shadow walls, light, platforms, pits (handled as falls) and boosts never hurt the physical form.
        return false;
    }
  }
}
