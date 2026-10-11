import type {
  CollectibleDef,
  EclipseZone,
  Form,
  InteractionDef,
  Lane,
  LevelDefinition,
  ObstacleDef,
  PortalDef,
  Side,
  SwitchDef,
  ThemeId,
  TutorialStep,
} from './LevelDefinition';

/**
 * Pattern builder for handcrafted levels. A level is written as an ordered list of patterns
 * ("a tall wall", "a lever that opens a shadow gate", …). Each pattern is self-contained: it fills both
 * worlds over its own stretch and never needs a particular lane on entry, so any pattern can follow any
 * other, and checkpoints are only placed in the empty run-up between patterns.
 *
 * The builder also records which form each pattern requires, which gives the level's minimum number
 * of switches (`parSwitches`) for the efficiency score.
 */
export class LevelBuilder {
  x = 0;
  readonly obstacles: ObstacleDef[] = [];
  readonly collectibles: CollectibleDef[] = [];
  readonly switches: SwitchDef[] = [];
  readonly portals: PortalDef[] = [];
  readonly interactions: InteractionDef[] = [];
  readonly checkpoints: number[] = [];
  readonly eclipses: EclipseZone[] = [];
  readonly steps: TutorialStep[] = [];
  /** Run-up between patterns (world units): time to read the next pattern and switch. */
  spacing = 520;
  par = 0;
  private uid = 0;
  private laneTurn = 0;
  private formNow: Form;

  constructor(readonly startForm: Form = 'real') {
    this.formNow = startForm;
  }

  id(prefix: string): string {
    return `${prefix}${++this.uid}`;
  }

  /** Records that the runner must be in `form` here (counts a switch when it changes). */
  need(form: Form): void {
    if (form !== this.formNow) {
      this.par++;
      this.formNow = form;
    }
  }

  /** The level switches the form itself (phase portal) – not a player switch. */
  forced(form: Form): void {
    this.formNow = form;
  }

  gap(len = this.spacing): this {
    this.x += len;
    return this;
  }

  obstacle(def: ObstacleDef): ObstacleDef {
    this.obstacles.push(def);
    return def;
  }

  /**
   * Deterministic lane choice for lane patterns. The free lane wanders, so consecutive lane patterns ask
   * for real moves; `avoid` gives a lane different from the previous one.
   */
  pickLane(avoid?: Lane): Lane {
    const order: Lane[] = [-1, 1, 0, 1, -1, 0, 1, -1];
    let lane = order[this.laneTurn++ % order.length];
    if (lane === avoid) lane = order[this.laneTurn++ % order.length];
    return lane;
  }

  item(kind: CollectibleDef['kind'], side: Side, x: number, y = 40, id?: string, lane?: Lane): void {
    this.collectibles.push({ kind, side, x, y, id, lane });
  }

  /** A row of coins (reality) or crystals (shadow). */
  row(side: Side, x0: number, n: number, step = 70, y = 40, lane?: Lane): void {
    for (let i = 0; i < n; i++) this.item(side === 'real' ? 'coin' : 'crystal', side, x0 + i * step, y, undefined, lane);
  }

  /** A row that weaves across the lanes in groups of three items: middle, left, middle, right … */
  weave(side: Side, x0: number, n: number, step = 90, mirror = false): void {
    const path: Lane[] = [0, -1, 0, 1];
    for (let i = 0; i < n; i++) {
      const lane = path[Math.floor(i / 3) % path.length];
      this.item(side === 'real' ? 'coin' : 'crystal', side, x0 + i * step, 40, undefined, (mirror ? -lane : lane) as Lane);
    }
  }

  /** Items along a jump arc centred on `cx`. */
  arc(side: Side, cx: number, n = 5, peak = 150, spread = 240, lane?: Lane): void {
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      const x = cx - spread / 2 + f * spread;
      const y = 40 + Math.sin(f * Math.PI) * (peak - 40);
      this.item(side === 'real' ? 'coin' : 'crystal', side, x, y, undefined, lane);
    }
  }

  checkpoint(): void {
    this.checkpoints.push(this.x + 60);
  }

  tip(text: string, offset = 0): void {
    this.steps.push({ x: this.x + offset, text, action: 'none' });
  }
}

const other = (s: Side): Side => (s === 'real' ? 'shadow' : 'real');
const kindFor = (s: Side) => (s === 'real' ? 'coin' : 'crystal');

// ───────────────────────────── basic patterns (First Light) ─────────────────────────────

/** Empty run with collectibles weaving across the lanes in one or both worlds. */
export function run(b: LevelBuilder, len = 600, items: Side | 'both' | 'none' = 'real'): void {
  const n = Math.floor(len / 90);
  if (items === 'real' || items === 'both') b.weave('real', b.x + 60, n, 90);
  if (items === 'shadow' || items === 'both') b.weave('shadow', b.x + 60, n, 90, items === 'both');
  b.x += len;
}

/** Coins above, crystals below: switching collects both. */
export function mixed(b: LevelBuilder): void {
  b.row('real', b.x, 4, 70);
  b.row('shadow', b.x + 420, 4, 70);
  b.x += 700;
}

export function spikes(b: LevelBuilder, side: Side = 'real', w = 90): void {
  const x = b.x + 80;
  b.obstacle({ kind: 'spikes', side, x, w, style: side === 'shadow' ? 'dark' : undefined });
  b.arc(side, x + w / 2, 5, 165, 230);
  b.x = x + w + 120;
}

/** Spikes in both worlds at the same spot: whichever form is active must jump. */
export function doubleSpikes(b: LevelBuilder, w = 100): void {
  const x = b.x + 80;
  b.obstacle({ kind: 'spikes', side: 'real', x, w });
  b.obstacle({ kind: 'spikes', side: 'shadow', x, w, style: 'dark' });
  b.arc('real', x + w / 2, 3, 160, 160);
  b.arc('shadow', x + w / 2, 3, 160, 160);
  b.x = x + w + 120;
}

/** Low crate / dark rock: jump over. */
export function crate(b: LevelBuilder, side: Side = 'real', h = 64): void {
  const x = b.x + 80;
  b.obstacle({ kind: 'wall', side, x, w: 56, h, style: side === 'real' ? 'crate' : 'rock' });
  b.arc(side, x + 28, 3, 175, 150);
  b.x = x + 56 + 140;
}

/** Tall wall above, shadow wall below: only the shadow gets through. */
export function tallWall(b: LevelBuilder, w = 70): void {
  const x = b.x + 100;
  b.need('shadow');
  b.obstacle({ kind: 'wall', side: 'real', x, w, h: 300 });
  b.obstacle({ kind: 'shadowWall', side: 'shadow', x, w, h: 300 });
  b.row('shadow', x - 140, 5, 70);
  b.x = x + w + 160;
}

/** Light zone below: only the physical form gets through. */
export function light(b: LevelBuilder, w = 280): void {
  const x = b.x + 100;
  b.need('real');
  b.obstacle({ kind: 'lightZone', side: 'shadow', x, w });
  b.row('real', x - 30, Math.max(2, Math.floor((w + 60) / 80)), 80);
  b.x = x + w + 140;
}

export function ceiling(b: LevelBuilder, side: Side = 'real', w = 170): void {
  const x = b.x + 100;
  b.obstacle({ kind: 'ceiling', side, x, w, style: side === 'shadow' ? 'roots' : undefined });
  b.row(side, x + 20, Math.max(2, Math.floor(w / 70)), 70, 18);
  b.x = x + w + 140;
}

export function pit(b: LevelBuilder, side: Side = 'real', w = 170, style?: string): void {
  const x = b.x + 100;
  b.obstacle({ kind: 'pit', side, x, w, style });
  b.arc(side, x + w / 2, 5, 170, w + 60);
  b.x = x + w + 140;
}

export function fallingCrate(b: LevelBuilder, side: Side = 'real'): void {
  const x = b.x + 160;
  b.obstacle({ kind: 'falling', side, x, w: 58, h: 60, y: 420, trigger: 520, style: side === 'real' ? 'crate' : 'rock' });
  b.arc(side, x + 29, 3, 170, 150);
  b.x = x + 58 + 160;
}

/** Rotating blade on the ground: jump. */
export function blade(b: LevelBuilder, side: Side = 'real'): void {
  const x = b.x + 100;
  b.obstacle({ kind: 'blade', side, x, w: 76, y: 34, style: side === 'real' ? 'blade' : 'thorn' });
  b.arc(side, x + 38, 3, 175, 150);
  b.x = x + 76 + 150;
}

/** One-way platforms with bonus items on top. */
export function platforms(b: LevelBuilder, side: Side = 'real'): void {
  const x = b.x + 80;
  b.obstacle({ kind: 'platform', side, x, w: 170, y: 110 });
  b.obstacle({ kind: 'platform', side, x: x + 260, w: 170, y: 170 });
  b.row(side, x + 30, 3, 55, 150);
  b.row(side, x + 290, 3, 55, 210);
  b.x = x + 470;
}

// ───────────────────────────── cross-world patterns (Parallel Park) ─────────────────────────────

/** Lever above opens a gate below; a tall wall above forces the shadow through that gate. */
export function leverGate(b: LevelBuilder, duration?: number): void {
  const lever = b.id('lever');
  const gate = b.id('gate');
  const x0 = b.x + 80;
  b.need('real');
  b.switches.push({ id: lever, kind: 'lever', side: 'real', x: x0 });
  b.row('real', x0 - 200, 3, 70);
  const gx = x0 + 620;
  b.obstacle({ id: gate, kind: 'gate', side: 'shadow', x: gx, w: 34 });
  b.obstacle({ kind: 'wall', side: 'real', x: gx - 10, w: 60, h: 300 });
  b.need('shadow');
  b.row('shadow', gx - 150, 4, 70);
  b.interactions.push({
    trigger: lever,
    effects: [{ action: 'open', target: gate, duration }],
    description: duration
      ? `Pulling the lever above opens the shadow gate below for ${duration} seconds.`
      : 'Pulling the lever above opens the shadow gate below.',
  });
  b.x = gx + 220;
}

/** Shadow plate builds a bridge above, over a pit too wide to jump, while light guards the shadow lane. */
export function plateBridge(b: LevelBuilder): void {
  const plate = b.id('plate');
  const bridge = b.id('bridge');
  const x0 = b.x + 80;
  b.need('shadow');
  b.switches.push({ id: plate, kind: 'plate', side: 'shadow', x: x0 });
  b.row('shadow', x0 - 200, 3, 70);
  const px = x0 + 560;
  const w = 420;
  b.obstacle({ kind: 'pit', side: 'real', x: px, w });
  b.obstacle({ id: bridge, kind: 'platform', side: 'real', x: px - 10, w: w + 20, y: 0, hidden: true, style: 'bridge' });
  b.obstacle({ kind: 'lightZone', side: 'shadow', x: px - 40, w: w + 80 });
  b.obstacle({ kind: 'pit', side: 'shadow', x: px + 60, w: w - 120, style: 'brokenBridge' });
  b.need('real');
  b.row('real', px + 40, 5, 80);
  b.interactions.push({
    trigger: plate,
    effects: [{ action: 'show', target: bridge }],
    description: 'Stepping on the shadow plate below builds the bridge above.',
  });
  b.x = px + w + 160;
}

/** Street lamp trap: touching it as the physical form switches on a light below, right where the shadow must run. */
export function lampTrap(b: LevelBuilder): void {
  const lamp = b.id('lamp');
  const glow = b.id('glow');
  const x0 = b.x + 120;
  b.switches.push({ id: lamp, kind: 'lamp', side: 'real', x: x0 });
  b.arc('real', x0, 3, 190, 120);
  const wx = x0 + 520;
  b.obstacle({ kind: 'wall', side: 'real', x: wx, w: 70, h: 300 });
  b.obstacle({ kind: 'shadowWall', side: 'shadow', x: wx, w: 70, h: 300 });
  b.obstacle({ id: glow, kind: 'lightZone', side: 'shadow', x: wx - 60, w: 190, off: true, style: 'lamp' });
  b.need('shadow');
  b.row('shadow', wx - 200, 4, 70);
  b.interactions.push({
    trigger: lamp,
    effects: [{ action: 'on', target: glow }],
    description: 'Bumping into the street lamp above switches it on – and its light floods the shadow world below.',
  });
  b.x = wx + 70 + 160;
}

/** Pit above with a platform in the middle (optionally an elevator); light below forces the physical form. */
export function platformPit(b: LevelBuilder, elevator = false): void {
  const x = b.x + 100;
  const w = 470;
  b.need('real');
  b.obstacle({ kind: 'pit', side: 'real', x, w });
  b.obstacle({
    kind: 'platform',
    side: 'real',
    x: x + 160,
    w: 150,
    y: 40,
    style: elevator ? 'elevator' : undefined,
    motion: elevator ? { axis: 'y', amp: 50, period: 2.2, phase: 0 } : undefined,
  });
  b.obstacle({ kind: 'lightZone', side: 'shadow', x: x - 30, w: w + 60 });
  b.row('real', x + 175, 3, 55, 100);
  b.x = x + w + 150;
}

/** A moving platform carries you across a pit (with light below). */
export function movingPlatform(b: LevelBuilder): void {
  const x = b.x + 100;
  const w = 480;
  b.need('real');
  b.obstacle({ kind: 'pit', side: 'real', x, w });
  b.obstacle({ kind: 'platform', side: 'real', x: x + 170, w: 140, y: 40, motion: { axis: 'x', amp: 60, period: 2.4, phase: 0.25 } });
  b.obstacle({ kind: 'lightZone', side: 'shadow', x: x - 30, w: w + 60 });
  b.row('real', x + 185, 2, 60, 100);
  b.x = x + w + 150;
}

/** Pulsing light below that is on when you arrive, spikes above: jump them as the physical form. */
export function pulseLight(b: LevelBuilder): void {
  const x = b.x + 100;
  b.need('real');
  b.obstacle({ kind: 'lightZone', side: 'shadow', x, w: 260, cycle: { period: 2, duty: 0.55, arrive: 'on' }, style: 'pulse' });
  b.obstacle({ kind: 'spikes', side: 'real', x: x + 90, w: 90 });
  b.arc('real', x + 135, 5, 165, 230);
  b.x = x + 260 + 150;
}

/** A row of tall walls: stay in the shadow. */
export function shadowWallRun(b: LevelBuilder, n = 3): void {
  b.need('shadow');
  let x = b.x + 100;
  b.row('shadow', x - 100, Math.round((n * 260) / 70), 70);
  for (let i = 0; i < n; i++) {
    b.obstacle({ kind: 'wall', side: 'real', x, w: 60, h: 300 });
    b.obstacle({ kind: 'shadowWall', side: 'shadow', x, w: 60, h: 300 });
    x += 260;
  }
  b.x = x + 60;
}

/** Wall then light: switch to the shadow, then back. */
export function wallThenLight(b: LevelBuilder): void {
  tallWall(b);
  b.x += 320;
  light(b, 220);
}

// ───────────────────────────── Neon City ─────────────────────────────

/** Laser above that is on when you arrive; dark spikes below to jump as the shadow. */
export function laser(b: LevelBuilder, arrive: 'on' | 'off' = 'on'): void {
  const x = b.x + 120;
  b.obstacle({ kind: 'laser', side: 'real', x, w: 16, cycle: { period: 1.6, duty: 0.5, arrive } });
  b.obstacle({ kind: 'spikes', side: 'shadow', x: x - 40, w: 96, style: 'dark' });
  b.arc('shadow', x + 8, 3, 165, 150);
  if (arrive === 'on') b.need('shadow');
  b.row('real', x - 160, 2, 60);
  b.x = x + 200;
}

/** Laser gate pair: the reality laser and a shadow light, alternating – read the rhythm. */
export function laserLight(b: LevelBuilder): void {
  const x = b.x + 120;
  b.need('real');
  b.obstacle({ kind: 'laser', side: 'real', x, w: 16, cycle: { period: 1.8, duty: 0.45, arrive: 'off' } });
  b.obstacle({ kind: 'lightZone', side: 'shadow', x: x - 80, w: 180 });
  b.row('real', x - 60, 3, 60);
  b.x = x + 220;
}

/** Shadow door on a timer, crate above: jump the crate, or slip through the open door as the shadow. */
export function timedDoor(b: LevelBuilder): void {
  const x = b.x + 120;
  b.obstacle({ kind: 'gate', side: 'shadow', x, w: 34, cycle: { period: 2.2, duty: 0.5, arrive: 'off' }, style: 'timed' });
  b.obstacle({ kind: 'wall', side: 'real', x: x - 10, w: 56, h: 64, style: 'crate' });
  b.row('shadow', x - 140, 3, 70);
  b.arc('real', x + 18, 3, 175, 150);
  b.x = x + 200;
}

/** Train rushing in from the right above: be the shadow when it passes. */
export function train(b: LevelBuilder): void {
  const trigger = 760;
  const x = b.x + trigger + 140;
  b.need('shadow');
  b.obstacle({ kind: 'train', side: 'real', x, w: 420, h: 220, speed: 300, trigger });
  b.row('shadow', b.x + 120, 9, 80);
  b.x = x + 120;
}

/** Speed section: arrows on the ground, everything speeds up. */
export function speedSection(b: LevelBuilder, len = 900): void {
  const x = b.x + 60;
  b.obstacle({ kind: 'boost', side: 'real', x, w: len, speed: 1.3 });
  b.obstacle({ kind: 'boost', side: 'shadow', x, w: len, speed: 1.3 });
  b.row('real', x + 40, Math.floor(len / 100), 100);
  b.row('shadow', x + 90, Math.floor(len / 100), 100);
  b.x = x + len + 100;
}

/** Moving neon sign bobbing above the street: duck or jump at the right moment – or pass as the shadow. */
export function sign(b: LevelBuilder): void {
  const x = b.x + 120;
  b.obstacle({ kind: 'blade', side: 'real', x, w: 110, y: 60, h: 46, style: 'sign', motion: { axis: 'y', amp: 70, period: 1.6, phase: 0.25 } });
  b.row('shadow', x - 80, 4, 70);
  b.x = x + 260;
}

// ───────────────────────────── Clockwork District ─────────────────────────────

/** Spinning gear hanging low: slide under it. */
export function gear(b: LevelBuilder, side: Side = 'real'): void {
  const x = b.x + 120;
  b.obstacle({ kind: 'blade', side, x, w: 130, y: 122, style: 'gear' });
  b.row(side, x + 20, 3, 45, 18);
  b.x = x + 130 + 150;
}

/** Gears in both worlds, one high, one low: slide in one, it does not matter which. */
export function gearPair(b: LevelBuilder): void {
  const x = b.x + 120;
  b.obstacle({ kind: 'blade', side: 'real', x, w: 130, y: 122, style: 'gear' });
  b.obstacle({ kind: 'blade', side: 'shadow', x: x + 40, w: 130, y: 122, style: 'gear' });
  b.row('real', x + 20, 2, 60, 18);
  b.row('shadow', x + 60, 2, 60, 18);
  b.x = x + 170 + 150;
}

/** Elevator over a pit (physical), with light below. */
export function elevator(b: LevelBuilder): void {
  platformPit(b, true);
}

/** Pendulum swinging low above; light below forces the physical form to time a jump. */
export function pendulum(b: LevelBuilder, withLight = true): void {
  const x = b.x + 140;
  if (withLight) {
    b.need('real');
    b.obstacle({ kind: 'lightZone', side: 'shadow', x: x - 80, w: 220 });
  }
  b.obstacle({ kind: 'pendulum', side: 'real', x: x - 10, w: 20, y: 430, h: 370, swing: 0.55, motion: { axis: 'x', amp: 0, period: 1.8, phase: 0.5 } });
  b.arc('real', x, 3, 180, 140);
  b.x = x + 220;
}

/** Blinking phase platforms over a shadow void; tall wall above forces the shadow. */
export function phasePlatforms(b: LevelBuilder): void {
  const x = b.x + 100;
  const w = 440;
  b.need('shadow');
  b.obstacle({ kind: 'pit', side: 'shadow', x, w, style: 'void' });
  b.obstacle({ kind: 'platform', side: 'shadow', x: x + 140, w: 160, y: 30, cycle: { period: 2.4, duty: 0.7, arrive: 'on' }, style: 'phase' });
  b.obstacle({ kind: 'wall', side: 'real', x: x + 120, w: 200, h: 300 });
  b.row('shadow', x + 160, 3, 55, 90);
  b.x = x + w + 150;
}

/** A plate starts twin elevators: the reality platform rises while the shadow one sinks. */
export function syncPlatforms(b: LevelBuilder): void {
  const plate = b.id('plate');
  const up = b.id('lift');
  const down = b.id('lift');
  const x0 = b.x + 80;
  b.switches.push({ id: plate, kind: 'plate', side: 'real', x: x0 });
  b.switches.push({ id: `${plate}s`, kind: 'plate', side: 'shadow', x: x0 });
  const x = x0 + 260;
  b.obstacle({ kind: 'platform', side: 'real', id: up, x, w: 180, y: 20, style: 'elevator', motion: { axis: 'y', amp: 120, period: 3, waitForStart: true } });
  b.obstacle({ kind: 'platform', side: 'shadow', id: down, x, w: 180, y: 140, style: 'elevator', motion: { axis: 'y', amp: -120, period: 3, waitForStart: true } });
  b.row('real', x + 30, 3, 60, 230);
  b.row('shadow', x + 30, 3, 60, 70);
  const effects = [
    { action: 'start' as const, target: up },
    { action: 'start' as const, target: down },
  ];
  b.interactions.push({ trigger: plate, effects, description: 'The plate above starts the twin lifts: the reality lift rises while the shadow lift sinks.' });
  b.interactions.push({ trigger: `${plate}s`, effects, description: 'The plate below starts the same twin lifts from the shadow side.' });
  b.x = x + 180 + 160;
}

// ───────────────────────────── Sunken Temple ─────────────────────────────

export function water(b: LevelBuilder, w = 190): void {
  pit(b, 'real', w, 'water');
}

/** Collapsing stones over water (physical), light below. */
export function collapseRun(b: LevelBuilder): void {
  const x = b.x + 100;
  const w = 600;
  b.need('real');
  b.obstacle({ kind: 'pit', side: 'real', x, w, style: 'water' });
  for (let i = 0; i < 3; i++) {
    b.obstacle({ kind: 'platform', side: 'real', x: x + 70 + i * 170, w: 120, y: 30, collapse: 0.35, style: 'stone' });
  }
  b.obstacle({ kind: 'lightZone', side: 'shadow', x: x - 30, w: w + 60 });
  b.row('real', x + 100, 3, 170, 80);
  b.x = x + w + 150;
}

/** Lever above raises a shadow bridge over a void below; the water above is too wide to jump. */
export function shadowBridge(b: LevelBuilder): void {
  const lever = b.id('lever');
  const bridge = b.id('sbridge');
  const x0 = b.x + 80;
  b.need('real');
  b.switches.push({ id: lever, kind: 'lever', side: 'real', x: x0 });
  b.row('real', x0 - 160, 3, 60);
  const px = x0 + 600;
  const w = 460;
  b.obstacle({ kind: 'pit', side: 'real', x: px, w, style: 'water' });
  b.obstacle({ kind: 'platform', side: 'real', x: px + 170, w: 110, y: 0, style: 'brokenBridge' });
  b.obstacle({ kind: 'wall', side: 'real', x: px + 170, w: 110, h: 260, style: 'ruin' });
  b.obstacle({ kind: 'pit', side: 'shadow', x: px, w, style: 'void' });
  b.obstacle({ id: bridge, kind: 'platform', side: 'shadow', x: px - 10, w: w + 20, y: 0, hidden: true, style: 'shadowBridge' });
  b.need('shadow');
  b.row('shadow', px + 40, 5, 85);
  b.interactions.push({ trigger: lever, effects: [{ action: 'show', target: bridge }], description: 'The lever above raises a shadow bridge over the void below.' });
  b.x = px + w + 160;
}

/** Light beams below that are off as you pass – trust the timing – under tall pillars above. */
export function lightBeams(b: LevelBuilder, n = 3): void {
  b.need('shadow');
  let x = b.x + 120;
  for (let i = 0; i < n; i++) {
    b.obstacle({ kind: 'wall', side: 'real', x: x - 20, w: 100, h: 300, style: 'pillar' });
    b.obstacle({ kind: 'shadowWall', side: 'shadow', x: x - 20, w: 100, h: 300 });
    b.obstacle({ kind: 'lightZone', side: 'shadow', x, w: 60, cycle: { period: 1.5, duty: 0.45, arrive: 'off' }, style: 'beam' });
    b.item('crystal', 'shadow', x + 30, 40);
    x += 300;
  }
  b.x = x;
}

/** Required phase portal above: it pulls you into the shadow right before a wall. */
export function portalSwap(b: LevelBuilder, side: Side = 'real'): void {
  const portal = b.id('portal');
  const x0 = b.x + 120;
  b.need(side);
  b.portals.push({ id: portal, side, x: x0, kind: 'phase', required: true });
  b.forced(other(side));
  const hx = x0 + 230;
  if (side === 'real') {
    b.obstacle({ kind: 'wall', side: 'real', x: hx, w: 80, h: 300 });
    b.obstacle({ kind: 'shadowWall', side: 'shadow', x: hx, w: 80, h: 300 });
    b.row('shadow', x0 + 40, 5, 70);
  } else {
    b.obstacle({ kind: 'lightZone', side: 'shadow', x: hx, w: 200 });
    b.row('real', x0 + 40, 5, 70);
  }
  b.row(side, x0 - 180, 3, 60);
  b.x = hx + 260;
}

/** Key in the shadow world opens the door above; light below forces you through that door. */
export function keyDoor(b: LevelBuilder): void {
  const key = b.id('key');
  const door = b.id('door');
  const x0 = b.x + 100;
  b.need('shadow');
  b.item('key', 'shadow', x0, 50, key);
  b.row('shadow', x0 - 200, 3, 60);
  const dx = x0 + 680;
  b.obstacle({ id: door, kind: 'gate', side: 'real', x: dx, w: 40, style: 'door' });
  b.obstacle({ kind: 'lightZone', side: 'shadow', x: dx - 90, w: 230 });
  b.need('real');
  b.row('real', dx - 120, 4, 70);
  b.interactions.push({ trigger: key, effects: [{ action: 'open', target: door }], description: 'The key found in the shadow world unlocks the temple door above.' });
  b.x = dx + 220;
}

// ───────────────────────────── The Eclipse ─────────────────────────────

/** Wall, light, wall, light … with short gaps. */
export function fastSwitch(b: LevelBuilder, n = 4, gap = 300): void {
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) tallWall(b, 60);
    else light(b, 160);
    b.x += gap - 160;
  }
}

/** Several lights below, crates and spikes above. */
export function multiLight(b: LevelBuilder): void {
  const x = b.x + 100;
  b.need('real');
  b.obstacle({ kind: 'lightZone', side: 'shadow', x, w: 180 });
  b.obstacle({ kind: 'lightZone', side: 'shadow', x: x + 300, w: 140, cycle: { period: 1.6, duty: 0.6, arrive: 'on' }, style: 'pulse' });
  b.obstacle({ kind: 'lightZone', side: 'shadow', x: x + 560, w: 180 });
  b.obstacle({ kind: 'spikes', side: 'real', x: x + 60, w: 80 });
  b.obstacle({ kind: 'wall', side: 'real', x: x + 340, w: 56, h: 64, style: 'crate' });
  b.obstacle({ kind: 'spikes', side: 'real', x: x + 610, w: 80 });
  b.arc('real', x + 100, 3, 165, 140);
  b.arc('real', x + 368, 3, 175, 140);
  b.arc('real', x + 650, 3, 165, 140);
  b.x = x + 740 + 140;
}

/** Eclipse: the worlds merge – both forms are solid and jump together over obstacles in both lanes. */
export function eclipse(b: LevelBuilder, len = 1300): void {
  const x0 = b.x + 60;
  b.eclipses.push({ x0, x1: x0 + len });
  let x = x0 + 200;
  let i = 0;
  while (x < x0 + len - 260) {
    if (i % 3 === 0) {
      b.obstacle({ kind: 'spikes', side: 'real', x, w: 80 });
      b.obstacle({ kind: 'spikes', side: 'shadow', x: x + 40, w: 70, style: 'dark' });
      b.arc('real', x + 40, 3, 160, 130);
      b.arc('shadow', x + 75, 3, 160, 130);
    } else if (i % 3 === 1) {
      b.obstacle({ kind: 'wall', side: 'real', x, w: 56, h: 64, style: 'crate' });
      b.obstacle({ kind: 'spikes', side: 'shadow', x: x - 10, w: 76, style: 'dark' });
      b.arc('real', x + 28, 3, 175, 130);
      b.arc('shadow', x + 28, 3, 175, 130);
    } else {
      b.obstacle({ kind: 'ceiling', side: 'real', x, w: 150 });
      b.obstacle({ kind: 'ceiling', side: 'shadow', x: x + 20, w: 130, style: 'roots' });
      b.row('real', x + 20, 2, 60, 18);
      b.row('shadow', x + 40, 2, 60, 18);
    }
    x += 380;
    i++;
  }
  b.x = x0 + len + 80;
}

/** A gate above that slides open and shut (open on arrival); light below. */
export function movingGate(b: LevelBuilder): void {
  const x = b.x + 120;
  b.need('real');
  b.obstacle({ kind: 'gate', side: 'real', x, w: 36, cycle: { period: 1.8, duty: 0.5, arrive: 'off' }, style: 'slide' });
  b.obstacle({ kind: 'lightZone', side: 'shadow', x: x - 90, w: 220 });
  b.row('real', x - 80, 3, 60);
  b.x = x + 200;
}

/** Moving shadow silhouette below: jump it as the shadow (or run above as the physical form). */
export function silhouette(b: LevelBuilder): void {
  const x = b.x + 140;
  b.obstacle({ kind: 'blade', side: 'shadow', x, w: 50, y: 0, h: 70, style: 'silhouette', motion: { axis: 'x', amp: 50, period: 2, phase: 0 } });
  b.arc('shadow', x + 25, 3, 175, 160);
  b.row('real', x - 60, 3, 70);
  b.x = x + 240;
}

// ───────────────────────────── lanes ─────────────────────────────

const ALL_LANES: Lane[] = [-1, 0, 1];

/** Tall barriers in every lane but `free`, in both worlds at once. */
function barrierRow(b: LevelBuilder, x: number, free: Lane, w = 70): void {
  for (const lane of ALL_LANES) {
    if (lane === free) continue;
    b.obstacle({ kind: 'wall', side: 'real', x, w, h: 300, lane, style: 'barrier' });
    b.obstacle({ kind: 'wall', side: 'shadow', x, w, h: 300, lane, style: 'barrier' });
  }
}

/** Two lanes blocked in both worlds: whichever form you are, move to the free lane. */
export function laneBlock(b: LevelBuilder): void {
  const x = b.x + 160;
  const free = b.pickLane();
  barrierRow(b, x, free);
  b.row('real', x - 170, 4, 70, 40, free);
  b.row('shadow', x - 170, 4, 70, 40, free);
  b.x = x + 70 + 140;
}

/** Three barrier rows in a row, each with a different free lane: weave left and right. */
export function slalom(b: LevelBuilder, n = 3, gap = 360): void {
  let x = b.x + 160;
  let free = b.pickLane();
  for (let i = 0; i < n; i++) {
    barrierRow(b, x, free);
    b.row('real', x - 120, 2, 60, 40, free);
    b.row('shadow', x - 120, 2, 60, 40, free);
    free = b.pickLane(free);
    x += gap;
  }
  b.x = x - gap + 70 + 140;
}

/** Spikes in two lanes: dodge into the free lane, or jump them for the coins above. */
export function laneSpikes(b: LevelBuilder, side: Side = 'real'): void {
  const x = b.x + 100;
  const w = 110;
  const free = b.pickLane();
  for (const lane of ALL_LANES) {
    if (lane !== free) b.obstacle({ kind: 'spikes', side, x, w, lane, style: side === 'shadow' ? 'dark' : undefined });
  }
  b.arc(side, x + w / 2, 5, 170, 240, free === 0 ? 1 : 0);
  b.x = x + w + 140;
}

/** Crates in two lanes and a tall barrier in the third: pick a crate lane and jump. */
export function laneCrates(b: LevelBuilder): void {
  const x = b.x + 120;
  const blocked = b.pickLane();
  for (const lane of ALL_LANES) {
    if (lane === blocked) b.obstacle({ kind: 'wall', side: 'real', x: x - 7, w: 70, h: 300, lane, style: 'barrier' });
    else b.obstacle({ kind: 'wall', side: 'real', x, w: 56, h: 64, lane, style: 'crate' });
  }
  b.arc('real', x + 28, 3, 175, 150, blocked === 0 ? -1 : 0);
  b.x = x + 56 + 150;
}

/** Oncoming cars in single lanes of both worlds: dodge into a free lane. */
export function traffic(b: LevelBuilder, n = 3): void {
  const trigger = 720;
  let x = b.x + 260;
  let lane = b.pickLane();
  for (let i = 0; i < n; i++) {
    b.obstacle({ kind: 'train', side: 'real', x: x + 320, w: 170, h: 220, speed: 260, trigger, lane, style: 'car' });
    b.obstacle({ kind: 'train', side: 'shadow', x: x + 320, w: 170, h: 220, speed: 260, trigger, lane, style: 'car' });
    const safe: Lane = lane === 0 ? (i % 2 === 0 ? 1 : -1) : 0;
    b.row('real', x - 100, 3, 70, 40, safe);
    b.row('shadow', x - 100, 3, 70, 40, safe);
    lane = b.pickLane(lane);
    x += 440;
  }
  b.x = x + 120;
}

// ───────────────────────────── level assembly ─────────────────────────────

export type PatternFn = (b: LevelBuilder) => void;

export const PATTERNS = {
  run: (b: LevelBuilder) => run(b, 600, 'real'),
  runShadow: (b: LevelBuilder) => run(b, 600, 'shadow'),
  runBoth: (b: LevelBuilder) => run(b, 600, 'both'),
  mixed,
  spikes: (b: LevelBuilder) => spikes(b, 'real'),
  darkSpikes: (b: LevelBuilder) => spikes(b, 'shadow'),
  wideSpikes: (b: LevelBuilder) => spikes(b, 'real', 150),
  doubleSpikes: (b: LevelBuilder) => doubleSpikes(b),
  crate: (b: LevelBuilder) => crate(b, 'real'),
  rock: (b: LevelBuilder) => crate(b, 'shadow'),
  wall: (b: LevelBuilder) => tallWall(b),
  light: (b: LevelBuilder) => light(b),
  shortLight: (b: LevelBuilder) => light(b, 170),
  longLight: (b: LevelBuilder) => light(b, 420),
  ceiling: (b: LevelBuilder) => ceiling(b, 'real'),
  roots: (b: LevelBuilder) => ceiling(b, 'shadow'),
  pit: (b: LevelBuilder) => pit(b, 'real'),
  shadowPit: (b: LevelBuilder) => pit(b, 'shadow', 160, 'void'),
  falling: (b: LevelBuilder) => fallingCrate(b, 'real'),
  fallingRock: (b: LevelBuilder) => fallingCrate(b, 'shadow'),
  blade: (b: LevelBuilder) => blade(b, 'real'),
  thorn: (b: LevelBuilder) => blade(b, 'shadow'),
  platforms: (b: LevelBuilder) => platforms(b, 'real'),
  shadowPlatforms: (b: LevelBuilder) => platforms(b, 'shadow'),
  wallThenLight,
  leverGate: (b: LevelBuilder) => leverGate(b),
  timedLever: (b: LevelBuilder) => leverGate(b, 3),
  plateBridge,
  lampTrap,
  platformPit: (b: LevelBuilder) => platformPit(b, false),
  movingPlatform,
  pulseLight,
  wallRun: (b: LevelBuilder) => shadowWallRun(b, 3),
  laser: (b: LevelBuilder) => laser(b, 'on'),
  laserOff: (b: LevelBuilder) => laser(b, 'off'),
  laserLight,
  timedDoor,
  train,
  speed: (b: LevelBuilder) => speedSection(b),
  sign,
  gear: (b: LevelBuilder) => gear(b, 'real'),
  shadowGear: (b: LevelBuilder) => gear(b, 'shadow'),
  gearPair,
  elevator,
  pendulum: (b: LevelBuilder) => pendulum(b, true),
  phasePlatforms,
  syncPlatforms,
  water: (b: LevelBuilder) => water(b),
  collapse: collapseRun,
  shadowBridge,
  beams: (b: LevelBuilder) => lightBeams(b, 3),
  portal: (b: LevelBuilder) => portalSwap(b, 'real'),
  shadowPortal: (b: LevelBuilder) => portalSwap(b, 'shadow'),
  keyDoor,
  fastSwitch: (b: LevelBuilder) => fastSwitch(b, 4, 300),
  fasterSwitch: (b: LevelBuilder) => fastSwitch(b, 6, 260),
  multiLight,
  eclipse: (b: LevelBuilder) => eclipse(b),
  movingGate,
  silhouette,
  laneBlock,
  slalom: (b: LevelBuilder) => slalom(b),
  laneSpikes: (b: LevelBuilder) => laneSpikes(b, 'real'),
  laneDarkSpikes: (b: LevelBuilder) => laneSpikes(b, 'shadow'),
  laneCrates,
  traffic: (b: LevelBuilder) => traffic(b),
} satisfies Record<string, PatternFn>;

export type PatternName = keyof typeof PATTERNS;

export interface LevelRecipe {
  id: string;
  index: number;
  worldId: number;
  name: string;
  theme: ThemeId;
  shadowTheme?: ThemeId;
  speed: { start: number; end: number };
  /** Target duration in seconds (the recipe repeats until the level is long enough). */
  duration: number;
  /** Patterns played once at the start (teaching the world's new idea). */
  intro: PatternName[];
  /** Patterns repeated, in order, until the target duration is reached. */
  loop: PatternName[];
  /** Run-up between patterns. */
  spacing: number;
  lives: number;
  difficulty: number;
  tutorialText: string;
  /** Short non-blocking tips shown when a pattern first appears: [pattern index in the intro, text]. */
  tips?: [number, string][];
  /** Share of the collectibles needed for two stars. */
  requiredShare?: number;
  chase?: boolean;
  startForm?: Form;
  /** Endless runs have no checkpoints (one life). */
  noCheckpoints?: boolean;
}

/** Builds a level from a recipe. Deterministic: the same recipe always yields the same level. */
export function buildLevel(recipe: LevelRecipe): LevelDefinition {
  const b = new LevelBuilder(recipe.startForm ?? 'real');
  b.spacing = recipe.spacing;
  b.x = 500;
  const avgSpeed = (recipe.speed.start + recipe.speed.end) / 2;
  const targetLength = recipe.duration * avgSpeed;
  const checkpointEvery = targetLength / 4;
  let nextCheckpoint = checkpointEvery;

  const place = (name: PatternName) => {
    if (!recipe.noCheckpoints && b.x >= nextCheckpoint) {
      b.checkpoint();
      b.gap(Math.max(260, b.spacing * 0.6));
      nextCheckpoint += checkpointEvery;
    }
    PATTERNS[name](b);
    b.gap();
  };

  recipe.intro.forEach((name, i) => {
    const tip = recipe.tips?.find(([index]) => index === i);
    if (tip) b.tip(tip[1], -80);
    place(name);
  });
  if (recipe.loop.length > 0) {
    let guard = 0;
    while (b.x < targetLength - 600 && guard++ < 400) {
      for (const name of recipe.loop) {
        if (b.x >= targetLength - 600) break;
        place(name);
      }
    }
  }
  run(b, 500, 'both');
  const length = Math.round(b.x + 200);
  b.portals.push({ id: 'exit', side: 'real', x: length, kind: 'exit' });

  const level: LevelDefinition = {
    id: recipe.id,
    index: recipe.index,
    worldId: recipe.worldId,
    name: recipe.name,
    theme: recipe.theme,
    shadowTheme: recipe.shadowTheme,
    speed: recipe.speed,
    length,
    spawn: { real: { x: 0, h: 0 }, shadow: { x: 0, h: 0 }, form: recipe.startForm ?? 'real' },
    obstacles: b.obstacles,
    collectibles: b.collectibles,
    switches: b.switches,
    portals: b.portals,
    interactions: b.interactions,
    checkpoints: b.checkpoints,
    eclipses: b.eclipses,
    timeLimit: 0,
    required: 0,
    parSwitches: b.par,
    lives: recipe.lives,
    difficulty: recipe.difficulty,
    tutorialText: recipe.tutorialText,
    tutorialSteps: b.steps.length > 0 ? b.steps : undefined,
    chase: recipe.chase,
  };
  const total = b.collectibles.filter((c) => c.kind !== 'key').length;
  level.required = Math.round(total * (recipe.requiredShare ?? 0.55));
  level.timeLimit = Math.ceil(estimateDuration(level) * 1.6 + 20);
  return level;
}

/** Seconds the auto-run takes from start to exit (no respawns). */
export function estimateDuration(level: Pick<LevelDefinition, 'speed' | 'length' | 'obstacles'>): number {
  // Same integration as SpeedProfile, kept dependency-free here.
  const boosts = level.obstacles.filter((o) => o.kind === 'boost' && o.side === 'real');
  let t = 0;
  const step = 20;
  for (let x = 0; x < level.length; x += step) {
    const p = Math.min(1, Math.max(0, x / level.length));
    const s = p * p * (3 - 2 * p);
    let v = level.speed.start + (level.speed.end - level.speed.start) * s;
    for (const bz of boosts) if (x >= bz.x && x <= bz.x + bz.w) v *= bz.speed ?? 1.3;
    t += step / v;
  }
  return t;
}

export { kindFor, other };
