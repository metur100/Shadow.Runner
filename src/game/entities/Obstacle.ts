import type { Lane, ObstacleDef, ObstacleKind, Side } from '../levels/LevelDefinition';

/** Height used for "full height" obstacles (gates, lasers, light) – taller than any jump. */
export const FULL_HEIGHT = 1200;
/** Kinds that always span the whole road: their `lane` is ignored. */
const WHOLE_ROAD = new Set<ObstacleKind>(['pit', 'shadowWall', 'lightZone', 'laser', 'gate', 'boost']);
const FALL_GRAVITY = 2600;

/** Mutable state of an obstacle. Plain data so the session can snapshot it for checkpoints. */
export interface ObstacleState {
  open: boolean;
  hidden: boolean;
  off: boolean;
  /** Time a 'start' effect fired (moving things waiting for a trigger), or -1. */
  startedAt: number;
  /** Time a falling object / train was triggered, or -1. */
  triggeredAt: number;
  /** Time the runner first stood on a collapsing platform, or -1. */
  stoodAt: number;
  nearMissed: boolean;
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Runtime obstacle: static definition plus time-dependent geometry. All motion is a pure function of
 * the level clock and the obstacle state, so the same input sequence always produces the same run.
 *
 * Cycles (lasers, pulsing lights, timed doors, blinking platforms) and motions are phased relative to
 * `arrival` – the time at which the runner first reaches the obstacle – so level designers can say
 * "this laser is on when you get there" and it will be, on every device and every attempt.
 */
export class Obstacle {
  readonly kind: ObstacleKind;
  readonly side: Side;
  readonly x: number;
  /** Lane the obstacle occupies, or null when it spans the whole road. */
  readonly lane: Lane | null;
  readonly w: number;
  readonly y: number;
  readonly h: number;
  /** Phase origin of the cycle (level time at which the cycle phase is 0). */
  private readonly cycleOrigin: number;
  private readonly motionOrigin: number;
  /** Lowest x the obstacle can ever occupy and highest x it can reach – used for culling. */
  readonly minX: number;
  readonly maxX: number;

  constructor(
    readonly def: ObstacleDef,
    readonly index: number,
    readonly arrival: number,
  ) {
    this.kind = def.kind;
    this.side = def.side;
    this.x = def.x;
    this.lane = WHOLE_ROAD.has(def.kind) ? null : (def.lane ?? null);
    this.w = def.w;
    this.y = def.y ?? defaultY(def.kind);
    this.h = def.h ?? defaultH(def.kind);
    const cycle = def.cycle;
    if (cycle) {
      const target = cyclePhaseOnArrival(cycle.arrive ?? 'off', cycle.duty, cycle.period);
      this.cycleOrigin = arrival - target * cycle.period;
    } else {
      this.cycleOrigin = 0;
    }
    this.motionOrigin = arrival - (def.motion?.phase ?? 0) * (def.motion?.period ?? 1);
    let minX = this.x - 40;
    let maxX = this.x + this.w + 40;
    if (def.motion?.axis === 'x') {
      minX -= def.motion.amp;
      maxX += def.motion.amp;
    }
    if (this.kind === 'pendulum') {
      minX -= this.h + 40;
      maxX += this.h + 40;
    }
    // Trains drive towards the runner: they can be anywhere up to 3000 units before their start.
    if (this.kind === 'train') {
      minX -= 3000;
      maxX += 3000;
    }
    this.minX = minX;
    this.maxX = maxX;
  }

  initialState(): ObstacleState {
    return {
      open: this.def.open ?? false,
      hidden: this.def.hidden ?? false,
      off: this.def.off ?? false,
      startedAt: -1,
      triggeredAt: -1,
      stoodAt: -1,
      nearMissed: false,
    };
  }

  /** 0..1 position in the current cycle, or -1 without a cycle. */
  cyclePhase(t: number): number {
    const cycle = this.def.cycle;
    if (!cycle) return -1;
    const p = (t - this.cycleOrigin) / cycle.period;
    return p - Math.floor(p);
  }

  /** Cycle "on" state (dangerous light / active laser / closed door / present platform). */
  cycleOn(t: number): boolean {
    const cycle = this.def.cycle;
    if (!cycle) return true;
    return this.cyclePhase(t) < cycle.duty;
  }

  /** Seconds until the cycle flips to "on" (0 when already on). */
  timeUntilOn(t: number): number {
    const cycle = this.def.cycle;
    if (!cycle) return 0;
    const p = this.cyclePhase(t);
    return p < cycle.duty ? 0 : (1 - p) * cycle.period;
  }

  /** Offset of moving obstacles along their motion axis. */
  motionOffset(t: number, state: ObstacleState): number {
    const m = this.def.motion;
    if (!m) return 0;
    let origin = this.motionOrigin;
    if (m.waitForStart) {
      if (state.startedAt < 0) return 0;
      origin = state.startedAt;
    }
    const p = (t - origin) / m.period;
    // Starts at 0 and moves up (or forwards) first: sin from the zero crossing.
    return m.waitForStart ? m.amp * (1 - Math.cos(p * Math.PI * 2)) * 0.5 : m.amp * Math.sin(p * Math.PI * 2);
  }

  /** Whether the obstacle is currently present and dangerous / blocking. */
  isActive(t: number, state: ObstacleState): boolean {
    if (state.hidden) return false;
    switch (this.kind) {
      case 'gate':
        return !state.open && this.cycleOn(t);
      case 'lightZone':
      case 'laser':
        return !state.off && this.cycleOn(t);
      case 'platform':
        if (!this.cycleOn(t)) return false;
        return !(this.def.collapse !== undefined && state.stoodAt >= 0 && t - state.stoodAt > this.def.collapse + 0.12);
      default:
        return true;
    }
  }

  /** Top surface of a platform (including motion and collapse sag). */
  platformTop(t: number, state: ObstacleState): number {
    let top = this.y;
    if (this.def.motion?.axis === 'y') top += this.motionOffset(t, state);
    if (this.def.collapse !== undefined && state.stoodAt >= 0) {
      const since = t - state.stoodAt - this.def.collapse;
      if (since > 0) top -= 0.5 * FALL_GRAVITY * since * since;
    }
    return top;
  }

  platformX(t: number, state: ObstacleState): number {
    return this.def.motion?.axis === 'x' ? this.x + this.motionOffset(t, state) : this.x;
  }

  /** Pendulum bob centre (also used for rendering). */
  pendulumBob(t: number): { x: number; y: number; angle: number } {
    const swing = this.def.swing ?? 0.9;
    const period = this.def.motion?.period ?? 2;
    const angle = swing * Math.sin(((t - this.motionOrigin) / period) * Math.PI * 2);
    const pivotX = this.x + this.w / 2;
    // y = pivot height, h = rope length.
    return { x: pivotX + Math.sin(angle) * this.h, y: this.y - Math.cos(angle) * this.h, angle };
  }

  /** Current height of a falling object's bottom edge. */
  fallingBottom(t: number, state: ObstacleState): number {
    if (state.triggeredAt < 0) return this.y;
    const s = t - state.triggeredAt;
    return Math.max(0, this.y - 0.5 * FALL_GRAVITY * s * s);
  }

  trainX(t: number, state: ObstacleState): number {
    if (state.triggeredAt < 0) return this.x;
    return this.x - (this.def.speed ?? 320) * (t - state.triggeredAt);
  }

  /**
   * Lethal geometry at time t. Writes the box into `out` and returns 'box', 'circle' (centre x0/y0,
   * radius in x1) or null when there is nothing that can hurt.
   */
  shape(t: number, state: ObstacleState, out: Box): 'box' | 'circle' | null {
    if (!this.isActive(t, state)) return null;
    switch (this.kind) {
      case 'wall':
        return setBox(out, this.x, this.x + this.w, 0, this.h);
      case 'spikes':
        // The tips are narrower than the base: a slightly forgiving box.
        return setBox(out, this.x + 6, this.x + this.w - 6, 0, this.h * 0.8);
      case 'ceiling':
        return setBox(out, this.x, this.x + this.w, this.y, FULL_HEIGHT);
      case 'gate':
        return setBox(out, this.x, this.x + this.w, 0, FULL_HEIGHT);
      case 'laser':
        return setBox(out, this.x, this.x + this.w, 0, FULL_HEIGHT);
      case 'lightZone': {
        const x = this.def.motion?.axis === 'x' ? this.x + this.motionOffset(t, state) : this.x;
        return setBox(out, x, x + this.w, 0, FULL_HEIGHT);
      }
      case 'falling': {
        const bottom = this.fallingBottom(t, state);
        return setBox(out, this.x, this.x + this.w, bottom, bottom + this.h);
      }
      case 'train': {
        const x = this.trainX(t, state);
        return setBox(out, x, x + this.w, 0, this.h);
      }
      case 'pendulum': {
        const bob = this.pendulumBob(t);
        out.x0 = bob.x;
        out.y0 = bob.y;
        out.x1 = 30;
        return 'circle';
      }
      case 'blade': {
        const dx = this.def.motion?.axis === 'x' ? this.motionOffset(t, state) : 0;
        const dy = this.def.motion?.axis === 'y' ? this.motionOffset(t, state) : 0;
        if (this.def.style === 'sign' || this.def.style === 'silhouette') {
          return setBox(out, this.x + dx, this.x + dx + this.w, this.y + dy, this.y + dy + this.h);
        }
        out.x0 = this.x + this.w / 2 + dx;
        out.y0 = this.y + dy;
        out.x1 = this.w / 2;
        return 'circle';
      }
      default:
        return null;
    }
  }
}

function setBox(out: Box, x0: number, x1: number, y0: number, y1: number): 'box' {
  out.x0 = x0;
  out.x1 = x1;
  out.y0 = y0;
  out.y1 = y1;
  return 'box';
}

function defaultY(kind: ObstacleKind): number {
  switch (kind) {
    case 'ceiling':
      return 50;
    case 'falling':
      return 420;
    case 'pendulum':
      return 380;
    case 'blade':
      return 60;
    default:
      return 0;
  }
}

function defaultH(kind: ObstacleKind): number {
  switch (kind) {
    case 'wall':
      return 300;
    case 'spikes':
      return 34;
    case 'falling':
      return 64;
    case 'train':
      return 220;
    case 'pendulum':
      return 250;
    case 'blade':
      return 50;
    default:
      return 0;
  }
}

/** Cycle phase (0..1) the obstacle should be at when the runner arrives. */
export function cyclePhaseOnArrival(arrive: 'on' | 'off' | 'opening' | 'closing', duty: number, period: number): number {
  const lead = Math.min(0.3 / period, 0.25);
  switch (arrive) {
    case 'on':
      return duty / 2;
    case 'off':
      return duty + (1 - duty) / 2;
    case 'opening':
      // Just before switching on.
      return Math.max(duty, 1 - Math.min(lead, (1 - duty) / 2));
    case 'closing':
      // Just before switching off.
      return Math.max(0, duty - Math.min(lead, duty / 2));
  }
}
