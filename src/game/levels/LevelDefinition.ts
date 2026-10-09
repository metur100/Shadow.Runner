/**
 * Typed level data. Levels are plain data: the gameplay code never contains level-specific logic, so a
 * new level only needs a new `LevelDefinition` (see LevelData.ts and the pattern builder in Patterns.ts).
 *
 * Coordinates: `x` runs along the level in world units. Heights (`y`, `h`) are measured upwards from the
 * ground line of a lane. Each lane belongs to one world ("side"): the reality world (top half of the
 * screen) or the shadow world (bottom half).
 */

export type Side = 'real' | 'shadow';
export type Form = Side;

export const otherSide = (side: Side): Side => (side === 'real' ? 'shadow' : 'real');

export type ThemeId = 'city' | 'park' | 'neon' | 'clockwork' | 'temple' | 'eclipse';

export type ObstacleKind =
  /** Solid physical wall. Tall ones cannot be jumped – pass them as the shadow. */
  | 'wall'
  /** Translucent shadow wall: the shadow runs straight through it. Purely a visual cue, never lethal. */
  | 'shadowWall'
  /** Low ceiling or barrier: slide under it. */
  | 'ceiling'
  /** Spikes on the ground: jump over them. */
  | 'spikes'
  /** Missing ground. Water in the Sunken Temple. */
  | 'pit'
  /** Platform you can land on from above (one-way). May move (`motion`), collapse or blink (`timed`). */
  | 'platform'
  /** Rotating blade / gear / moving sign / silhouette: a lethal disc or box that may move. */
  | 'blade'
  /** Vertical laser beam that switches on and off. */
  | 'laser'
  /** Bright light: lethal to the shadow while it is on. */
  | 'lightZone'
  /** Object that drops from above when the runner approaches. */
  | 'falling'
  /** Train that rushes in from the right when the runner approaches. */
  | 'train'
  /** Swinging pendulum. */
  | 'pendulum'
  /** Full-height gate. Closed gates block the lane. Opened by switches or on a timer. */
  | 'gate'
  /** Speed section: the run speeds up while inside. Not an obstacle. */
  | 'boost';

/** Periodic behaviour, synchronised to the runner's distance so every attempt plays the same way. */
export interface Cycle {
  /** Seconds per cycle. */
  period: number;
  /** Fraction of the cycle in the "on" (dangerous / closed / present) state. */
  duty: number;
  /**
   * State at the moment the runner first reaches the obstacle (without respawns):
   * 'on' = in the middle of the on phase, 'off' = in the middle of the off phase,
   * 'opening' / 'closing' = just before the state flips. Defaults to 'off'.
   */
  arrive?: 'on' | 'off' | 'opening' | 'closing';
}

export interface Motion {
  axis: 'x' | 'y';
  /** Amplitude in world units. */
  amp: number;
  period: number;
  /** Phase offset in cycles (0..1), relative to the runner's arrival. */
  phase?: number;
  /** Stays still until a 'start' interaction effect fires (e.g. an elevator started by a plate). */
  waitForStart?: boolean;
}

export interface ObstacleDef {
  /** Needed when a switch or interaction refers to the obstacle. */
  id?: string;
  kind: ObstacleKind;
  side: Side;
  x: number;
  /** Width along the run. */
  w: number;
  /** Bottom edge height (platforms: top surface; blades: centre). */
  y?: number;
  /** Height (blades: radius). */
  h?: number;
  /** Visual variant (e.g. 'crate', 'gear', 'sign', 'water', 'silhouette', 'streetlight', 'bridge'). */
  style?: string;
  /** Starts hidden (bridges) or open (gates) / switched off (light zones). */
  hidden?: boolean;
  open?: boolean;
  off?: boolean;
  cycle?: Cycle;
  motion?: Motion;
  /** Platforms only: start falling this long after being stood on. */
  collapse?: number;
  /** Falling objects and trains: runner distance before the obstacle at which it starts moving. */
  trigger?: number;
  /** Trains: own speed (units/s, towards the runner). Boost zones: speed multiplier. */
  speed?: number;
  /** Pendulums: swing amplitude in radians. */
  swing?: number;
}

export type CollectibleKind = 'coin' | 'crystal' | 'key';

export interface CollectibleDef {
  id?: string;
  kind: CollectibleKind;
  side: Side;
  x: number;
  /** Height of the item's centre. */
  y: number;
}

export type SwitchKind = 'lever' | 'plate' | 'lamp';

export interface SwitchDef {
  id: string;
  kind: SwitchKind;
  side: Side;
  x: number;
}

export interface PortalDef {
  id: string;
  side: Side;
  x: number;
  /** 'phase' portals swap the active form; the 'exit' portal ends the level. */
  kind: 'phase' | 'exit';
  /** Passing a required portal with the wrong form fails the level. */
  required?: boolean;
}

export type EffectAction = 'open' | 'close' | 'show' | 'hide' | 'on' | 'off' | 'start';

export interface InteractionEffect {
  action: EffectAction;
  target: string;
  /** Seconds until the effect reverts (timed switches). */
  duration?: number;
}

/**
 * A cross-world interaction: when `trigger` (a switch id or a collectible id such as a key) fires,
 * the effects are applied – usually to obstacles in the other world.
 */
export interface InteractionDef {
  trigger: string;
  effects: InteractionEffect[];
  /** Human-readable description of what links the two worlds (documentation and the level editor view). */
  description: string;
}

/** Stretch of the level where the two worlds merge: both forms are solid and act together. */
export interface EclipseZone {
  x0: number;
  x1: number;
}

export interface TutorialStep {
  /** Runner distance at which the step appears. */
  x: number;
  text: string;
  /** The game waits (time frozen) until the player performs this action. 'none' = tap to continue. */
  action: 'switch' | 'jump' | 'slide' | 'none';
  /** Required form after the action (for switch steps). */
  form?: Form;
}

export interface LevelDefinition {
  id: string;
  /** 0-based position in the campaign (or -1 for tutorial / daily / endless levels). */
  index: number;
  worldId: number;
  name: string;
  theme: ThemeId;
  /** Theme used for the shadow lane, when different (daily challenges mix worlds). */
  shadowTheme?: ThemeId;
  speed: { start: number; end: number };
  /** Distance from the start to the exit portal. */
  length: number;
  spawn: { real: { x: number; h: number }; shadow: { x: number; h: number }; form: Form };
  obstacles: ObstacleDef[];
  collectibles: CollectibleDef[];
  switches: SwitchDef[];
  portals: PortalDef[];
  interactions: InteractionDef[];
  checkpoints: number[];
  eclipses: EclipseZone[];
  /** Seconds. Time left at the end adds to the score. */
  timeLimit: number;
  /** Two stars need this many coins + crystals (together). */
  required: number;
  /** Minimum number of form switches the level needs – the baseline for switch efficiency. */
  parSwitches: number;
  lives: number;
  /** 1 (gentle) … 10 (hardest). */
  difficulty: number;
  /** Short hint shown on the level card and the intro banner. */
  tutorialText: string;
  tutorialSteps?: TutorialStep[];
  /** Adds a pursuing eclipse wave behind the runner (visual pressure for final escapes). */
  chase?: boolean;
}

export interface WorldDefinition {
  id: number;
  name: string;
  theme: ThemeId;
  tagline: string;
  /** What the world introduces, shown on the world card. */
  introduces: string[];
  /** Accent colour for UI. */
  color: number;
  reality: string;
  shadow: string;
}
