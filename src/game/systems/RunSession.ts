import { Checkpoint } from '../entities/Checkpoint';
import { Collectible } from '../entities/Collectible';
import { Obstacle, type ObstacleState } from '../entities/Obstacle';
import { PhysicalCharacter } from '../entities/PhysicalCharacter';
import { Portal } from '../entities/Portal';
import type { FormState, RunnerForm } from '../entities/RunnerForm';
import { ShadowCharacter } from '../entities/ShadowCharacter';
import { INTERACT_RANGE, Switch } from '../entities/Switch';
import type { CollectibleKind, EffectAction, Form, Lane, LevelDefinition, ObstacleKind, Side } from '../levels/LevelDefinition';
import { LANES, PHYSICS } from '../utils/Constants';
import { CollisionSystem } from './CollisionSystem';
import { CrossWorldInteractionSystem, type AppliedEffect, type PendingRevert } from './CrossWorldInteractionSystem';
import { RunnerSystem, SpeedProfile } from './RunnerSystem';
import type { RunStats } from './ScoreSystem';
import { SwitchSystem } from './SwitchSystem';

export type FailReason =
  | 'wall'
  | 'spikes'
  | 'ceiling'
  | 'light'
  | 'laser'
  | 'blade'
  | 'pendulum'
  | 'falling'
  | 'train'
  | 'gate'
  | 'fell'
  | 'missedPortal'
  | 'time';

export type SimEvent =
  | { type: 'jump' | 'land' | 'slide' | 'drop'; form: Side }
  | { type: 'switch'; to: Form; forced: boolean }
  | { type: 'switchBlocked' }
  | { type: 'lane'; lane: Lane }
  | { type: 'laneBlocked'; dir: -1 | 1 }
  | { type: 'collect'; kind: CollectibleKind; side: Side; index: number }
  | { type: 'trigger'; index: number; side: Side }
  | { type: 'effect'; target: number; action: EffectAction }
  | { type: 'portal'; index: number }
  | { type: 'checkpoint'; index: number }
  | { type: 'nearMiss'; form: Side }
  | { type: 'hit'; form: Side; reason: FailReason; obstacle: number }
  | { type: 'respawn' }
  | { type: 'complete' }
  | { type: 'fail'; reason: FailReason; form: Side }
  | { type: 'eclipse'; on: boolean };

export type SessionState = 'running' | 'hit' | 'complete' | 'failed';

/** Seconds the run freezes after a hit before respawning (or failing). */
export const HIT_PAUSE = 0.9;

interface Snapshot {
  x: number;
  t: number;
  lane: Lane;
  lx: number;
  active: Form;
  cooldown: number;
  forms: [FormState, FormState];
  /** States of the obstacles that can change (switch targets, falling objects, trains, collapsing floors). */
  dynamic: ObstacleState[];
  collected: Uint8Array;
  switchesOn: Uint8Array;
  portalsUsed: Uint8Array;
  pending: PendingRevert[];
  coins: number;
  crystals: number;
  keys: number;
  eclipse: boolean;
}

export interface SessionOptions {
  /** Overrides level.lives (endless mode uses 1). */
  lives?: number;
  /** Endless mode: no exit portal, no time limit. */
  endless?: boolean;
}

const REASON_BY_KIND: Partial<Record<ObstacleKind, FailReason>> = {
  wall: 'wall',
  spikes: 'spikes',
  ceiling: 'ceiling',
  lightZone: 'light',
  laser: 'laser',
  blade: 'blade',
  pendulum: 'pendulum',
  falling: 'falling',
  train: 'train',
  gate: 'gate',
};

/**
 * One run through a level, independent of Phaser: owns both forms, the obstacles' state, collectibles,
 * switches, portals, checkpoints and lives, and advances everything in fixed steps. The scene feeds it
 * input and renders its state; tests and the level verifier drive it directly.
 */
export class RunSession {
  readonly profile: SpeedProfile;
  readonly obstacles: Obstacle[];
  readonly collectibles: Collectible[];
  readonly switches: Switch[];
  readonly portals: Portal[];
  readonly checkpoints: Checkpoint[];
  readonly physical: PhysicalCharacter;
  readonly shadow: ShadowCharacter;
  readonly switcher: SwitchSystem;
  readonly collisions: CollisionSystem;
  readonly interactions: CrossWorldInteractionSystem;
  private readonly runner: RunnerSystem;

  state: SessionState = 'running';
  x = 0;
  /** Target lane (both forms share it) and the current lateral position in lane units. */
  lane: Lane = 0;
  lx = 0;
  laneChanges = 0;
  speed = 0;
  /** Level clock: drives every moving obstacle. Restored on respawn. */
  t = 0;
  /** Real time spent in the level, including respawns (for the time limit and score). */
  playTime = 0;
  lives: number;
  readonly maxLives: number;
  damage = 0;
  nearMisses = 0;
  coins = 0;
  crystals = 0;
  keys = 0;
  checkpointIndex = -1;
  checkpointsReached = 0;
  maxX = 0;
  eclipse = false;
  hitTimer = 0;
  failure: { reason: FailReason; form: Side; obstacle: number } | null = null;
  obstacleStates: ObstacleState[];
  collected: Uint8Array;
  switchesOn: Uint8Array;
  portalsUsed: Uint8Array;
  readonly events: SimEvent[] = [];
  readonly totalCollectibles: number;
  readonly endless: boolean;

  private snapshotAtCheckpoint: Snapshot;
  private readonly applied: AppliedEffect[] = [];
  private readonly stepEvents = { landed: false, jumped: false };
  private readonly obstacleIds = new Map<string, number>();
  private readonly dynamicIndices: number[];
  private readonly bothForms: readonly RunnerForm[];

  constructor(
    readonly level: LevelDefinition,
    options: SessionOptions = {},
  ) {
    this.endless = options.endless ?? false;
    this.profile = SpeedProfile.forLevel(level);
    this.obstacles = level.obstacles.map((def, i) => new Obstacle(def, i, this.profile.timeAt(def.x)));
    this.obstacles.forEach((o) => {
      if (o.def.id) this.obstacleIds.set(o.def.id, o.index);
    });
    this.obstacleStates = this.obstacles.map((o) => o.initialState());
    this.dynamicIndices = this.obstacles
      .filter((o) => o.def.id !== undefined || o.kind === 'falling' || o.kind === 'train' || o.def.collapse !== undefined)
      .map((o) => o.index);
    this.collectibles = [...level.collectibles].sort((a, b) => a.x - b.x).map((def, i) => new Collectible(def, i));
    this.switches = [...level.switches].sort((a, b) => a.x - b.x).map((def, i) => new Switch(def, i));
    this.portals = [...level.portals].sort((a, b) => a.x - b.x).map((def, i) => new Portal(def, i));
    this.checkpoints = [...level.checkpoints].sort((a, b) => a - b).map((x, i) => new Checkpoint(x, i));
    this.collected = new Uint8Array(this.collectibles.length);
    this.switchesOn = new Uint8Array(this.switches.length);
    this.portalsUsed = new Uint8Array(this.portals.length);
    this.totalCollectibles = this.collectibles.filter((c) => c.kind !== 'key').length;

    this.collisions = new CollisionSystem(this.obstacles);
    this.collisions.bindStates(this.obstacleStates);
    this.interactions = new CrossWorldInteractionSystem(level.interactions, this.obstacleIds);
    this.runner = new RunnerSystem(this.profile, this.collisions);

    this.physical = new PhysicalCharacter(level.spawn.real.h);
    this.shadow = new ShadowCharacter(level.spawn.shadow.h);
    this.switcher = new SwitchSystem(level.spawn.form);
    this.bothForms = [this.physical, this.shadow];
    this.x = level.spawn.real.x;
    this.speed = this.profile.speedAt(this.x);
    this.maxX = this.x;
    this.maxLives = options.lives ?? level.lives;
    this.lives = this.maxLives;
    this.syncActive();
    this.snapshotAtCheckpoint = this.snapshot();
  }

  // ───────────────────────────── queries ─────────────────────────────

  get active(): Form {
    return this.switcher.active;
  }

  form(side: Side): RunnerForm {
    return side === 'real' ? this.physical : this.shadow;
  }

  get activeForm(): RunnerForm {
    return this.form(this.switcher.active);
  }

  /** Whether a form currently collides / collects (the active one, or both during an eclipse). */
  isSolid(side: Side): boolean {
    return this.eclipse || this.switcher.active === side;
  }

  get progress(): number {
    return this.endless ? 0 : Math.min(1, this.x / this.level.length);
  }

  get timeLeft(): number {
    return this.level.timeLimit - this.playTime;
  }

  obstacleById(id: string): Obstacle | undefined {
    const i = this.obstacleIds.get(id);
    return i === undefined ? undefined : this.obstacles[i];
  }

  stats(): RunStats {
    return {
      completed: this.state === 'complete',
      progress: this.state === 'complete' ? 1 : Math.min(1, this.maxX / this.level.length),
      distance: this.state === 'complete' ? this.level.length : this.maxX,
      coins: this.coins,
      crystals: this.crystals,
      keys: this.keys,
      totalCollectibles: this.totalCollectibles,
      timeUsed: this.playTime,
      timeLimit: this.level.timeLimit,
      switches: this.switcher.count,
      parSwitches: this.level.parSwitches,
      damage: this.damage,
      checkpoints: this.checkpointsReached,
      nearMisses: this.nearMisses,
    };
  }

  // ───────────────────────────── input ─────────────────────────────

  /** Forms that receive jump / slide input. */
  private forEachControlled(fn: (form: RunnerForm) => void): void {
    if (this.eclipse) {
      fn(this.physical);
      fn(this.shadow);
    } else {
      fn(this.activeForm);
    }
  }

  switchForm(): boolean {
    if (this.state !== 'running') return false;
    if (!this.switcher.trySwitch()) {
      this.events.push({ type: 'switchBlocked' });
      return false;
    }
    this.syncActive();
    this.events.push({ type: 'switch', to: this.switcher.active, forced: false });
    return true;
  }

  /** Moves one lane left (−1) or right (1). Both forms change lanes together, in the air too. */
  moveLane(dir: -1 | 1): boolean {
    if (this.state !== 'running') return false;
    const next = this.lane + dir;
    if (next < -1 || next > 1) {
      this.events.push({ type: 'laneBlocked', dir });
      return false;
    }
    this.lane = next as Lane;
    this.laneChanges++;
    this.events.push({ type: 'lane', lane: this.lane });
    return true;
  }

  /** `strength` 0..1 (swipe length / key hold) sets the jump height between min and max. */
  jump(strength = 0): void {
    if (this.state !== 'running') return;
    this.forEachControlled((f) => f.requestJump(strength));
  }

  extendJump(strength: number): void {
    if (this.state !== 'running') return;
    this.forEachControlled((f) => f.extendJump(strength));
  }

  releaseJump(): void {
    if (this.state !== 'running') return;
    this.forEachControlled((f) => f.releaseJump());
  }

  slide(): void {
    if (this.state !== 'running') return;
    this.forEachControlled((f) => {
      const airborne = !f.onGround;
      f.requestSlide();
      this.events.push({ type: airborne ? 'drop' : 'slide', form: f.side });
    });
  }

  /** Tap on the character / E key: fire the nearest switch of the active world within reach. */
  interact(): boolean {
    if (this.state !== 'running') return false;
    for (const s of this.switches) {
      if (this.switchesOn[s.index] || !this.isSolid(s.side) || !s.inInteractRange(this.x)) continue;
      if (s.x - this.x > INTERACT_RANGE) break;
      this.fireSwitch(s);
      return true;
    }
    return false;
  }

  // ───────────────────────────── simulation ─────────────────────────────

  step(dt: number): void {
    this.events.length = 0;
    if (this.state === 'complete' || this.state === 'failed') return;
    this.playTime += dt;

    if (this.state === 'hit') {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.afterHit();
      return;
    }

    if (!this.endless && this.playTime > this.level.timeLimit) {
      this.fail('time', this.active, -1);
      return;
    }

    this.t += dt;
    this.switcher.tick(dt);
    const moved = this.runner.advance(this.x, dt);
    this.x = moved.x;
    this.speed = moved.speed;
    if (this.x > this.maxX) this.maxX = this.x;
    const maxShift = dt / LANES.changeTime;
    this.lx += Math.max(-maxShift, Math.min(maxShift, this.lane - this.lx));
    this.collisions.lx = this.lx;

    // Eclipse zones merge the worlds.
    const eclipse = this.inEclipse(this.x);
    if (eclipse !== this.eclipse) {
      this.eclipse = eclipse;
      this.events.push({ type: 'eclipse', on: eclipse });
    }

    this.applied.length = 0;
    this.interactions.tick(this.t, this.obstacleStates, this.applied);
    this.triggerApproaching();

    for (const form of this.bothForms) {
      const solid = this.isSolid(form.side);
      this.runner.stepForm(form, this.x, this.t, dt, solid, this.stepEvents);
      if (this.stepEvents.jumped) this.events.push({ type: 'jump', form: form.side });
      if (this.stepEvents.landed && solid) this.events.push({ type: 'land', form: form.side });
      if (solid && form.platform >= 0) {
        const st = this.obstacleStates[form.platform];
        if (this.obstacles[form.platform].def.collapse !== undefined && st.stoodAt < 0) st.stoodAt = this.t;
      }
    }

    for (const form of this.bothForms) {
      if (!this.isSolid(form.side)) continue;
      this.collect(form);
      this.touchSwitches(form);
    }
    this.flushApplied();
    this.checkPortals();
    if (this.state !== 'running') return;

    for (const form of this.bothForms) {
      if (!this.isSolid(form.side)) continue;
      if (form.h < PHYSICS.fallLimit) {
        this.hit(form, 'fell', -1);
        return;
      }
      const height = RunnerSystem.bodyHeight(form);
      const lethal = this.collisions.firstLethal(form, this.x, this.t, height);
      if (lethal) {
        this.hit(form, REASON_BY_KIND[lethal.kind] ?? 'wall', lethal.index);
        return;
      }
      const near = this.collisions.nearMisses(form, this.x, this.t, height);
      if (near > 0) {
        this.nearMisses += near;
        this.events.push({ type: 'nearMiss', form: form.side });
      }
    }

    this.checkCheckpoints();

    if (!this.endless && this.x >= this.level.length) {
      this.state = 'complete';
      this.switcher.locked = true;
      this.events.push({ type: 'complete' });
    }
  }

  private inEclipse(x: number): boolean {
    for (const z of this.level.eclipses) if (x >= z.x0 && x <= z.x1) return true;
    return false;
  }

  /** Falling objects and trains start moving when the runner gets close. */
  private triggerApproaching(): void {
    for (const side of ['real', 'shadow'] as const) {
      // Every grid cell from the runner to 900 units ahead (a trigger distance is at most that).
      for (let cx = this.x; cx < this.x + 900 + 256; cx += 256) {
        for (const o of this.collisions.near(side, cx)) {
          if (o.kind !== 'falling' && o.kind !== 'train') continue;
          const st = this.obstacleStates[o.index];
          if (st.triggeredAt < 0 && this.x >= o.x - (o.def.trigger ?? 420)) st.triggeredAt = this.t;
        }
      }
    }
  }

  private collect(form: RunnerForm): void {
    const height = RunnerSystem.bodyHeight(form);
    let i = lowerBound(this.collectibles, this.x - 80);
    for (; i < this.collectibles.length; i++) {
      const c = this.collectibles[i];
      if (c.x > this.x + 80) break;
      if (this.collected[i] || c.side !== form.side) continue;
      if (Math.abs(c.lane - this.lx) >= LANES.pickup || !c.touches(this.x, 20, form.h, height)) continue;
      this.collected[i] = 1;
      if (c.kind === 'coin') this.coins++;
      else if (c.kind === 'crystal') this.crystals++;
      else {
        this.keys++;
        this.interactions.fire(c.id, this.t, this.obstacleStates, this.applied);
      }
      form.collected++;
      this.events.push({ type: 'collect', kind: c.kind, side: c.side, index: i });
    }
  }

  private touchSwitches(form: RunnerForm): void {
    let i = lowerBound(this.switches, this.x - 80);
    for (; i < this.switches.length; i++) {
      const s = this.switches[i];
      if (s.x > this.x + 80) break;
      if (this.switchesOn[i] || s.side !== form.side) continue;
      if (s.touches(this.x, 17, form.h, form.onGround)) this.fireSwitch(s);
    }
  }

  private fireSwitch(s: Switch): void {
    this.switchesOn[s.index] = 1;
    this.events.push({ type: 'trigger', index: s.index, side: s.side });
    this.interactions.fire(s.id, this.t, this.obstacleStates, this.applied);
    this.flushApplied();
  }

  private flushApplied(): void {
    for (const a of this.applied) this.events.push({ type: 'effect', target: a.target, action: a.action });
    this.applied.length = 0;
  }

  private checkPortals(): void {
    for (const p of this.portals) {
      if (p.isExit || this.portalsUsed[p.index]) continue;
      if (p.x > this.x + 40) break;
      const form = this.form(p.side);
      if (this.isSolid(p.side) && !this.eclipse && p.touches(this.x, form.h)) {
        this.portalsUsed[p.index] = 1;
        this.events.push({ type: 'portal', index: p.index });
        if (this.switcher.force(p.side === 'real' ? 'shadow' : 'real')) {
          this.syncActive();
          this.events.push({ type: 'switch', to: this.switcher.active, forced: true });
        }
      } else if (p.required && p.missed(this.x)) {
        this.portalsUsed[p.index] = 1;
        this.hit(form, 'missedPortal', -1);
        return;
      }
    }
  }

  private checkCheckpoints(): void {
    const next = this.checkpoints[this.checkpointIndex + 1];
    if (!next || !next.reached(this.x)) return;
    this.checkpointIndex++;
    this.checkpointsReached = Math.max(this.checkpointsReached, this.checkpointIndex + 1);
    this.snapshotAtCheckpoint = this.snapshot();
    this.events.push({ type: 'checkpoint', index: this.checkpointIndex });
  }

  private hit(form: RunnerForm, reason: FailReason, obstacle: number): void {
    form.dead = true;
    this.damage++;
    this.lives--;
    this.failure = { reason, form: form.side, obstacle };
    this.state = 'hit';
    this.hitTimer = HIT_PAUSE;
    this.events.push({ type: 'hit', form: form.side, reason, obstacle });
  }

  private afterHit(): void {
    if (this.lives <= 0 || !this.failure) {
      const f = this.failure ?? { reason: 'wall' as FailReason, form: this.active, obstacle: -1 };
      this.fail(f.reason, f.form, f.obstacle);
      return;
    }
    this.respawn();
  }

  /** Continue from the last checkpoint (or the start) in exactly the state saved there. */
  respawn(): void {
    this.restore(this.snapshotAtCheckpoint);
    this.physical.dead = false;
    this.shadow.dead = false;
    this.state = 'running';
    this.events.push({ type: 'respawn' });
  }

  private fail(reason: FailReason, form: Side, obstacle: number): void {
    this.failure = { reason, form, obstacle };
    this.state = 'failed';
    this.switcher.locked = true;
    this.events.push({ type: 'fail', reason, form });
  }

  private syncActive(): void {
    this.physical.active = this.switcher.active === 'real';
    this.shadow.active = this.switcher.active === 'shadow';
  }

  // ───────────────────────────── snapshots ─────────────────────────────

  snapshot(): Snapshot {
    return {
      x: this.x,
      t: this.t,
      lane: this.lane,
      lx: this.lx,
      active: this.switcher.active,
      cooldown: this.switcher.cooldown,
      forms: [this.physical.snapshot(), this.shadow.snapshot()],
      dynamic: this.dynamicIndices.map((i) => ({ ...this.obstacleStates[i] })),
      collected: this.collected.slice(),
      switchesOn: this.switchesOn.slice(),
      portalsUsed: this.portalsUsed.slice(),
      pending: this.interactions.pending.map((p) => ({ ...p })),
      coins: this.coins,
      crystals: this.crystals,
      keys: this.keys,
      eclipse: this.eclipse,
    };
  }

  /** Restores a snapshot. Counters that describe the whole attempt (damage, lives, switches, time) are kept. */
  restore(s: Snapshot): void {
    this.x = s.x;
    this.t = s.t;
    this.lane = s.lane;
    this.lx = s.lx;
    this.collisions.lx = s.lx;
    this.switcher.active = s.active;
    this.switcher.cooldown = s.cooldown;
    this.physical.restore(s.forms[0]);
    this.shadow.restore(s.forms[1]);
    this.dynamicIndices.forEach((index, i) => Object.assign(this.obstacleStates[index], s.dynamic[i]));
    // Near-miss flags are deliberately not restored: an obstacle only ever counts once per attempt.
    this.collected.set(s.collected);
    this.switchesOn.set(s.switchesOn);
    this.portalsUsed.set(s.portalsUsed);
    this.interactions.pending = s.pending.map((p) => ({ ...p }));
    this.coins = s.coins;
    this.crystals = s.crystals;
    this.keys = s.keys;
    this.eclipse = s.eclipse;
    this.speed = this.profile.speedAt(this.x);
    this.syncActive();
  }

  /** Full state copy for search / tests (includes the attempt counters). */
  fullSnapshot(): { core: Snapshot; extra: number[]; state: SessionState; failure: RunSession['failure']; switches: number } {
    return {
      core: this.snapshot(),
      extra: [this.playTime, this.lives, this.damage, this.nearMisses, this.checkpointIndex, this.checkpointsReached, this.maxX, this.hitTimer, this.laneChanges],
      state: this.state,
      failure: this.failure,
      switches: this.switcher.count,
    };
  }

  fullRestore(s: ReturnType<RunSession['fullSnapshot']>): void {
    this.restore(s.core);
    [this.playTime, this.lives, this.damage, this.nearMisses, this.checkpointIndex, this.checkpointsReached, this.maxX, this.hitTimer, this.laneChanges] = s.extra;
    this.state = s.state;
    this.failure = s.failure;
    this.switcher.count = s.switches;
    this.switcher.locked = s.state === 'complete' || s.state === 'failed';
  }
}

/** First index whose x is >= value (items sorted by x). */
function lowerBound(items: readonly { x: number }[], value: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].x < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
