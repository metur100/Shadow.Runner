import type { Side, ThemeId } from '../levels/LevelDefinition';
import type { ModelName } from './Models';
import type { RoadStyle } from './Textures';

export interface PropRule {
  model: ModelName;
  /** Relative weight among the street props. */
  weight: number;
  /** Height in metres (models are scaled to it). */
  height: number;
  /** Distance from the road centre (metres). */
  lateral: [number, number];
  /** Turn the model to face the road (+90°/−90°), otherwise random yaw. */
  faceRoad?: boolean;
}

export interface EnvironmentDef {
  sky: { top: number; horizon: number; bottom: number; sun: number; sunDir: [number, number, number]; sunSize: number };
  fog: { color: number; near: number; far: number };
  light: { hemiSky: number; hemiGround: number; hemi: number; sun: number; sunColor: number; rim: number; rimColor: number };
  road: RoadStyle;
  /** Sidewalk / verge. */
  walk: { color: number; kind: 'slab' | 'grass' | 'sand' | 'dark'; curb: number };
  /** Buildings lining the street (empty = open scenery). */
  buildings: ModelName[];
  /** Multiplies building colours (warm brass, neon blue…); 0xffffff = untouched. */
  buildingTint: number;
  /** Shadow worlds: building materials become dark and their windows glow in this colour. */
  windowGlow: number | null;
  props: PropRule[];
  /** Floating motes / dust / embers. */
  particles: { color: number; count: number; size: number; rise: number } | null;
  /** Bunting flags across the street (city). */
  bunting: boolean;
  /** Striped shop awnings on ground floors. */
  awnings: boolean;
  /** Neon light strips along the curbs. */
  neonEdge: number | null;
  clouds: boolean;
  moon: boolean;
  stars: boolean;
  /** Distant skyline silhouettes at the end of the street. */
  skyline: number;
}

const CITY_PROPS: PropRule[] = [
  { model: 'street-light', weight: 3, height: 5.2, lateral: [4.6, 4.6], faceRoad: true },
  { model: 'tree', weight: 3, height: 5.5, lateral: [4.4, 4.8] },
  { model: 'hydrant', weight: 1, height: 0.8, lateral: [4.2, 4.4] },
  { model: 'bench', weight: 1, height: 0.9, lateral: [4.9, 5.0], faceRoad: true },
  { model: 'trashcan', weight: 1, height: 1.1, lateral: [4.9, 5.0] },
  { model: 'bush-flowers', weight: 1, height: 1.1, lateral: [4.8, 5.0] },
  { model: 'traffic-light', weight: 0.5, height: 5.2, lateral: [4.4, 4.4], faceRoad: true },
];

const SHADOW_CITY_PROPS: PropRule[] = [
  { model: 'street-light', weight: 3, height: 5.2, lateral: [4.6, 4.6], faceRoad: true },
  { model: 'dead-tree', weight: 3, height: 6.5, lateral: [4.4, 4.9] },
  { model: 'broken-car', weight: 1, height: 1.4, lateral: [4.6, 5.0] },
  { model: 'dumpster', weight: 1, height: 1.3, lateral: [4.9, 5.0], faceRoad: true },
  { model: 'barrel', weight: 1, height: 1.0, lateral: [4.6, 5.0] },
  { model: 'crystal', weight: 1, height: 1.6, lateral: [4.6, 5.0] },
];

/** Every world in its daylight (reality) and shadow version. */
export const ENVIRONMENTS: Record<ThemeId, Record<Side, EnvironmentDef>> = {
  city: {
    real: {
      sky: { top: 0x3f8fe0, horizon: 0xfff0d2, bottom: 0xf7d9b0, sun: 0xfff3d6, sunDir: [0.35, 0.42, -1], sunSize: 0.035 },
      fog: { color: 0xf3e2c6, near: 30, far: 140 },
      light: { hemiSky: 0xcfe6ff, hemiGround: 0x8a6a50, hemi: 1.25, sun: 2.6, sunColor: 0xffe2b8, rim: 0.5, rimColor: 0xffffff },
      road: { kind: 'asphalt', base: 0x55565f, line: 0xf2efe6, glow: null },
      walk: { color: 0xc2b6a6, kind: 'slab', curb: 0xd9d2c6 },
      buildings: ['house-brick', 'house-big', 'house-large', 'house-tall', 'house-grey', 'house-brick', 'house-big', 'house-wide'],
      buildingTint: 0xffffff,
      windowGlow: null,
      props: CITY_PROPS,
      particles: { color: 0xfff4d8, count: 30, size: 0.06, rise: -0.15 },
      bunting: true,
      awnings: true,
      neonEdge: null,
      clouds: true,
      moon: false,
      stars: false,
      skyline: 0xd7b48e,
    },
    shadow: {
      sky: { top: 0x070516, horizon: 0x3a2378, bottom: 0x1a1240, sun: 0xd9d2ff, sunDir: [-0.4, 0.5, -1], sunSize: 0.02 },
      fog: { color: 0x2a1a5c, near: 14, far: 95 },
      light: { hemiSky: 0x5a46b8, hemiGround: 0x120a2a, hemi: 0.9, sun: 0.8, sunColor: 0xa48cff, rim: 2.2, rimColor: 0x9a7bff },
      road: { kind: 'cobble', base: 0x2a2150, line: null, glow: 0x8f6bff },
      walk: { color: 0x221a44, kind: 'dark', curb: 0x3a2d78 },
      buildings: ['house-brick', 'house-big', 'house-large', 'house-tall', 'house-grey', 'house-brick', 'house-big', 'house-wide'],
      buildingTint: 0xffffff,
      windowGlow: 0x9a7bff,
      props: SHADOW_CITY_PROPS,
      particles: { color: 0xb59cff, count: 70, size: 0.07, rise: 0.25 },
      bunting: false,
      awnings: false,
      neonEdge: 0x7b5cff,
      clouds: false,
      moon: true,
      stars: true,
      skyline: 0x241650,
    },
  },
  park: {
    real: {
      sky: { top: 0x48a6ee, horizon: 0xeafbe0, bottom: 0xd8f0c8, sun: 0xfffbe8, sunDir: [-0.3, 0.5, -1], sunSize: 0.035 },
      fog: { color: 0xdcf0d8, near: 30, far: 140 },
      light: { hemiSky: 0xdff2ff, hemiGround: 0x5a7a3a, hemi: 1.3, sun: 2.5, sunColor: 0xfff0cc, rim: 0.4, rimColor: 0xffffff },
      road: { kind: 'path', base: 0xc9a46c, line: null, glow: null },
      walk: { color: 0x6fbf5a, kind: 'grass', curb: 0x9a8a72 },
      buildings: ['cottage', 'cottage'],
      buildingTint: 0xffffff,
      windowGlow: null,
      props: [
        { model: 'tree', weight: 4, height: 6, lateral: [4.6, 7] },
        { model: 'tree-wide', weight: 3, height: 4.5, lateral: [5, 8] },
        { model: 'tree-tall', weight: 2, height: 8, lateral: [6, 9] },
        { model: 'hedge', weight: 2, height: 1.2, lateral: [4.2, 4.4], faceRoad: true },
        { model: 'bush-flowers', weight: 3, height: 1.1, lateral: [4.2, 5.2] },
        { model: 'bush', weight: 2, height: 1.3, lateral: [4.3, 6] },
        { model: 'bench', weight: 1.5, height: 0.9, lateral: [4.4, 4.4], faceRoad: true },
        { model: 'street-light-2', weight: 1.5, height: 4.2, lateral: [4.2, 4.2], faceRoad: true },
      ],
      particles: { color: 0xfff6a8, count: 40, size: 0.05, rise: 0.1 },
      bunting: false,
      awnings: false,
      neonEdge: null,
      clouds: true,
      moon: false,
      stars: false,
      skyline: 0x9fcf8a,
    },
    shadow: {
      sky: { top: 0x040a14, horizon: 0x15374a, bottom: 0x0b1a26, sun: 0xc8fff0, sunDir: [0.4, 0.5, -1], sunSize: 0.02 },
      fog: { color: 0x0f2a36, near: 12, far: 90 },
      light: { hemiSky: 0x3a8a8a, hemiGround: 0x061018, hemi: 0.8, sun: 0.6, sunColor: 0x9affe0, rim: 2.2, rimColor: 0x4ad6a6 },
      road: { kind: 'path', base: 0x1a2a34, line: null, glow: 0x4ad6a6 },
      walk: { color: 0x0f2026, kind: 'grass', curb: 0x1d3352 },
      buildings: ['cottage'],
      buildingTint: 0xffffff,
      windowGlow: 0x4ad6a6,
      props: [
        { model: 'dead-tree', weight: 5, height: 7, lateral: [4.6, 8] },
        { model: 'hedge', weight: 2, height: 1.2, lateral: [4.2, 4.4], faceRoad: true },
        { model: 'crystal', weight: 2, height: 1.4, lateral: [4.4, 6] },
        { model: 'street-light-2', weight: 1.5, height: 4.2, lateral: [4.2, 4.2], faceRoad: true },
      ],
      particles: { color: 0x7affd4, count: 80, size: 0.07, rise: 0.2 },
      bunting: false,
      awnings: false,
      neonEdge: 0x4ad6a6,
      clouds: false,
      moon: true,
      stars: true,
      skyline: 0x0f2a36,
    },
  },
  neon: {
    real: {
      sky: { top: 0x1a1048, horizon: 0xff7ab8, bottom: 0x6a3a9a, sun: 0xffd27a, sunDir: [0, 0.12, -1], sunSize: 0.08 },
      fog: { color: 0x9a4a9e, near: 25, far: 130 },
      light: { hemiSky: 0xb08cff, hemiGround: 0x3a1a4a, hemi: 1.1, sun: 1.8, sunColor: 0xffb0d0, rim: 1.4, rimColor: 0x2ee6ff },
      road: { kind: 'asphalt', base: 0x2c2848, line: 0xff3db8, glow: null },
      walk: { color: 0x3a3266, kind: 'slab', curb: 0x4b3aa8 },
      buildings: ['house-grey', 'house-large', 'house-tall', 'house-big', 'house-grey'],
      buildingTint: 0x8a86d8,
      windowGlow: 0x2ee6ff,
      props: [
        { model: 'street-light', weight: 3, height: 5.4, lateral: [4.6, 4.6], faceRoad: true },
        { model: 'neon-signs', weight: 2, height: 3.2, lateral: [5.2, 5.4], faceRoad: true },
        { model: 'trashcan', weight: 1, height: 1.1, lateral: [4.9, 5] },
        { model: 'traffic-light', weight: 1, height: 5.2, lateral: [4.4, 4.4], faceRoad: true },
        { model: 'police-car', weight: 0.6, height: 1.4, lateral: [5, 5] },
      ],
      particles: { color: 0xffe680, count: 40, size: 0.05, rise: 0.1 },
      bunting: false,
      awnings: true,
      neonEdge: 0x2ee6ff,
      clouds: false,
      moon: false,
      stars: true,
      skyline: 0x3a2370,
    },
    shadow: {
      sky: { top: 0x020108, horizon: 0x3a0f4a, bottom: 0x10061e, sun: 0xff3db8, sunDir: [0, 0.2, -1], sunSize: 0.03 },
      fog: { color: 0x1e0a30, near: 12, far: 90 },
      light: { hemiSky: 0x6a2a8a, hemiGround: 0x08040f, hemi: 0.8, sun: 0.6, sunColor: 0xff3db8, rim: 2.4, rimColor: 0xff3db8 },
      road: { kind: 'asphalt', base: 0x130b22, line: 0x2ee6ff, glow: 0xff3db8 },
      walk: { color: 0x120a22, kind: 'dark', curb: 0x2a1450 },
      buildings: ['house-grey', 'house-large', 'house-tall', 'house-big'],
      buildingTint: 0xffffff,
      windowGlow: 0xff3db8,
      props: [
        { model: 'street-light', weight: 3, height: 5.4, lateral: [4.6, 4.6], faceRoad: true },
        { model: 'neon-signs', weight: 2, height: 3.2, lateral: [5.2, 5.4], faceRoad: true },
        { model: 'broken-car', weight: 1, height: 1.4, lateral: [4.8, 5] },
        { model: 'crystal', weight: 1, height: 1.5, lateral: [4.6, 5] },
      ],
      particles: { color: 0x2ee6ff, count: 80, size: 0.06, rise: 0.25 },
      bunting: false,
      awnings: false,
      neonEdge: 0xff3db8,
      clouds: false,
      moon: true,
      stars: true,
      skyline: 0x1e0a30,
    },
  },
  clockwork: {
    real: {
      sky: { top: 0x6a9ad0, horizon: 0xffd38a, bottom: 0xf0b070, sun: 0xffe6a8, sunDir: [-0.45, 0.3, -1], sunSize: 0.045 },
      fog: { color: 0xf2c88e, near: 25, far: 125 },
      light: { hemiSky: 0xffe6c0, hemiGround: 0x6a4224, hemi: 1.15, sun: 2.6, sunColor: 0xffc880, rim: 0.6, rimColor: 0xffe08a },
      road: { kind: 'cobble', base: 0x8a6448, line: null, glow: null },
      walk: { color: 0xa8784c, kind: 'slab', curb: 0xc99a62 },
      buildings: ['house-brick', 'house-big', 'house-tall', 'house-large'],
      buildingTint: 0xffd9a8,
      windowGlow: null,
      props: [
        { model: 'street-light-2', weight: 3, height: 4.6, lateral: [4.5, 4.5], faceRoad: true },
        { model: 'water-tower', weight: 1, height: 9, lateral: [7, 9] },
        { model: 'pipes', weight: 2, height: 1.2, lateral: [4.8, 5] },
        { model: 'barrel', weight: 2, height: 1.1, lateral: [4.6, 5] },
        { model: 'crate', weight: 2, height: 1.0, lateral: [4.6, 5] },
      ],
      particles: { color: 0xffe8b8, count: 40, size: 0.05, rise: 0.15 },
      bunting: true,
      awnings: true,
      neonEdge: null,
      clouds: true,
      moon: false,
      stars: false,
      skyline: 0xc9925a,
    },
    shadow: {
      sky: { top: 0x0a0716, horizon: 0x4a2f2a, bottom: 0x1a1020, sun: 0xffcf7a, sunDir: [0.4, 0.4, -1], sunSize: 0.02 },
      fog: { color: 0x2b1d2a, near: 12, far: 90 },
      light: { hemiSky: 0x7a5a3a, hemiGround: 0x100a14, hemi: 0.8, sun: 0.7, sunColor: 0xd9a441, rim: 2.2, rimColor: 0xd9a441 },
      road: { kind: 'cobble', base: 0x231a2a, line: null, glow: 0xd9a441 },
      walk: { color: 0x1a1220, kind: 'dark', curb: 0x33243f },
      buildings: ['house-brick', 'house-big', 'house-tall', 'house-large'],
      buildingTint: 0xffffff,
      windowGlow: 0xd9a441,
      props: [
        { model: 'street-light-2', weight: 3, height: 4.6, lateral: [4.5, 4.5], faceRoad: true },
        { model: 'dead-tree', weight: 2, height: 6, lateral: [4.6, 5] },
        { model: 'pipes', weight: 2, height: 1.2, lateral: [4.8, 5] },
        { model: 'barrel', weight: 2, height: 1.1, lateral: [4.6, 5] },
      ],
      particles: { color: 0xffcf7a, count: 70, size: 0.06, rise: 0.3 },
      bunting: false,
      awnings: false,
      neonEdge: 0xd9a441,
      clouds: false,
      moon: true,
      stars: true,
      skyline: 0x2b1d2a,
    },
  },
  temple: {
    real: {
      sky: { top: 0x2f9be8, horizon: 0xfff4d0, bottom: 0xf0dca8, sun: 0xffffee, sunDir: [0.3, 0.6, -1], sunSize: 0.04 },
      fog: { color: 0xf6ecd0, near: 30, far: 140 },
      light: { hemiSky: 0xe0f4ff, hemiGround: 0xa07a48, hemi: 1.3, sun: 2.8, sunColor: 0xfff0d0, rim: 0.4, rimColor: 0xffffff },
      road: { kind: 'stone', base: 0xd8b882, line: null, glow: null },
      walk: { color: 0xe2c48e, kind: 'sand', curb: 0xc4a06a },
      buildings: [],
      buildingTint: 0xffe8c0,
      windowGlow: null,
      props: [
        { model: 'column', weight: 4, height: 5.5, lateral: [4.6, 4.6] },
        { model: 'arch', weight: 1.5, height: 6, lateral: [5.4, 5.4], faceRoad: true },
        { model: 'palm', weight: 3, height: 6, lateral: [5.2, 8] },
        { model: 'stone-wall', weight: 2, height: 2.2, lateral: [5.8, 6], faceRoad: true },
        { model: 'bush', weight: 1, height: 1.2, lateral: [4.6, 6] },
      ],
      particles: { color: 0xffffff, count: 30, size: 0.05, rise: 0.05 },
      bunting: false,
      awnings: false,
      neonEdge: null,
      clouds: true,
      moon: false,
      stars: false,
      skyline: 0xd8c08a,
    },
    shadow: {
      sky: { top: 0x01121c, horizon: 0x0f5068, bottom: 0x062a3a, sun: 0xb7fff4, sunDir: [-0.2, 0.6, -1], sunSize: 0.025 },
      fog: { color: 0x0a3a4c, near: 16, far: 95 },
      light: { hemiSky: 0x2a9aa8, hemiGround: 0x041018, hemi: 0.9, sun: 0.9, sunColor: 0x5cffe6, rim: 2.2, rimColor: 0x5cffe6 },
      road: { kind: 'stone', base: 0x0e3442, line: null, glow: 0x5cffe6 },
      walk: { color: 0x082a36, kind: 'dark', curb: 0x0f4256 },
      buildings: [],
      buildingTint: 0xffffff,
      windowGlow: 0x5cffe6,
      props: [
        { model: 'column', weight: 4, height: 5.5, lateral: [4.6, 4.6] },
        { model: 'arch-round', weight: 1.5, height: 6, lateral: [5.4, 5.4], faceRoad: true },
        { model: 'crystal', weight: 2, height: 1.6, lateral: [4.6, 6] },
        { model: 'stone-wall', weight: 2, height: 2.2, lateral: [5.8, 6], faceRoad: true },
      ],
      particles: { color: 0xb7fff4, count: 110, size: 0.08, rise: 0.45 },
      bunting: false,
      awnings: false,
      neonEdge: 0x5cffe6,
      clouds: false,
      moon: false,
      stars: false,
      skyline: 0x0a3a4c,
    },
  },
  eclipse: {
    real: {
      sky: { top: 0x3a2a6a, horizon: 0xff9a5a, bottom: 0xc9607a, sun: 0xffc070, sunDir: [-0.15, 0.1, -1], sunSize: 0.09 },
      fog: { color: 0xe88a7a, near: 25, far: 125 },
      light: { hemiSky: 0xffb08a, hemiGround: 0x4a2a4a, hemi: 1.1, sun: 2.4, sunColor: 0xff9a5a, rim: 1, rimColor: 0xffb23d },
      road: { kind: 'rooftop', base: 0x5a4a5a, line: null, glow: null },
      walk: { color: 0x4a3a4c, kind: 'slab', curb: 0x6a4a6e },
      buildings: [],
      buildingTint: 0xffc0a0,
      windowGlow: null,
      props: [
        { model: 'water-tower', weight: 2, height: 8, lateral: [6, 9] },
        { model: 'antenna', weight: 2, height: 3, lateral: [4.6, 6] },
        { model: 'dish', weight: 2, height: 2.4, lateral: [4.8, 6], faceRoad: true },
        { model: 'pipes', weight: 3, height: 1.2, lateral: [4.4, 5] },
        { model: 'fence', weight: 2, height: 1.8, lateral: [4.4, 4.4], faceRoad: true },
        { model: 'crate', weight: 1, height: 1, lateral: [4.6, 5.6] },
      ],
      particles: { color: 0xffd9a0, count: 40, size: 0.05, rise: 0.2 },
      bunting: false,
      awnings: false,
      neonEdge: null,
      clouds: true,
      moon: false,
      stars: false,
      skyline: 0x5a2f5a,
    },
    shadow: {
      sky: { top: 0x020104, horizon: 0x4a1a6a, bottom: 0x14061e, sun: 0xc44dff, sunDir: [0.1, 0.25, -1], sunSize: 0.05 },
      fog: { color: 0x22093a, near: 10, far: 85 },
      light: { hemiSky: 0x7a3aaa, hemiGround: 0x06030a, hemi: 0.8, sun: 0.8, sunColor: 0xc44dff, rim: 2.6, rimColor: 0xc44dff },
      road: { kind: 'rooftop', base: 0x1a0e26, line: null, glow: 0xc44dff },
      walk: { color: 0x120818, kind: 'dark', curb: 0x2e1450 },
      buildings: [],
      buildingTint: 0xffffff,
      windowGlow: 0xc44dff,
      props: [
        { model: 'water-tower', weight: 2, height: 8, lateral: [6, 9] },
        { model: 'antenna', weight: 2, height: 3, lateral: [4.6, 6] },
        { model: 'crystal', weight: 3, height: 2, lateral: [4.6, 7] },
        { model: 'pipes', weight: 2, height: 1.2, lateral: [4.4, 5] },
        { model: 'dead-tree', weight: 1, height: 5, lateral: [5, 7] },
      ],
      particles: { color: 0xe2a6ff, count: 100, size: 0.07, rise: 0.4 },
      bunting: false,
      awnings: false,
      neonEdge: 0xc44dff,
      clouds: false,
      moon: true,
      stars: true,
      skyline: 0x22093a,
    },
  },
};

export function environment(theme: ThemeId, side: Side): EnvironmentDef {
  return ENVIRONMENTS[theme][side];
}
