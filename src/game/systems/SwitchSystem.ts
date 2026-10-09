import type { Form } from '../levels/LevelDefinition';
import { SWITCH_COOLDOWN } from '../utils/Constants';

/**
 * Which form is active. Switching has a short cooldown so a double tap cannot flip twice by accident,
 * and is locked during the level-complete animation. Forced switches (phase portals) ignore the
 * cooldown and do not count towards the player's switch total.
 */
export class SwitchSystem {
  active: Form;
  cooldown = 0;
  /** Player-initiated switches this run. */
  count = 0;
  locked = false;

  constructor(start: Form) {
    this.active = start;
  }

  get inactive(): Form {
    return this.active === 'real' ? 'shadow' : 'real';
  }

  /** 1 = just switched, 0 = ready (drives the cooldown ring). */
  get cooldownFraction(): number {
    return this.cooldown / SWITCH_COOLDOWN;
  }

  tick(dt: number): void {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
  }

  canSwitch(): boolean {
    return !this.locked && this.cooldown <= 0;
  }

  /** Player switch. Returns false when blocked by the cooldown or the lock. */
  trySwitch(): boolean {
    if (!this.canSwitch()) return false;
    this.active = this.inactive;
    this.cooldown = SWITCH_COOLDOWN;
    this.count++;
    return true;
  }

  /** Switch caused by the level (phase portals). */
  force(to: Form): boolean {
    if (this.locked || this.active === to) return false;
    this.active = to;
    this.cooldown = SWITCH_COOLDOWN;
    return true;
  }
}
