import type { ObstacleKind } from '../levels/LevelDefinition';
import { RunnerForm } from './RunnerForm';

/**
 * The shadow character, running through the dark shadow world (bottom lane).
 * Collects crystals, activates shadow switches and phases straight through shadow walls –
 * but bright light destroys it.
 */
export class ShadowCharacter extends RunnerForm {
  readonly side = 'shadow' as const;
  readonly collects = 'crystal' as const;
  readonly label = 'Shadow';

  isLethal(kind: ObstacleKind): boolean {
    switch (kind) {
      case 'lightZone':
      case 'laser':
      case 'wall':
      case 'ceiling':
      case 'spikes':
      case 'blade':
      case 'falling':
      case 'train':
      case 'pendulum':
      case 'gate':
        return true;
      default:
        // 'shadowWall' is the shadow's own element: it passes through freely.
        return false;
    }
  }
}
