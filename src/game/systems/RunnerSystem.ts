import type { PhysicalCharacter } from '../entities/PhysicalCharacter';
import type { RunnerForm } from '../entities/RunnerForm';
import type { ShadowCharacter } from '../entities/ShadowCharacter';
import type { LevelDefinition } from '../levels/LevelDefinition';
import { BODY, PHYSICS } from '../utils/Constants';
import { smoothstep } from '../utils/MathUtils';
import type { CollisionSystem } from './CollisionSystem';

interface BoostZone {
  x0: number;
  x1: number;
  mult: number;
}

/**
 * Auto-run speed as a function of distance. Speed rises smoothly from `start` to `end` over the level
 * and is multiplied inside speed sections (which ease in and out over 160 units).
 *
 * Because the speed only depends on the distance, the time at which the runner reaches any point is
 * fixed. `timeAt(x)` exposes that, and timed obstacles use it to be in a designed state on arrival.
 */
export class SpeedProfile {
  private readonly boosts: BoostZone[];
  private readonly table: Float64Array;
  private static readonly STEP = 20;

  constructor(
    private readonly start: number,
    private readonly end: number,
    readonly length: number,
    boosts: BoostZone[] = [],
  ) {
    this.boosts = boosts;
    const n = Math.ceil((length + 4000) / SpeedProfile.STEP) + 2;
    this.table = new Float64Array(n);
    let t = 0;
    for (let i = 1; i < n; i++) {
      const x = (i - 0.5) * SpeedProfile.STEP;
      t += SpeedProfile.STEP / this.speedAt(x);
      this.table[i] = t;
    }
  }

  static forLevel(level: LevelDefinition): SpeedProfile {
    const boosts = level.obstacles
      .filter((o) => o.kind === 'boost')
      .map((o) => ({ x0: o.x, x1: o.x + o.w, mult: o.speed ?? 1.3 }));
    return new SpeedProfile(level.speed.start, level.speed.end, level.length, boosts);
  }

  speedAt(x: number): number {
    let v = this.start + (this.end - this.start) * smoothstep(0, this.length, x);
    for (const b of this.boosts) {
      if (x < b.x0 - 160 || x > b.x1 + 160) continue;
      const k = x < b.x0 ? smoothstep(b.x0 - 160, b.x0, x) : x > b.x1 ? 1 - smoothstep(b.x1, b.x1 + 160, x) : 1;
      v *= 1 + (b.mult - 1) * k;
    }
    return v;
  }

  /** Seconds the runner needs from x = 0 to `x` (without respawns). */
  timeAt(x: number): number {
    const f = Math.max(0, x) / SpeedProfile.STEP;
    const i = Math.min(this.table.length - 2, Math.floor(f));
    return this.table[i] + (this.table[i + 1] - this.table[i]) * (f - i);
  }
}

export interface Support {
  /** Height of the surface under the runner, or null over a pit. */
  height: number | null;
  /** Vertical speed of that surface (elevators). */
  vy: number;
  /** Index of the platform obstacle being stood on, or -1 for the ground. */
  platform: number;
}

/**
 * Horizontal auto-run and vertical motion for both forms. The forms share their horizontal position;
 * each has its own jump, slide and fall state.
 */
export class RunnerSystem {
  constructor(
    readonly profile: SpeedProfile,
    private readonly collisions: CollisionSystem,
  ) {}

  /** Advances the shared distance. Returns the speed used. */
  advance(x: number, dt: number): { x: number; speed: number } {
    const speed = this.profile.speedAt(x);
    return { x: x + speed * dt, speed };
  }

  /**
   * Vertical physics for one form.
   * Solid forms stand on ground and platforms and can fall into pits. A non-solid (inactive) form is an
   * echo: it finishes any jump in progress and then glides along the ground line, ignoring pits and
   * platforms, so it is always somewhere sensible when the player switches to it.
   */
  stepForm(form: RunnerForm, x: number, t: number, dt: number, solid: boolean, events: { landed: boolean; jumped: boolean }): void {
    events.landed = false;
    events.jumped = false;
    form.coyote = Math.max(0, form.coyote - dt);
    form.jumpBuffer = Math.max(0, form.jumpBuffer - dt);
    if (form.slideTimer > 0) form.slideTimer = Math.max(0, form.slideTimer - dt);

    if (form.dead) return;

    const support: Support = solid ? this.collisions.supportAt(form.side, x, form.h, 26, t) : { height: form.h > 0 ? null : 0, vy: 0, platform: -1 };
    if (!solid && form.h <= 0 && form.vy <= 0) {
      support.height = 0;
    }

    // A buffered jump fires as soon as there is something to jump from.
    const canJump = form.onGround || form.coyote > 0;
    if (form.jumpBuffer > 0 && canJump) {
      form.vy = form.jumpPower;
      form.onGround = false;
      form.coyote = 0;
      form.jumpBuffer = 0;
      form.slideTimer = 0;
      form.platform = -1;
      form.jumps++;
      events.jumped = true;
    }

    if (form.onGround) {
      if (support.height === null || Math.abs(support.height - form.h) > 26) {
        // Ran off an edge.
        form.onGround = false;
        form.coyote = PHYSICS.coyoteTime;
        form.platform = -1;
      } else {
        form.h = support.height;
        form.vy = 0;
        form.platform = support.platform;
        return;
      }
    }

    // Airborne.
    const gravity = form.dropping ? PHYSICS.gravity * 1.6 : PHYSICS.gravity;
    form.vy = Math.max(-PHYSICS.maxFall, form.vy - gravity * dt);
    if (form.dropping) form.vy = Math.min(form.vy, -PHYSICS.dropSpeed);
    const next = form.h + form.vy * dt;
    const landing = solid ? this.collisions.supportAt(form.side, x, form.h, 1, t) : { height: 0, vy: 0, platform: -1 };
    if (form.vy <= 0 && landing.height !== null && form.h >= landing.height - 1 && next <= landing.height) {
      form.h = landing.height;
      form.vy = 0;
      form.onGround = true;
      form.platform = landing.platform;
      events.landed = true;
      if (form.dropping) {
        form.dropping = false;
        // Dropping turns into a slide on landing.
        form.slideTimer = PHYSICS.slideTime * 0.6;
      }
      if (form.jumpBuffer > 0) {
        form.vy = form.jumpPower;
        form.onGround = false;
        form.jumpBuffer = 0;
        form.slideTimer = 0;
        form.jumps++;
        events.jumped = true;
      }
      return;
    }
    form.h = next;
  }

  /** Height of the form's collision box (smaller while sliding). */
  static bodyHeight(form: RunnerForm): number {
    return form.slideTimer > 0 ? BODY.slideHeight : BODY.height;
  }
}

export type { PhysicalCharacter, ShadowCharacter };
