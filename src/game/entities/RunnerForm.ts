import type { CollectibleKind, ObstacleKind, Side } from '../levels/LevelDefinition';
import { PHYSICS } from '../utils/Constants';

export type AnimationState = 'run' | 'jump' | 'fall' | 'slide' | 'hit' | 'idle';

/** Plain, cloneable state of one form. Kept free of methods so snapshots are cheap copies. */
export interface FormState {
  h: number;
  vy: number;
  onGround: boolean;
  coyote: number;
  jumpBuffer: number;
  jumpPower: number;
  slideTimer: number;
  dropping: boolean;
  platform: number;
  dead: boolean;
  jumps: number;
  slides: number;
  /** Coins (physical) or crystals (shadow) collected this run. */
  collected: number;
}

/**
 * One of the runner's two forms. Both forms share the horizontal position (owned by the session);
 * each has independent vertical motion, jump, slide and life state.
 */
export abstract class RunnerForm implements FormState {
  h = 0;
  vy = 0;
  onGround = true;
  coyote = 0;
  jumpBuffer = 0;
  jumpPower: number = PHYSICS.jumpMin;
  slideTimer = 0;
  dropping = false;
  platform = -1;
  dead = false;
  jumps = 0;
  slides = 0;
  collected = 0;
  /** Set by the switch system: the active form receives input and collides. */
  active = false;

  abstract readonly side: Side;
  /** Collectible this form picks up. */
  abstract readonly collects: CollectibleKind;
  abstract readonly label: string;

  /** Whether touching an obstacle of this kind (in this form's own world) is lethal. */
  abstract isLethal(kind: ObstacleKind, style?: string): boolean;

  constructor(h = 0) {
    this.h = h;
    this.onGround = h <= 0;
  }

  get sliding(): boolean {
    return this.slideTimer > 0;
  }

  get animation(): AnimationState {
    if (this.dead) return 'hit';
    if (this.slideTimer > 0 && this.onGround) return 'slide';
    if (!this.onGround) return this.vy > 0 ? 'jump' : 'fall';
    return 'run';
  }

  /** Queue a jump (performed now if grounded, or on landing within the buffer window). */
  requestJump(strength: number): void {
    this.jumpPower = PHYSICS.jumpMin + (PHYSICS.jumpMax - PHYSICS.jumpMin) * Math.max(0, Math.min(1, strength));
    this.jumpBuffer = PHYSICS.jumpBuffer;
    this.dropping = false;
  }

  /** A longer swipe / held key after take-off raises the jump a little. */
  extendJump(strength: number): void {
    if (this.onGround || this.vy <= 0) return;
    const target = PHYSICS.jumpMin + (PHYSICS.jumpMax - PHYSICS.jumpMin) * Math.max(0, Math.min(1, strength));
    if (target > this.jumpPower) {
      this.vy += target - this.jumpPower;
      this.jumpPower = target;
    }
  }

  /** Releasing the jump early makes it lower. */
  releaseJump(): void {
    if (!this.onGround && this.vy > PHYSICS.jumpCut) this.vy = PHYSICS.jumpCut;
  }

  /** Slide on the ground, or drop quickly when in the air. Jumping cancels a slide. */
  requestSlide(): void {
    this.jumpBuffer = 0;
    if (this.onGround) {
      this.slideTimer = PHYSICS.slideTime;
    } else {
      this.dropping = true;
      if (this.vy > 0) this.vy = 0;
    }
    this.slides++;
  }

  snapshot(): FormState {
    const { h, vy, onGround, coyote, jumpBuffer, jumpPower, slideTimer, dropping, platform, dead, jumps, slides, collected } = this;
    return { h, vy, onGround, coyote, jumpBuffer, jumpPower, slideTimer, dropping, platform, dead, jumps, slides, collected };
  }

  restore(state: FormState): void {
    Object.assign(this, state);
  }

  /** Back on the ground after a respawn. */
  resetMotion(): void {
    this.h = 0;
    this.vy = 0;
    this.onGround = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.slideTimer = 0;
    this.dropping = false;
    this.platform = -1;
    this.dead = false;
  }
}
