import type Phaser from 'phaser';

import type { Side, ThemeId } from '../levels/LevelDefinition';
import { CURB, NEAR_Z, ROAD_HALF, type LaneCamera } from './Perspective';
import { mix } from './Themes';

type PropKind = 'building' | 'tree' | 'deadTree' | 'lamp' | 'pillar' | 'kelp' | 'block' | 'shard';

export interface SceneryStyle {
  road: number;
  roadAlt: number;
  /** Centre dashes (null = none). */
  line: number | null;
  /** Glowing edge lines along the road (shadow worlds). */
  edge: number | null;
  curb: number;
  walk: number;
  walkAlt: number;
  fog: number;
  buildings: number[];
  window: number;
  windowLit: number;
  /** Broken, jagged roofs (shadow worlds). */
  jagged: boolean;
  /** Neon strip colour along roof lines. */
  neon: number | null;
  foliage: number;
  trunk: number;
  /** Props and their relative weights. */
  props: [PropKind, number][];
  /** Building heights (world units). */
  height: [number, number];
}

const S = (s: SceneryStyle): SceneryStyle => s;

/** Street furniture for every world, in a warm daylight version and a dark shadow version. */
const STYLES: Record<ThemeId, Record<Side, SceneryStyle>> = {
  city: {
    real: S({ road: 0x5c5e6b, roadAlt: 0x575966, line: 0xf4f1e8, edge: null, curb: 0xd8cfc2, walk: 0xb9aa98, walkAlt: 0xb0a08e, fog: 0xcfe3ee, buildings: [0xc8684a, 0xe2b48a, 0x7fa3c4, 0xd98b5f, 0xb5523f, 0xe8d2b0], window: 0x4f6f94, windowLit: 0xbfe3ff, jagged: false, neon: null, foliage: 0x4fa65a, trunk: 0x6b4a2e, props: [['building', 8], ['tree', 2], ['lamp', 1]], height: [220, 480] }),
    shadow: S({ road: 0x1e1840, roadAlt: 0x241c4c, line: null, edge: 0x7b5cff, curb: 0x3a2d78, walk: 0x221a46, walkAlt: 0x1d163e, fog: 0x2a1b5c, buildings: [0x1b1442, 0x221a52, 0x161038], window: 0x2c2266, windowLit: 0x9a7bff, jagged: true, neon: null, foliage: 0x2c2068, trunk: 0x140f30, props: [['building', 8], ['deadTree', 2]], height: [200, 460] }),
  },
  park: {
    real: S({ road: 0xcfa86e, roadAlt: 0xc8a067, line: null, edge: null, curb: 0x8a6a44, walk: 0x6fcf6b, walkAlt: 0x66c562, fog: 0xdff6e4, buildings: [0xa6dc84, 0x88c870], window: 0x5a9a5a, windowLit: 0xffe9a8, jagged: false, neon: null, foliage: 0x47a85c, trunk: 0x7a5636, props: [['tree', 6], ['lamp', 1], ['block', 1]], height: [60, 120] }),
    shadow: S({ road: 0x101b30, roadAlt: 0x132038, line: null, edge: 0x4ad6a6, curb: 0x1d3352, walk: 0x0c1525, walkAlt: 0x0e1829, fog: 0x16263f, buildings: [0x121f36], window: 0x1d3352, windowLit: 0x7affd4, jagged: true, neon: null, foliage: 0x1d3352, trunk: 0x08101e, props: [['deadTree', 6], ['block', 1]], height: [60, 120] }),
  },
  neon: {
    real: S({ road: 0x2c2552, roadAlt: 0x302858, line: 0xff3db8, edge: 0x2ee6ff, curb: 0x4b3aa8, walk: 0x3a3070, walkAlt: 0x342a66, fog: 0xc98ad9, buildings: [0x3a2f86, 0x2b2470, 0x4b3aa8, 0x241d5c], window: 0x2ee6ff, windowLit: 0xffe680, jagged: false, neon: 0xff3db8, foliage: 0x2ee6ff, trunk: 0x1f1a46, props: [['building', 9], ['lamp', 1]], height: [320, 620] }),
    shadow: S({ road: 0x0d0820, roadAlt: 0x110a28, line: 0x2ee6ff, edge: 0xff3db8, curb: 0x1e0f40, walk: 0x0b0718, walkAlt: 0x0e0a1e, fog: 0x1a0b33, buildings: [0x120a2a, 0x1a0e38], window: 0x1e0f40, windowLit: 0xff3db8, jagged: true, neon: 0x2ee6ff, foliage: 0xff3db8, trunk: 0x07040f, props: [['building', 9]], height: [300, 600] }),
  },
  clockwork: {
    real: S({ road: 0x8a6244, roadAlt: 0x835c3f, line: null, edge: null, curb: 0xc98b4f, walk: 0xa8774c, walkAlt: 0xa07047, fog: 0xf6d6a8, buildings: [0xb07a46, 0xc99a62, 0x8f5d36, 0xd8a86a], window: 0x5a3a20, windowLit: 0xffe08a, jagged: false, neon: null, foliage: 0xc98b4f, trunk: 0x3e2614, props: [['building', 7], ['pillar', 2], ['lamp', 1]], height: [240, 520] }),
    shadow: S({ road: 0x1a1228, roadAlt: 0x1e152e, line: null, edge: 0xd9a441, curb: 0x33243f, walk: 0x171024, walkAlt: 0x150e21, fog: 0x2b1d3a, buildings: [0x241a34, 0x2c2040], window: 0x33243f, windowLit: 0xd9a441, jagged: true, neon: null, foliage: 0xd9a441, trunk: 0x100b1c, props: [['building', 7], ['pillar', 2]], height: [220, 500] }),
  },
  temple: {
    real: S({ road: 0xe2c48e, roadAlt: 0xdcbd86, line: null, edge: null, curb: 0xb98a55, walk: 0xd4ad74, walkAlt: 0xcda56c, fog: 0xfff1c4, buildings: [0xe7c48a, 0xd9b077, 0xcfa46a], window: 0x8a6a3e, windowLit: 0x2fb5a3, jagged: false, neon: null, foliage: 0x3f9e5a, trunk: 0x8a6a3e, props: [['pillar', 5], ['tree', 3], ['building', 2]], height: [160, 320] }),
    shadow: S({ road: 0x072235, roadAlt: 0x082840, line: null, edge: 0x5cffe6, curb: 0x0f4256, walk: 0x061a26, walkAlt: 0x071e2c, fog: 0x0b3350, buildings: [0x082638, 0x0f4256], window: 0x0f4256, windowLit: 0x5cffe6, jagged: true, neon: null, foliage: 0x2a8a7a, trunk: 0x041019, props: [['pillar', 4], ['kelp', 4], ['building', 1]], height: [160, 320] }),
  },
  eclipse: {
    real: S({ road: 0x4a3a52, roadAlt: 0x45364d, line: 0xffb23d, edge: null, curb: 0x6a4a6e, walk: 0x3a2a44, walkAlt: 0x36273f, fog: 0xc9708a, buildings: [0x5a3a66, 0x4a2a5a, 0x6a4470], window: 0x2a1a33, windowLit: 0xffb23d, jagged: false, neon: null, foliage: 0xffb23d, trunk: 0x2a1a33, props: [['block', 4], ['building', 3], ['lamp', 1]], height: [140, 360] }),
    shadow: S({ road: 0x0e0818, roadAlt: 0x120a1f, line: null, edge: 0xc44dff, curb: 0x2e1450, walk: 0x0a0612, walkAlt: 0x0c0716, fog: 0x260f3d, buildings: [0x1a0b2a, 0x2e1450], window: 0x2e1450, windowLit: 0xc44dff, jagged: true, neon: null, foliage: 0xc44dff, trunk: 0x05030a, props: [['shard', 5], ['building', 3]], height: [140, 380] }),
  },
};

export function sceneryStyle(theme: ThemeId, side: Side): SceneryStyle {
  return STYLES[theme][side];
}

const SLOT = 230;
const FAR_X = 1700;
const BAND = 90;
const DASH = 150;

function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Road, sidewalks and roadside props of one lane, redrawn every frame through the lane camera.
 * Props are placed deterministically from their slot number, so the street is the same on every
 * attempt and goes on forever in endless mode.
 */
export class SceneryRenderer {
  private readonly weights: number;

  constructor(
    private readonly cam: LaneCamera,
    private readonly st: SceneryStyle,
    private readonly seed: number,
    private readonly detail: boolean,
  ) {
    this.weights = st.props.reduce((a, [, w]) => a + w, 0);
  }

  private fogged(color: number, z: number): number {
    const t = Math.min(0.85, Math.max(0, (z - 500) / 1500));
    return t > 0 ? mix(color, this.st.fog, t) : color;
  }

  draw(g: Phaser.GameObjects.Graphics): void {
    const cam = this.cam;
    const st = this.st;
    const scroll = cam.scroll;
    const zNear = NEAR_Z;
    const zFar = cam.z(scroll + FAR_X);
    const far = cam.z(scroll + 9000);

    // Sidewalks and road, out to the horizon.
    g.fillStyle(st.walk, 1);
    cam.flat(g, -CURB - 900, CURB + 900, zNear, far);
    g.fillStyle(st.road, 1);
    cam.flat(g, -ROAD_HALF, ROAD_HALF, zNear, far);

    // Alternating bands give a sense of speed.
    const first = Math.floor((scroll - 200) / BAND);
    for (let i = first; i * BAND < scroll + FAR_X; i++) {
      if (i % 2 !== 0) continue;
      const z0 = Math.max(zNear, cam.z(i * BAND));
      const z1 = cam.z((i + 1) * BAND);
      if (z1 <= zNear) continue;
      g.fillStyle(this.fogged(st.roadAlt, z0), 1);
      cam.flat(g, -ROAD_HALF, ROAD_HALF, z0, z1);
      g.fillStyle(this.fogged(st.walkAlt, z0), 1);
      cam.flat(g, -CURB - 900, -ROAD_HALF - 14, z0, z1);
      cam.flat(g, ROAD_HALF + 14, CURB + 900, z0, z1);
    }
    // Curbs.
    g.fillStyle(st.curb, 1);
    cam.flat(g, -ROAD_HALF - 14, -ROAD_HALF, zNear, far);
    cam.flat(g, ROAD_HALF, ROAD_HALF + 14, zNear, far);
    if (st.edge !== null) {
      g.fillStyle(st.edge, 0.85);
      cam.flat(g, -ROAD_HALF - 3, -ROAD_HALF + 3, zNear, zFar);
      cam.flat(g, ROAD_HALF - 3, ROAD_HALF + 3, zNear, zFar);
    }
    // Centre dashes.
    if (st.line !== null) {
      g.fillStyle(st.line, 0.9);
      const d0 = Math.floor((scroll - 200) / DASH);
      for (let i = d0; i * DASH < scroll + FAR_X; i++) {
        const z0 = Math.max(zNear, cam.z(i * DASH));
        const z1 = cam.z(i * DASH + DASH * 0.5);
        if (z1 <= zNear) continue;
        cam.flat(g, -5, 5, z0, z1);
      }
    }
    if (st.jagged && this.detail) {
      // Glowing cracks in the shadow road.
      g.fillStyle(st.edge ?? st.windowLit, 0.45);
      const c0 = Math.floor((scroll - 200) / 260);
      for (let i = c0; i * 260 < scroll + FAR_X * 0.6; i++) {
        const r = hash(i * 7 + this.seed);
        const lat = (r - 0.5) * ROAD_HALF * 1.4;
        const z0 = cam.z(i * 260 + r * 80);
        const z1 = z0 + 60;
        if (z0 <= zNear) continue;
        cam.quad(g, lat, z0, 0, lat + 8, z0, 0, lat + 30 * (r - 0.3), z1, 0, lat + 30 * (r - 0.3) - 4, z1, 0);
      }
    }

    // Roadside props, far to near.
    const s0 = Math.floor((scroll - 120) / SLOT);
    const s1 = Math.ceil((scroll + FAR_X) / SLOT);
    for (let i = s1; i >= s0; i--) {
      this.prop(g, i, -1);
      this.prop(g, i, 1);
    }
  }

  private pick(r: number): PropKind {
    let acc = r * this.weights;
    for (const [kind, w] of this.st.props) {
      acc -= w;
      if (acc < 0) return kind;
    }
    return this.st.props[0][0];
  }

  private prop(g: Phaser.GameObjects.Graphics, slot: number, dir: number): void {
    const cam = this.cam;
    const st = this.st;
    const key = slot * 2 + (dir > 0 ? 1 : 0) + this.seed;
    const r1 = hash(key);
    const r2 = hash(key + 101);
    const r3 = hash(key + 202);
    const kind = this.pick(r1);
    const x0 = slot * SLOT;
    switch (kind) {
      case 'building':
      case 'block': {
        const block = kind === 'block';
        const gap = block ? 60 + r3 * 50 : r3 < 0.25 ? 40 : 6;
        const xa = x0 + (block ? 30 : 0);
        const xb = x0 + SLOT - gap;
        const z0 = cam.z(xa);
        const z1 = cam.z(xb);
        if (z1 <= NEAR_Z) return;
        const zn = Math.max(NEAR_Z, z0);
        const [hMin, hMax] = st.height;
        const h = block ? 40 + r2 * 60 : hMin + r2 * (hMax - hMin);
        const base = st.buildings[Math.floor(r3 * st.buildings.length) % st.buildings.length];
        const lat = dir * (CURB + (block ? -40 : 0));
        const depthW = block ? 60 : 700;
        // End face toward the camera, then the front along the road.
        g.fillStyle(this.fogged(mix(base, 0x000000, 0.28), zn), 1);
        if (dir < 0) cam.front(g, lat - depthW, lat, zn, 0, h);
        else cam.front(g, lat, lat + depthW, zn, 0, h);
        g.fillStyle(this.fogged(base, zn), 1);
        cam.side(g, lat, zn, z1, 0, h);
        if (st.jagged && !block) {
          // Broken roof line.
          g.fillStyle(this.fogged(base, zn), 1);
          const steps = 4;
          for (let k = 0; k < steps; k++) {
            const za = Math.max(zn, z0 + ((z1 - z0) * k) / steps);
            const zb = z0 + ((z1 - z0) * (k + 1)) / steps;
            if (zb <= zn) continue;
            const peak = h + 20 + hash(key + k * 13) * 60;
            cam.quad(g, lat, za, h - 1, lat, (za + zb) / 2, peak, lat, zb, h - 1, lat, zb, h - 1);
          }
        }
        if (st.neon !== null) {
          g.fillStyle(st.neon, 0.95);
          cam.side(g, lat, zn, z1, h - 10, h - 4);
          cam.side(g, lat, zn, z1, h * 0.5, h * 0.5 + 5);
        }
        // Windows (skipped for distant buildings and on low-end devices).
        if (!block && this.detail && cam.scale(zn) > 0.18) {
          const cols = Math.max(1, Math.floor((xb - xa - 30) / 46));
          for (let row = 0; 50 + row * 62 < h - 40; row++) {
            const wy = 50 + row * 62;
            for (let c = 0; c < cols; c++) {
              const wa = cam.z(xa + 22 + c * 46);
              const wb = wa + 26;
              if (wa <= NEAR_Z) continue;
              const lit = hash(key * 31 + row * 7 + c) < (st.jagged ? 0.35 : 0.22);
              g.fillStyle(this.fogged(lit ? st.windowLit : st.window, wa), st.jagged && !lit ? 0.6 : 1);
              cam.side(g, lat, wa, wb, wy, wy + 32);
            }
          }
        }
        if (!block && !st.jagged && st.neon === null && r2 > 0.55 && cam.scale(zn) > 0.25) {
          // Shop awning at street level.
          g.fillStyle(this.fogged(r3 > 0.5 ? 0xe0565b : 0x2ec4b6, zn), 1);
          const ld = lat - dir * 30;
          cam.quad(g, lat, Math.max(zn, cam.z(xa + 20)), 92, lat, cam.z(xb - 20), 92, ld, cam.z(xb - 20), 76, ld, Math.max(zn, cam.z(xa + 20)), 76);
        }
        break;
      }
      case 'tree':
      case 'deadTree':
      case 'lamp':
      case 'pillar':
      case 'kelp':
      case 'shard': {
        const x = x0 + SLOT * (0.2 + r3 * 0.6);
        const z = cam.z(x);
        if (z <= NEAR_Z + 20) return;
        const s = cam.scale(z);
        const lat = dir * (CURB - 45 + r2 * 30);
        const bx = cam.sx(lat, z);
        const by = cam.sy(0, z);
        this.billboard(g, kind, bx, by, s, z, dir, r2);
        break;
      }
    }
  }

  private billboard(g: Phaser.GameObjects.Graphics, kind: PropKind, x: number, y: number, s: number, z: number, dir: number, r: number): void {
    const st = this.st;
    const trunk = this.fogged(st.trunk, z);
    const leaf = this.fogged(st.foliage, z);
    switch (kind) {
      case 'tree': {
        const h = (150 + r * 70) * s;
        g.fillStyle(trunk, 1);
        g.fillRect(x - 7 * s, y - h * 0.55, 14 * s, h * 0.55);
        g.fillStyle(mix(leaf, 0x000000, 0.2), 1);
        g.fillCircle(x - 26 * s, y - h * 0.62, 38 * s);
        g.fillCircle(x + 26 * s, y - h * 0.66, 36 * s);
        g.fillStyle(leaf, 1);
        g.fillCircle(x, y - h * 0.82, 46 * s);
        g.fillStyle(mix(leaf, 0xffffff, 0.2), 1);
        g.fillCircle(x - 12 * s, y - h * 0.9, 18 * s);
        break;
      }
      case 'deadTree': {
        const h = (160 + r * 80) * s;
        g.lineStyle(Math.max(1, 9 * s), trunk, 1);
        g.lineBetween(x, y, x, y - h);
        g.lineStyle(Math.max(1, 5 * s), trunk, 1);
        g.lineBetween(x, y - h * 0.6, x - 40 * s, y - h * 0.85);
        g.lineBetween(x, y - h * 0.75, x + 34 * s, y - h * 1.0);
        g.lineBetween(x, y - h * 0.45, x + 30 * s, y - h * 0.6);
        g.fillStyle(st.windowLit, 0.8);
        g.fillCircle(x - 40 * s, y - h * 0.85, 4 * s);
        g.fillCircle(x + 34 * s, y - h, 4 * s);
        break;
      }
      case 'lamp': {
        const h = 190 * s;
        g.fillStyle(this.fogged(0x2f3b57, z), 1);
        g.fillRect(x - 4 * s, y - h, 8 * s, h);
        g.fillRect(Math.min(x, x - dir * 34 * s), y - h, 34 * s, 6 * s);
        g.fillStyle(st.windowLit, 0.35);
        g.fillCircle(x - dir * 34 * s, y - h + 8 * s, 22 * s);
        g.fillStyle(0xfff6d0, 1);
        g.fillCircle(x - dir * 34 * s, y - h + 8 * s, 8 * s);
        break;
      }
      case 'pillar': {
        const h = (180 + r * 140) * s;
        const c = this.fogged(st.buildings[0], z);
        g.fillStyle(mix(c, 0x000000, 0.2), 1);
        g.fillRect(x - 26 * s, y - h, 52 * s, h);
        g.fillStyle(c, 1);
        g.fillRect(x - 22 * s, y - h, 30 * s, h);
        g.fillStyle(mix(c, 0xffffff, 0.15), 1);
        g.fillRect(x - 34 * s, y - h - 14 * s, 68 * s, 16 * s);
        g.fillRect(x - 34 * s, y - 14 * s, 68 * s, 14 * s);
        if (st.jagged) {
          g.fillStyle(st.windowLit, 0.6);
          g.fillRect(x - 3 * s, y - h * 0.8, 6 * s, h * 0.5);
        }
        break;
      }
      case 'kelp': {
        const h = (160 + r * 120) * s;
        g.lineStyle(Math.max(1, 8 * s), leaf, 0.9);
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 1; k <= 8; k++) g.lineTo(x + Math.sin(k * 0.9 + r * 6) * 14 * s, y - (h * k) / 8);
        g.strokePath();
        g.fillStyle(st.windowLit, 0.5);
        g.fillCircle(x + 10 * s, y - h * 0.7, 5 * s);
        break;
      }
      case 'shard': {
        const h = (120 + r * 160) * s;
        const c = this.fogged(st.buildings[1] ?? st.buildings[0], z);
        g.fillStyle(c, 1);
        g.fillTriangle(x - 40 * s, y - h * 0.7, x + 46 * s, y - h, x + 10 * s, y - h * 0.25);
        g.lineStyle(Math.max(1, 3 * s), st.windowLit, 0.8);
        g.lineBetween(x - 40 * s, y - h * 0.7, x + 46 * s, y - h);
        break;
      }
      default:
        break;
    }
  }
}
