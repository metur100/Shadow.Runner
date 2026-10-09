import type { Side, ThemeId } from '../levels/LevelDefinition';

export interface LanePalette {
  skyTop: number;
  skyBottom: number;
  /** Distant silhouettes. */
  far: number;
  /** Closer scenery. */
  mid: number;
  /** Lit details (windows, flowers, lamps, glowing cracks). */
  detail: number;
  ground: number;
  groundTop: number;
  /** Obstacles drawn in this lane. */
  solid: number;
  solidEdge: number;
  /** Ambient particles (dust, pollen, motes, bubbles). */
  particle: number;
}

export interface Theme {
  id: ThemeId;
  real: LanePalette;
  shadow: LanePalette;
  /** Scenery style: what the far / mid layers are made of. */
  scenery: 'city' | 'park' | 'neon' | 'clockwork' | 'temple' | 'eclipse';
}

/**
 * Six worlds, each with a warm daylight reality palette and a dark indigo / violet shadow palette, so
 * the two halves of the screen read instantly as two different worlds.
 */
export const THEMES: Record<ThemeId, Theme> = {
  city: {
    id: 'city',
    scenery: 'city',
    real: { skyTop: 0x7fd4f5, skyBottom: 0xffe3b3, far: 0xf4b48c, mid: 0xff8f5e, detail: 0x2ec4b6, ground: 0x8a5a44, groundTop: 0xffc96b, solid: 0x5b6b8c, solidEdge: 0x2f3b57, particle: 0xffffff },
    shadow: { skyTop: 0x0b0822, skyBottom: 0x2a1b5c, far: 0x1d1546, mid: 0x2c2068, detail: 0x9fe8ff, ground: 0x150f33, groundTop: 0x7b5cff, solid: 0x0d0a24, solidEdge: 0x9a7bff, particle: 0x9fe8ff },
  },
  park: {
    id: 'park',
    scenery: 'park',
    real: { skyTop: 0x8fe1ff, skyBottom: 0xeaffd4, far: 0xa6dc84, mid: 0x4fb36b, detail: 0xffc83d, ground: 0x7a5636, groundTop: 0x6fd36b, solid: 0x7a5a3a, solidEdge: 0x4a3420, particle: 0xfff6a8 },
    shadow: { skyTop: 0x070d1a, skyBottom: 0x16263f, far: 0x121f36, mid: 0x1d3352, detail: 0x7affd4, ground: 0x0c1525, groundTop: 0x4ad6a6, solid: 0x08101e, solidEdge: 0x4ad6a6, particle: 0x7affd4 },
  },
  neon: {
    id: 'neon',
    scenery: 'neon',
    real: { skyTop: 0x6a5cff, skyBottom: 0xff8ac9, far: 0x4b3aa8, mid: 0x2b2470, detail: 0x2ee6ff, ground: 0x2a2350, groundTop: 0xff3db8, solid: 0x1f1a46, solidEdge: 0x2ee6ff, particle: 0xffe680 },
    shadow: { skyTop: 0x04020c, skyBottom: 0x1a0b33, far: 0x120a2a, mid: 0x1e0f40, detail: 0xff3db8, ground: 0x0b0718, groundTop: 0x2ee6ff, solid: 0x07040f, solidEdge: 0xff3db8, particle: 0x2ee6ff },
  },
  clockwork: {
    id: 'clockwork',
    scenery: 'clockwork',
    real: { skyTop: 0xffd99a, skyBottom: 0xf6b87a, far: 0xd19a5c, mid: 0xa8693a, detail: 0xffe08a, ground: 0x6b4226, groundTop: 0xffc261, solid: 0x7a4e2c, solidEdge: 0x3e2614, particle: 0xffe8b8 },
    shadow: { skyTop: 0x0f0b20, skyBottom: 0x2b1d3a, far: 0x241a34, mid: 0x33243f, detail: 0xd9a441, ground: 0x171024, groundTop: 0xd9a441, solid: 0x100b1c, solidEdge: 0xd9a441, particle: 0xffcf7a },
  },
  temple: {
    id: 'temple',
    scenery: 'temple',
    real: { skyTop: 0x9fefff, skyBottom: 0xfff1c4, far: 0x86cfc0, mid: 0xe7c48a, detail: 0x2fb5a3, ground: 0xc4915a, groundTop: 0xf3d39a, solid: 0xb98a55, solidEdge: 0x6e4e2b, particle: 0xffffff },
    shadow: { skyTop: 0x03131f, skyBottom: 0x0b3350, far: 0x082638, mid: 0x0f4256, detail: 0x5cffe6, ground: 0x061a26, groundTop: 0x5cffe6, solid: 0x041019, solidEdge: 0x5cffe6, particle: 0xb7fff4 },
  },
  eclipse: {
    id: 'eclipse',
    scenery: 'eclipse',
    real: { skyTop: 0xff9a6b, skyBottom: 0x6a3a8a, far: 0x8a4f8f, mid: 0x4a2a5a, detail: 0xffb23d, ground: 0x3a2440, groundTop: 0xffb23d, solid: 0x2a1a33, solidEdge: 0xffb23d, particle: 0xffd9a0 },
    shadow: { skyTop: 0x040208, skyBottom: 0x260f3d, far: 0x1a0b2a, mid: 0x2e1450, detail: 0xc44dff, ground: 0x0a0612, groundTop: 0xc44dff, solid: 0x05030a, solidEdge: 0xc44dff, particle: 0xe2a6ff },
  },
};

export function lanePalette(theme: ThemeId, side: Side): LanePalette {
  return THEMES[theme][side];
}

export const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
