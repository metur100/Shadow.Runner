import type Phaser from 'phaser';

/** Half-width of the running surface and the distance from the centre to the building fronts (world units). */
export const ROAD_HALF = 150;
export const CURB = 235;

/** Camera distance behind the runner (world units). */
const BACK = 320;
/** Nearest drawable depth. */
export const NEAR_Z = 60;
/** Where the runner stands on screen, as a fraction of the lane height. */
const HORIZON = 0.37;
const FEET = 0.84;
/** Runner-plane scale (pixels per world unit) per pixel of lane height. */
const SCALE_PER_PX = 0.0021;

/**
 * Chase camera for one lane: the runner is seen from behind, in the middle of a road that runs to a
 * vanishing point on the horizon. The simulation stays one-dimensional – world x becomes depth and
 * height stays height – so every obstacle keeps exactly the timing it has in the simulation.
 */
export class LaneCamera {
  readonly cx: number;
  readonly horizon: number;
  /** Scale at the runner's depth. */
  readonly s0: number;
  readonly f: number;
  readonly eye: number;
  scroll = 0;
  /** Camera height offset that follows the runner onto platforms. */
  lift = 0;
  private readonly pts: Phaser.Types.Math.Vector2Like[] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];

  constructor(width: number, height: number) {
    this.cx = width / 2;
    this.horizon = height * HORIZON;
    this.s0 = height * SCALE_PER_PX;
    this.f = this.s0 * BACK;
    this.eye = ((FEET - HORIZON) * height) / this.s0;
  }

  /** Camera depth of a world x. */
  z(x: number): number {
    return x - this.scroll + BACK;
  }

  scale(z: number): number {
    return this.f / z;
  }

  sx(lat: number, z: number): number {
    return this.cx + (lat * this.f) / z;
  }

  sy(h: number, z: number): number {
    return this.horizon + ((this.eye + this.lift - h) * this.f) / z;
  }

  /** Screen y of a height at the runner's depth. */
  runnerY(h: number): number {
    return this.sy(h, BACK);
  }

  /** Fill a quad given in world space: (lat, z, h) per corner. */
  quad(g: Phaser.GameObjects.Graphics, l0: number, z0: number, h0: number, l1: number, z1: number, h1: number, l2: number, z2: number, h2: number, l3: number, z3: number, h3: number): void {
    const p = this.pts;
    p[0].x = this.sx(l0, z0);
    p[0].y = this.sy(h0, z0);
    p[1].x = this.sx(l1, z1);
    p[1].y = this.sy(h1, z1);
    p[2].x = this.sx(l2, z2);
    p[2].y = this.sy(h2, z2);
    p[3].x = this.sx(l3, z3);
    p[3].y = this.sy(h3, z3);
    g.fillPoints(p, true);
  }

  /** A rectangle on the ground (or at height h) from lateral l0..l1 and depth z0..z1. */
  flat(g: Phaser.GameObjects.Graphics, l0: number, l1: number, z0: number, z1: number, h = 0): void {
    this.quad(g, l0, z0, h, l1, z0, h, l1, z1, h, l0, z1, h);
  }

  /** A face standing across the road at depth z. */
  front(g: Phaser.GameObjects.Graphics, l0: number, l1: number, z: number, h0: number, h1: number): void {
    const s = this.f / z;
    const x0 = this.cx + l0 * s;
    const x1 = this.cx + l1 * s;
    const y0 = this.sy(h1, z);
    const y1 = this.sy(h0, z);
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  /** A face along the road at lateral l (a building front), from depth z0 to z1. */
  side(g: Phaser.GameObjects.Graphics, l: number, z0: number, z1: number, h0: number, h1: number): void {
    this.quad(g, l, z0, h0, l, z0, h1, l, z1, h1, l, z1, h0);
  }
}
