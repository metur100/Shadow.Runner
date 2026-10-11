import type { Box, Obstacle, ObstacleState } from '../entities/Obstacle';
import type { RunnerForm } from '../entities/RunnerForm';
import type { Side } from '../levels/LevelDefinition';
import { BODY, LANES } from '../utils/Constants';
import type { Support } from './RunnerSystem';

const CELL = 256;
/** Horizontal half-width of the lethal hitbox – a little narrower than the drawn body (forgiving). */
export const HIT_HALF_WIDTH = 13;
/** Extra margin that counts as a near miss. */
export const NEAR_MISS_MARGIN = 22;

/**
 * Spatial index over the obstacles of each world plus the collision queries the session needs:
 * what a form stands on, what kills it, and what it narrowly avoided. Obstacles are bucketed into
 * 256-unit cells over the whole range they can ever occupy, so each query only looks at a handful.
 * Obstacles in one lane only count while the runner's lateral position `lx` is close to that lane.
 */
export class CollisionSystem {
  /** Runner's lateral position (lane units), kept up to date by the session. */
  lx = 0;
  private readonly cells: Record<Side, Obstacle[][]> = { real: [], shadow: [] };
  private states: ObstacleState[] = [];
  private readonly box: Box = { x0: 0, x1: 0, y0: 0, y1: 0 };
  private readonly support: Support = { height: 0, vy: 0, platform: -1 };

  constructor(readonly obstacles: readonly Obstacle[]) {
    for (const o of obstacles) {
      const list = this.cells[o.side];
      const c0 = Math.max(0, Math.floor(o.minX / CELL));
      const c1 = Math.max(c0, Math.floor(o.maxX / CELL));
      for (let c = c0; c <= c1; c++) {
        (list[c] ??= []).push(o);
      }
    }
  }

  /** The session owns the mutable obstacle states (so it can snapshot them); collisions read them. */
  bindStates(states: ObstacleState[]): void {
    this.states = states;
  }

  /** Obstacles of a world that may be near `x`. Returns a shared array – do not keep it. */
  near(side: Side, x: number): readonly Obstacle[] {
    return this.cells[side][Math.max(0, Math.floor(x / CELL))] ?? EMPTY;
  }

  /** Whether the ground under `x` is missing (inside a pit, with a small forgiving edge). */
  overPit(side: Side, x: number): boolean {
    for (const o of this.near(side, x)) {
      if (o.kind === 'pit' && x > o.x + 12 && x < o.x + o.w - 12) return true;
    }
    return false;
  }

  /**
   * Highest surface under the runner at or below `h + reach`: the ground (unless over a pit) or an
   * active platform. `reach` lets a grounded runner follow small steps and moving platforms.
   */
  supportAt(side: Side, x: number, h: number, reach: number, t: number): Support {
    const s = this.support;
    s.height = null;
    s.vy = 0;
    s.platform = -1;
    const limit = h + reach;
    if (!this.overPit(side, x) && limit >= 0) s.height = 0;
    for (const o of this.near(side, x)) {
      if (o.kind !== 'platform') continue;
      const state = this.states[o.index];
      if (!o.isActive(t, state) || !this.inLane(o, 0)) continue;
      const px = o.platformX(t, state);
      if (x + BODY.halfWidth - 4 < px || x - BODY.halfWidth + 4 > px + o.w) continue;
      const top = o.platformTop(t, state);
      if (top > limit) continue;
      if (s.height === null || top > s.height) {
        s.height = top;
        s.platform = o.index;
      }
    }
    return s;
  }

  /** First obstacle that is lethal to `form` and overlaps its body, or null. */
  firstLethal(form: RunnerForm, x: number, t: number, bodyHeight: number): Obstacle | null {
    for (const o of this.near(form.side, x)) {
      if (!form.isLethal(o.kind, o.def.style)) continue;
      if (this.overlaps(o, x, form.h, bodyHeight, t, 0)) return o;
    }
    return null;
  }

  /**
   * Lethal obstacles that come within NEAR_MISS_MARGIN of the body without touching it. Each obstacle
   * counts once (state.nearMissed). Returns how many new near misses happened.
   */
  nearMisses(form: RunnerForm, x: number, t: number, bodyHeight: number): number {
    let count = 0;
    for (const o of this.near(form.side, x)) {
      const state = this.states[o.index];
      if (state.nearMissed || !form.isLethal(o.kind, o.def.style)) continue;
      // Light zones and gates are about choosing a form, not about precision – no near misses.
      if (o.kind === 'lightZone' || o.kind === 'gate' || o.kind === 'wall') continue;
      if (this.overlaps(o, x, form.h, bodyHeight, t, NEAR_MISS_MARGIN) && !this.overlaps(o, x, form.h, bodyHeight, t, 0)) {
        state.nearMissed = true;
        count++;
      }
    }
    return count;
  }

  /** Whether the runner is laterally inside the obstacle's lane (always true for whole-road obstacles). */
  private inLane(o: Obstacle, margin: number): boolean {
    return o.lane === null || Math.abs(this.lx - o.lane) < LANES.hit + margin / LANES.width;
  }

  private overlaps(o: Obstacle, x: number, h: number, bodyHeight: number, t: number, margin: number): boolean {
    if (!this.inLane(o, margin)) return false;
    const shape = o.shape(t, this.states[o.index], this.box);
    if (shape === null) return false;
    const bx0 = x - HIT_HALF_WIDTH - margin;
    const bx1 = x + HIT_HALF_WIDTH + margin;
    const by0 = h + 2 - margin;
    const by1 = h + bodyHeight - 4 + margin;
    const b = this.box;
    if (shape === 'box') return bx1 > b.x0 && bx0 < b.x1 && by1 > b.y0 && by0 < b.y1;
    // Circle: centre (x0, y0), radius x1.
    const cx = Math.max(bx0, Math.min(b.x0, bx1));
    const cy = Math.max(by0, Math.min(b.y0, by1));
    const dx = b.x0 - cx;
    const dy = b.y0 - cy;
    const r = b.x1 * 0.9;
    return dx * dx + dy * dy < r * r;
  }
}

const EMPTY: readonly Obstacle[] = [];
