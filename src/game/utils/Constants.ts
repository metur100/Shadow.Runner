/** Layout is authored for a 720-unit-wide portrait screen; height adapts to the device (see DeviceUtils). */
export const DESIGN_WIDTH = 720;
export const MIN_DESIGN_HEIGHT = 1180;
export const MAX_DESIGN_HEIGHT = 1560;
export const DEFAULT_DESIGN_HEIGHT = 1280;

/** Fixed simulation step (seconds). The simulation runs at 60 Hz regardless of the display rate. */
export const SIM_STEP = 1 / 60;
export const MAX_SIM_STEPS_PER_FRAME = 4;

/** Runner physics (world units, seconds). Heights are measured upwards from the ground line. */
export const PHYSICS = {
  gravity: 3000,
  /** Jump take-off speed for a short swipe / tap of the key … */
  jumpMin: 960,
  /** … and for a long swipe / held key. */
  jumpMax: 1080,
  /** Releasing the jump early caps the upward speed (variable jump height). */
  jumpCut: 420,
  /** Grace period after running off an edge in which a jump still works. */
  coyoteTime: 0.1,
  /** A jump pressed this long before landing is performed on landing. */
  jumpBuffer: 0.13,
  slideTime: 0.62,
  /** Downward speed when "dropping" (slide pressed in the air). */
  dropSpeed: 1500,
  maxFall: 2200,
  /** Below this height (over a pit) a form has fallen out of the level. */
  fallLimit: -14,
} as const;

/** Character collision box (world units). */
export const BODY = {
  halfWidth: 17,
  height: 74,
  slideHeight: 36,
} as const;

/** Where the runners stand on screen, measured from the left edge of a lane. */
export const RUNNER_SCREEN_X = 170;

export const SWITCH_COOLDOWN = 0.25;

export const FONT_FAMILY = '"Fredoka", "Trebuchet MS", system-ui, sans-serif';

export const COLORS = {
  ink: 0x1d1838,
  inkText: '#1d1838',
  cream: 0xfff8ec,
  creamText: '#fff8ec',
  panel: 0xfffaf2,
  accent: 0xff8a3d,
  accentDark: 0xd8642a,
  shadow: 0x7b5cff,
  shadowDark: 0x5236c9,
  shadowGlow: 0x9fe8ff,
  good: 0x3bb273,
  goodText: '#2f9c63',
  warn: 0xf2b134,
  bad: 0xe0565b,
  badText: '#ff7a80',
  star: 0xffc83d,
  starEmpty: 0x8a86a8,
  muted: '#8f8bb0',
  coin: 0xffc83d,
  crystal: 0x8fe9ff,
  light: 0xfff1a8,
  night: 0x120e2a,
} as const;

export const STORAGE_KEY = 'shadow-runner/save';
