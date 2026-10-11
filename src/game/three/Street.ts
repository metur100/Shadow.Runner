import * as THREE from 'three';

import type { Side } from '../levels/LevelDefinition';
import { LANES } from '../utils/Constants';
import type { EnvironmentDef, PropRule } from './Environment';
import { lit, shadowed, tinted } from './Materials';
import { instance, remapMaterials, type ModelName } from './Models';
import { awningTexture, pavingTexture, roadTextures } from './Textures';

/** Metres per simulation unit. */
export const S = 1 / 42;
/** Width of one of the three lanes (metres); lane centres are at −LANE_M, 0 and LANE_M. */
export const LANE_M = LANES.width * S;
/** Half-width of the carriageway and the x of the building fronts (metres). */
export const ROAD_HALF = 3.2;
export const CURB_W = 0.3;
export const WALK_TOP = 0.14;
export const FRONT = 5.6;
const OUTER = 40;

const CHUNK = 40;
const AHEAD = 170;
const BEHIND = 18;
const BUILDING_SCALE = 2.1;

export function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface Placed {
  obj: THREE.Object3D;
  end: number;
  pool: string;
}

/**
 * The street of one world: road and sidewalk chunks (with real gaps where the level has pits), the
 * buildings lining both sides, roadside props, bunting and awnings. Everything is placed from its slot
 * number, so the street is identical on every attempt, and recycled once it is behind the camera.
 * Distances `d` are metres along the run (d = sim x × S); the run goes towards −z.
 */
export class Street {
  readonly group = new THREE.Group();
  private readonly roadMat: THREE.MeshStandardMaterial;
  private readonly walkMat: THREE.MeshStandardMaterial;
  private readonly curbMat: THREE.MeshStandardMaterial;
  private readonly edgeMat: THREE.MeshBasicMaterial | null;
  private readonly chunks = new Map<number, THREE.Object3D[]>();
  private readonly placed: Placed[] = [];
  private readonly pools = new Map<string, THREE.Object3D[]>();
  private readonly nextBuilding: [number, number] = [-BEHIND, -BEHIND];
  private readonly buildingIndex: [number, number] = [0, 0];
  private nextProp = -BEHIND;
  private propIndex = 0;
  private nextBunting = 30;
  private readonly propWeight: number;
  private readonly buntingGeo: THREE.BufferGeometry | null;
  private readonly buntingMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  private readonly awningMats: THREE.MeshStandardMaterial[] = [];

  constructor(
    private readonly env: EnvironmentDef,
    private readonly side: Side,
    /** Pit intervals in metres [start, end). */
    private readonly gaps: [number, number][],
    private readonly seed: number,
    private readonly detail: boolean,
  ) {
    const road = roadTextures(env.road);
    road.map.repeat.set(1, 1);
    this.roadMat = new THREE.MeshStandardMaterial({
      map: road.map,
      roughness: 0.92,
      metalness: 0,
      emissiveMap: road.emissive,
      emissive: road.emissive ? new THREE.Color(0xffffff) : new THREE.Color(0x000000),
      emissiveIntensity: road.emissive ? 0.9 : 0,
    });
    this.walkMat = new THREE.MeshStandardMaterial({ map: pavingTexture(env.walk.color, env.walk.kind), roughness: 0.95 });
    this.curbMat = new THREE.MeshStandardMaterial({ color: env.walk.curb, roughness: 0.8 });
    this.edgeMat = env.neonEdge !== null ? new THREE.MeshBasicMaterial({ color: env.neonEdge, toneMapped: false }) : null;
    this.propWeight = env.props.reduce((a, p) => a + p.weight, 0);
    this.buntingGeo = env.bunting ? buntingGeometry(seed) : null;
    if (env.awnings) {
      const pairs: [number, number][] = [
        [0xd94c4c, 0xfff4e6],
        [0x2e9e8f, 0xfff4e6],
        [0xf2a33a, 0xffffff],
        [0x3a6fd9, 0xffffff],
        [0x7a3ab8, 0xffe08a],
      ];
      for (const [a, b] of pairs) this.awningMats.push(new THREE.MeshStandardMaterial({ map: awningTexture(a, b), roughness: 0.9, side: THREE.DoubleSide }));
    }
  }

  /** Builds / recycles everything around distance `d` (metres). */
  update(d: number): void {
    // Road chunks.
    const c0 = Math.floor((d - BEHIND) / CHUNK);
    const c1 = Math.floor((d + AHEAD) / CHUNK);
    for (const [i, objs] of this.chunks) {
      if (i < c0 || i > c1) {
        for (const o of objs) {
          this.group.remove(o);
          (o as THREE.Mesh).geometry?.dispose();
        }
        this.chunks.delete(i);
      }
    }
    for (let i = c0; i <= c1; i++) if (!this.chunks.has(i)) this.chunks.set(i, this.buildChunk(i));

    // Buildings on both sides, props and bunting.
    if (this.env.buildings.length) {
      for (const s of [0, 1] as const) {
        while (this.nextBuilding[s] < d + AHEAD) this.placeBuilding(s);
      }
    }
    while (this.nextProp < d + AHEAD) this.placeProp();
    if (this.buntingGeo) {
      while (this.nextBunting < d + AHEAD) {
        const at = this.nextBunting;
        this.nextBunting += 48;
        if (this.inGap(at - 2, at + 2)) continue;
        const m = new THREE.Mesh(this.buntingGeo, this.buntingMat);
        m.position.set(0, 0, -at);
        m.castShadow = false;
        this.add(m, at + 1, '');
      }
    }
    // Recycle what is behind the camera.
    for (let i = this.placed.length - 1; i >= 0; i--) {
      const p = this.placed[i];
      if (p.end < d - BEHIND) {
        this.group.remove(p.obj);
        if (p.pool) {
          let pool = this.pools.get(p.pool);
          if (!pool) this.pools.set(p.pool, (pool = []));
          pool.push(p.obj);
        }
        this.placed.splice(i, 1);
      }
    }
  }

  /** After a respawn the run jumps back: rebuild from scratch. */
  reset(): void {
    for (const p of this.placed) this.group.remove(p.obj);
    this.placed.length = 0;
    for (const objs of this.chunks.values()) for (const o of objs) this.group.remove(o);
    this.chunks.clear();
    this.nextBuilding[0] = this.nextBuilding[1] = -BEHIND;
    this.buildingIndex[0] = this.buildingIndex[1] = 0;
    this.nextProp = -BEHIND;
    this.propIndex = 0;
    this.nextBunting = 30;
  }

  private add(obj: THREE.Object3D, end: number, pool: string): void {
    this.group.add(obj);
    this.placed.push({ obj, end, pool });
  }

  private inGap(a: number, b: number): boolean {
    return this.gaps.some(([g0, g1]) => b > g0 - 0.5 && a < g1 + 0.5);
  }

  /** Pool-aware model instance with this world's materials. */
  private model(name: ModelName, opts: { height?: number; scale?: number }): THREE.Object3D {
    const poolKey = `${name}|${opts.height ?? ''}|${opts.scale ?? ''}`;
    const pooled = this.pools.get(poolKey)?.pop();
    if (pooled) return pooled;
    const g = instance(name, opts);
    const glow = this.env.windowGlow;
    if (this.side === 'shadow' && glow !== null) remapMaterials(g, (m) => shadowed(m, glow, true));
    else if (this.env.windowGlow !== null) remapMaterials(g, (m) => (/DarkGrey|Light$/.test(m.name) ? lit(m, this.env.windowGlow ?? 0xffffff, 0.9) : tinted(m, this.env.buildingTint)));
    else if (this.env.buildingTint !== 0xffffff && name.startsWith('house')) remapMaterials(g, (m) => tinted(m, this.env.buildingTint));
    else if (name.startsWith('street-light')) remapMaterials(g, (m) => (m.name === 'Light' ? lit(m, 0xfff1c8, 0.6) : m));
    g.userData.pool = poolKey;
    if (!this.detail) g.traverse((o) => ((o as THREE.Mesh).castShadow = false));
    return g;
  }

  private placeBuilding(s: 0 | 1): void {
    const i = this.buildingIndex[s]++;
    const k = this.seed * 7919 + i * 2 + s;
    const list = this.env.buildings;
    const name = list[Math.floor(hash(k) * list.length) % list.length];
    const g = this.model(name, { scale: BUILDING_SCALE });
    const size = g.userData.size as THREE.Vector3;
    // The model's front faces +z: turn it towards the road. Width along the street = its x size.
    const dir = s === 0 ? -1 : 1;
    g.rotation.set(0, dir < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    const width = size.x;
    const gap = hash(k + 5) < 0.2 ? 1.5 + hash(k + 6) * 3 : 0.15;
    const start = this.nextBuilding[s];
    const mid = start + width / 2;
    g.position.set(dir * (FRONT + size.z / 2), 0, -mid);
    if (this.side === 'shadow') {
      // A broken, leaning mirror of the city.
      g.rotation.z = (hash(k + 9) - 0.5) * 0.06;
      g.position.y = -hash(k + 10) * 0.6;
    }
    this.nextBuilding[s] = start + width + gap;
    if (this.inGap(start, start + width)) {
      const key = g.userData.pool as string;
      const pool = this.pools.get(key);
      if (pool) pool.push(g);
      else this.pools.set(key, [g]);
      return;
    }
    // Awnings over the ground floor.
    if (this.awningMats.length && hash(k + 11) < 0.55 && width > 5) {
      const mat = this.awningMats[Math.floor(hash(k + 12) * this.awningMats.length)];
      const aw = new THREE.Mesh(awningGeometry(Math.min(width * 0.7, 7)), mat);
      aw.position.set(dir * (FRONT - 0.05), 3.0, -mid);
      aw.rotation.y = dir < 0 ? Math.PI / 2 : -Math.PI / 2;
      aw.castShadow = this.detail;
      this.add(aw, start + width, '');
    }
    this.add(g, start + width, g.userData.pool as string);
  }

  private pickProp(r: number): PropRule {
    let acc = r * this.propWeight;
    for (const p of this.env.props) {
      acc -= p.weight;
      if (acc < 0) return p;
    }
    return this.env.props[0];
  }

  private placeProp(): void {
    const i = this.propIndex++;
    const k = this.seed * 104729 + i;
    const step = this.env.buildings.length ? 6.5 : 5;
    const at = this.nextProp + hash(k + 1) * 2;
    this.nextProp += step;
    if (this.inGap(at - 1.5, at + 1.5)) return;
    for (const dir of [-1, 1]) {
      if (hash(k + (dir > 0 ? 3 : 4)) < 0.25) continue;
      const rule = this.pickProp(hash(k + (dir > 0 ? 7 : 8)));
      const g = this.model(rule.model, { height: rule.height * (0.9 + hash(k + 13) * 0.2) });
      const lat = rule.lateral[0] + hash(k + 17) * (rule.lateral[1] - rule.lateral[0]);
      g.position.set(dir * lat, rule.lateral[0] > ROAD_HALF + CURB_W ? WALK_TOP : 0, -at);
      g.rotation.set(0, rule.faceRoad ? (dir < 0 ? Math.PI / 2 : -Math.PI / 2) : hash(k + 19) * Math.PI * 2, 0);
      this.add(g, at + 2, g.userData.pool as string);
    }
  }

  private buildChunk(i: number): THREE.Object3D[] {
    const a = i * CHUNK;
    const b = a + CHUNK;
    // Solid intervals of this chunk (pits removed).
    let parts: [number, number][] = [[a, b]];
    for (const [g0, g1] of this.gaps) {
      const next: [number, number][] = [];
      for (const [p0, p1] of parts) {
        if (g1 <= p0 || g0 >= p1) next.push([p0, p1]);
        else {
          if (g0 > p0) next.push([p0, g0]);
          if (g1 < p1) next.push([g1, p1]);
        }
      }
      parts = next;
    }
    const road = new GeometryBuilder();
    const walk = new GeometryBuilder();
    const curb = new GeometryBuilder();
    const edge = new GeometryBuilder();
    for (const [p0, p1] of parts) {
      road.quadXZ(-ROAD_HALF, ROAD_HALF, p0, p1, 0, (x) => (x + ROAD_HALF) / (2 * ROAD_HALF), (d) => d / 8.5);
      for (const dir of [-1, 1]) {
        const inner = ROAD_HALF + CURB_W;
        // Sidewalk top (to the building fronts and beyond, under the buildings).
        walk.quadXZ(dir < 0 ? -OUTER : inner, dir < 0 ? -inner : OUTER, p0, p1, WALK_TOP, (x) => x / 2.5, (d) => d / 2.5);
        // Curb: top strip and the face towards the road.
        curb.quadXZ(dir < 0 ? -inner : ROAD_HALF, dir < 0 ? -ROAD_HALF : inner, p0, p1, WALK_TOP, () => 0, () => 0);
        curb.quadSide(dir * ROAD_HALF, p0, p1, 0, WALK_TOP, dir);
        if (this.edgeMat) edge.quadXZ(dir * ROAD_HALF - 0.05, dir * ROAD_HALF + 0.05, p0, p1, 0.012, () => 0, () => 0);
      }
    }
    const objs: THREE.Object3D[] = [];
    const add = (b2: GeometryBuilder, m: THREE.Material, receive = true) => {
      if (!b2.count) return;
      const mesh = new THREE.Mesh(b2.build(), m);
      mesh.receiveShadow = receive;
      this.group.add(mesh);
      objs.push(mesh);
    };
    add(road, this.roadMat);
    add(walk, this.walkMat);
    add(curb, this.curbMat);
    if (this.edgeMat) add(edge, this.edgeMat, false);
    return objs;
  }

  dispose(): void {
    for (const objs of this.chunks.values()) for (const o of objs) (o as THREE.Mesh).geometry.dispose();
    this.roadMat.dispose();
    this.walkMat.dispose();
    this.curbMat.dispose();
    this.edgeMat?.dispose();
    this.buntingGeo?.dispose();
    this.buntingMat.dispose();
    for (const m of this.awningMats) m.dispose();
  }
}

/** Collects quads into one indexed geometry (positions, normals, uvs). */
class GeometryBuilder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly uv: number[] = [];
  private readonly idx: number[] = [];
  count = 0;

  /** Horizontal quad from x0..x1 and distance d0..d1 at height y (z = −d). */
  quadXZ(x0: number, x1: number, d0: number, d1: number, y: number, u: (x: number) => number, v: (d: number) => number): void {
    const base = this.pos.length / 3;
    this.pos.push(x0, y, -d0, x1, y, -d0, x1, y, -d1, x0, y, -d1);
    this.nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    this.uv.push(u(x0), v(d0), u(x1), v(d0), u(x1), v(d1), u(x0), v(d1));
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count++;
  }

  /** Vertical quad at x facing the road centre (normal −dir). */
  quadSide(x: number, d0: number, d1: number, y0: number, y1: number, dir: number): void {
    const base = this.pos.length / 3;
    this.pos.push(x, y0, -d0, x, y0, -d1, x, y1, -d1, x, y1, -d0);
    for (let i = 0; i < 4; i++) this.nrm.push(-dir, 0, 0);
    this.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    if (dir < 0) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    this.count++;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** A string of triangular flags sagging across the street. */
function buntingGeometry(seed: number): THREE.BufferGeometry {
  const colors = [0xe0565b, 0xffc83d, 0x2ec4b6, 0x3a6fd9, 0xff8a3d, 0x9a7bff];
  const pos: number[] = [];
  const col: number[] = [];
  const span = FRONT * 2 + 0.6;
  const n = 18;
  const y0 = 7.2;
  const sag = 1.1;
  const c = new THREE.Color();
  const yAt = (t: number) => y0 - sag * 4 * t * (1 - t);
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.15) / n;
    const t1 = (i + 0.85) / n;
    const tm = (i + 0.5) / n;
    const x0 = -span / 2 + t0 * span;
    const x1 = -span / 2 + t1 * span;
    const xm = -span / 2 + tm * span;
    pos.push(x0, yAt(t0), 0, x1, yAt(t1), 0, xm, yAt(tm) - 0.55, 0);
    c.set(colors[(i + seed) % colors.length]);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  // The string itself: thin dark quads.
  for (let i = 0; i < 24; i++) {
    const t0 = i / 24;
    const t1 = (i + 1) / 24;
    const x0 = -span / 2 + t0 * span;
    const x1 = -span / 2 + t1 * span;
    pos.push(x0, yAt(t0), 0, x1, yAt(t1), 0, x1, yAt(t1) - 0.04, 0, x0, yAt(t0), 0, x1, yAt(t1) - 0.04, 0, x0, yAt(t0) - 0.04, 0);
    for (let k = 0; k < 6; k++) col.push(0.15, 0.12, 0.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** A sloped shop awning (local: width along x, sticking out towards +z). */
function awningGeometry(width: number): THREE.BufferGeometry {
  const depth = 1.3;
  const drop = 0.55;
  const g = new THREE.BufferGeometry();
  const w = width / 2;
  // Sloped canopy plus the front valance.
  const pos = [-w, 0, 0, w, 0, 0, w, -drop, depth, -w, 0, 0, w, -drop, depth, -w, -drop, depth, -w, -drop, depth, w, -drop, depth, w, -drop - 0.3, depth, -w, -drop, depth, w, -drop - 0.3, depth, -w, -drop - 0.3, depth];
  const uv = [0, 0, w, 0, w, 1, 0, 0, w, 1, 0, 1, 0, 0.8, w, 0.8, w, 1, 0, 0.8, w, 1, 0, 1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
