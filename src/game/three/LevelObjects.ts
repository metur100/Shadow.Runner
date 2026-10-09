import * as THREE from 'three';

import { lightIntensity, lightState } from '../entities/LightZone';
import type { Obstacle, ObstacleState } from '../entities/Obstacle';
import { PORTAL_HEIGHT } from '../entities/Portal';
import type { Side } from '../levels/LevelDefinition';
import type { RunSession } from '../systems/RunSession';
import { glowMaterial, rimMaterial, shadowed } from './Materials';
import { instance, remapMaterials } from './Models';
import { FRONT, ROAD_HALF, S, WALK_TOP } from './Street';
import { breachTexture, brickTexture, chevronTexture, crossDecal, crystalFaceTexture, glowTexture, hazardTexture, pavingTexture, shaftTexture, swirlTexture } from './Textures';

const DANGER = 0xff3a4c;
/** Walls are drawn a little lower than their collision height (which only means "too high to jump"). */
const WALL_VIEW_H = 240;
const AHEAD = 7400;
const BEHIND = 320;

export interface WorldStyle {
  side: Side;
  /** Glow colour of this world (shadow worlds) or accent (reality). */
  glow: number;
  portalColors: [number, number, number];
  highContrast: boolean;
  reducedMotion: boolean;
  detail: boolean;
}

interface View {
  obj: THREE.Object3D;
  update(t: number, state: ObstacleState, dt: number): void;
  /** Materials owned by this view only (animated per instance). */
  own?: THREE.Material[];
}

/** A per-view copy of a shared material, registered for disposal. */
function own<T extends THREE.Material>(list: THREE.Material[], m: T): T {
  const c = m.clone() as T;
  list.push(c);
  return c;
}

const zOf = (x: number) => -x * S;

/** Box geometry whose UVs are in metres / `unit`, so tiling textures keep their scale on any size. */
function tiledBox(w: number, h: number, d: number, unit = 2): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / unit, (uv.getY(k) * dims[f][1]) / unit);
    }
  }
  return g;
}

/** Shared materials of one world. */
class Palette {
  private readonly cache = new Map<string, THREE.Material>();
  constructor(readonly style: WorldStyle) {}

  get<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.cache.get(key) as T | undefined;
    if (!m) {
      m = make();
      this.cache.set(key, m);
    }
    return m;
  }

  glowSprite(color: number, opacity = 0.8): THREE.SpriteMaterial {
    return this.get(`sprite-${color}-${opacity}`, () => new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}

function sprite(mat: THREE.SpriteMaterial, w: number, h = w): THREE.Sprite {
  const s = new THREE.Sprite(mat);
  s.scale.set(w, h, 1);
  return s;
}

/**
 * Builds and updates the 3D views of everything in a level for one world: obstacles, collectibles,
 * switches, portals and checkpoints. Views are created as they come within view distance and removed
 * once behind the camera; their state (open gates, lights on, collected coins…) is read from the
 * session every frame, so checkpoint restores need no special handling beyond `reset`.
 */
export class LevelObjects {
  readonly group = new THREE.Group();
  private readonly pal: Palette;
  private readonly obstacles: Obstacle[];
  private readonly views = new Map<string, View>();
  private readonly geo = new Map<string, THREE.BufferGeometry>();
  private cursor = 0;
  /** Current run distance (sim units), for effects that depend on the camera distance. */
  private scroll = 0;

  constructor(
    private readonly session: RunSession,
    private readonly style: WorldStyle,
  ) {
    this.pal = new Palette(style);
    this.obstacles = session.obstacles.filter((o) => o.side === style.side).sort((a, b) => a.minX - b.minX);
  }

  private geometry<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
    let g = this.geo.get(key) as T | undefined;
    if (!g) {
      g = make();
      this.geo.set(key, g);
    }
    return g;
  }

  /** Called after a respawn (the run jumped back). */
  reset(): void {
    for (const v of this.views.values()) {
      this.group.remove(v.obj);
      if (v.own) for (const m of v.own) m.dispose();
    }
    this.views.clear();
    this.cursor = 0;
  }

  update(scroll: number, t: number, dt: number): void {
    this.scroll = scroll;
    const s = this.session;
    const lo = scroll - BEHIND;
    const hi = scroll + AHEAD;
    while (this.cursor < this.obstacles.length && this.obstacles[this.cursor].minX < hi) {
      const o = this.obstacles[this.cursor++];
      if (o.maxX < lo && o.kind !== 'train') continue;
      const v = this.createObstacle(o);
      if (v) this.addView(`o${o.index}`, v);
    }
    for (const item of s.collectibles) {
      if (item.side !== this.style.side) continue;
      const key = `c${item.index}`;
      const inRange = item.x > lo && item.x < hi;
      const v = this.views.get(key);
      if (inRange && !v) this.addView(key, this.createCollectible(item.kind, item.x, item.y));
      else if (!inRange && v) this.removeView(key);
    }
    for (const sw of s.switches) {
      if (sw.side !== this.style.side) continue;
      const key = `s${sw.index}`;
      const inRange = sw.x > lo && sw.x < hi;
      const v = this.views.get(key);
      if (inRange && !v) this.addView(key, this.createSwitch(sw.kind, sw.x, sw.index));
      else if (!inRange && v) this.removeView(key);
    }
    for (const p of s.portals) {
      if (p.side !== this.style.side && !p.isExit) continue;
      const key = `p${p.index}`;
      const inRange = p.x > lo && p.x < hi;
      const v = this.views.get(key);
      if (inRange && !v) this.addView(key, this.createPortal(p.x, p.isExit, p.side, p.index));
      else if (!inRange && v) this.removeView(key);
    }
    for (const cp of s.checkpoints) {
      const key = `k${cp.index}`;
      const inRange = cp.x > lo && cp.x < hi;
      const v = this.views.get(key);
      if (inRange && !v) this.addView(key, this.createCheckpoint(cp.x, cp.index));
      else if (!inRange && v) this.removeView(key);
    }

    for (const [key, v] of this.views) {
      if (key[0] === 'o') {
        const o = s.obstacles[Number(key.slice(1))];
        const st = s.obstacleStates[o.index];
        const gone = o.kind === 'train' ? o.trainX(t, st) + o.w < lo && o.maxX < lo : o.maxX < lo;
        if (gone) {
          this.removeView(key);
          continue;
        }
        v.update(t, st, dt);
      } else {
        v.update(t, s.obstacleStates[0] ?? ({} as ObstacleState), dt);
      }
    }
  }

  private addView(key: string, v: View | null): void {
    if (!v) return;
    this.views.set(key, v);
    this.group.add(v.obj);
  }

  private removeView(key: string): void {
    const v = this.views.get(key);
    if (!v) return;
    this.group.remove(v.obj);
    this.views.delete(key);
    if (v.own) for (const m of v.own) m.dispose();
  }

  // ───────────────────────────── obstacles ─────────────────────────────

  private createObstacle(o: Obstacle): View | null {
    const pal = this.pal;
    const shadowSide = o.side === 'shadow';
    const glow = this.style.glow;
    const root = new THREE.Group();
    const z0 = zOf(o.x);
    const depth = Math.max(0.35, o.w * S);
    let update: View['update'] = () => undefined;
    const mine: THREE.Material[] = [];

    switch (o.kind) {
      case 'wall': {
        const st = o.def.style;
        const wh = Math.min(o.h, WALL_VIEW_H) * S;
        if (st === 'crate') {
          const n = Math.ceil((ROAD_HALF * 2) / 1.25);
          const rows = Math.max(1, Math.round(wh / 1.25));
          for (let r = 0; r < rows; r++) {
            for (let i = 0; i < n; i++) {
              const c = instance('crate', { height: 1.2 });
              c.position.set(-ROAD_HALF + 0.62 + i * 1.25, r * 1.2, z0 - depth / 2);
              c.rotation.y = ((i * 7 + r * 3) % 5) * 0.06;
              if (shadowSide) remapMaterials(c, (m) => shadowed(m, glow, false));
              root.add(c);
            }
          }
          break;
        }
        const stone = st === 'rock' || st === 'pillar' || st === 'ruin';
        const width = stone ? ROAD_HALF * 2 + 0.6 : FRONT * 2;
        const mat = pal.get(`wall-${shadowSide}-${stone}`, () => {
          const map = shadowSide ? brickTexture(0x2e2466, 0x140e30) : stone ? brickTexture(0xb8a07a, 0x6e5a42) : brickTexture(0xa84a34, 0xc9b8a0);
          return new THREE.MeshStandardMaterial({ map, roughness: 0.92, emissive: shadowSide ? new THREE.Color(glow) : new THREE.Color(0), emissiveIntensity: shadowSide ? 0.05 : 0 });
        });
        const wallMat = own(mine, mat);
        const box = new THREE.Mesh(tiledBox(width, wh, depth, 2.2), wallMat);
        box.position.set(0, wh / 2, z0 - depth / 2);
        box.castShadow = this.style.detail;
        box.receiveShadow = true;
        root.add(box);
        // Close to the camera the wall turns see-through, so the runner and what lies behind stay visible.
        update = () => {
          const ahead = (o.x - this.scroll) * S;
          const a = Math.min(1, Math.max(0.18, (ahead - 0.5) / 4));
          wallMat.transparent = a < 1;
          wallMat.opacity = a;
          wallMat.depthWrite = a >= 1;
        };
        // Coping stones along the top.
        const cap = new THREE.Mesh(this.geometry(`cap-${width}`, () => new THREE.BoxGeometry(width + 0.3, 0.25, depth + 0.3)), pal.get(`cap-${shadowSide}`, () => new THREE.MeshStandardMaterial({ color: shadowSide ? 0x3a2d78 : 0xd8cbb4, roughness: 0.8 })));
        cap.position.set(0, wh + 0.12, z0 - depth / 2);
        root.add(cap);
        if (!shadowSide && !stone) {
          const decal = new THREE.Mesh(this.geometry('decal', () => new THREE.PlaneGeometry(2.6, 2.6)), pal.get('cross', () => new THREE.MeshStandardMaterial({ map: crossDecal(), transparent: true, roughness: 0.9, depthWrite: false })));
          decal.position.set(0, Math.min(2.2, wh * 0.5), z0 + 0.02);
          root.add(decal);
        }
        if (this.style.highContrast) root.add(this.outline(width, wh, z0, 0xffd23d));
        break;
      }
      case 'shadowWall': {
        // The shadow's own wall: dark, cracked, glowing – it phases straight through.
        const wh = Math.min(o.h, WALL_VIEW_H) * S;
        const width = FRONT * 2;
        const mat = own(mine, pal.get('shadowwall', () => new THREE.MeshStandardMaterial({ map: brickTexture(0x2e2466, 0x120c2a), transparent: true, opacity: 0.82, roughness: 0.9, emissive: new THREE.Color(glow), emissiveIntensity: 0.12, depthWrite: false })));
        const box = new THREE.Mesh(tiledBox(width, wh, depth, 2.2), mat);
        box.position.set(0, wh / 2, z0 - depth / 2);
        root.add(box);
        const breach = new THREE.Mesh(this.geometry('breach', () => new THREE.PlaneGeometry(3.6, 3.6)), pal.get('breach', () => glowMaterial(0xffffff, 0.95, breachTexture(glow))));
        breach.position.set(0, 1.5, z0 + 0.03);
        root.add(breach);
        // A glow in front of the breach (sprites instead of lights: a changing light count would make
        // three.js recompile every material).
        const halo = sprite(own(mine, pal.glowSprite(glow, 0.6)), 6, 5);
        halo.position.set(0, 1.4, z0 + 0.6);
        root.add(halo);
        update = (t) => {
          const p = this.style.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 3 + o.x * 0.01);
          breach.scale.setScalar(0.95 + 0.05 * p);
          (halo.material as THREE.SpriteMaterial).opacity = 0.35 + 0.3 * p;
          const ahead = (o.x - this.scroll) * S;
          mat.opacity = 0.82 * Math.min(1, Math.max(0.15, (ahead - 0.5) / 4));
        };
        break;
      }
      case 'ceiling': {
        const bottom = o.y * S;
        const beamH = 0.9;
        const width = FRONT * 2;
        const beamMat = shadowSide
          ? pal.get('beam-shadow', () => new THREE.MeshStandardMaterial({ map: brickTexture(0x2e2466, 0x140e30), roughness: 0.9 }))
          : pal.get('beam-hazard', () => {
              const tex = hazardTexture().clone();
              tex.needsUpdate = true;
              tex.repeat.set(10, 1);
              return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.2 });
            });
        const beam = new THREE.Mesh(this.geometry(`beam-${depth}`, () => new THREE.BoxGeometry(width, beamH, Math.max(depth, 0.5))), beamMat);
        beam.position.set(0, bottom + beamH / 2, z0 - depth / 2);
        beam.castShadow = this.style.detail;
        root.add(beam);
        // Steel / stone frame to the ground on both sides.
        const postMat = pal.get(`post-${shadowSide}`, () => new THREE.MeshStandardMaterial({ color: shadowSide ? 0x2a2050 : 0x4a4f63, roughness: 0.5, metalness: 0.6 }));
        for (const dir of [-1, 1]) {
          const post = new THREE.Mesh(this.geometry(`post-${bottom}`, () => new THREE.BoxGeometry(0.35, bottom + beamH + 3, 0.35)), postMat);
          post.position.set(dir * (ROAD_HALF + 0.7), (bottom + beamH + 3) / 2, z0 - depth / 2);
          root.add(post);
        }
        const top = new THREE.Mesh(this.geometry('beam-top', () => new THREE.BoxGeometry(width, 0.3, 0.3)), postMat);
        top.position.set(0, bottom + beamH + 3, z0 - depth / 2);
        root.add(top);
        if (shadowSide) {
          // Crystal fangs hanging under the beam.
          for (let i = 0; i < 9; i++) {
            const c = instance('crystal-small', { height: 0.55 });
            remapMaterials(c, () => pal.get('fang', () => new THREE.MeshStandardMaterial({ color: 0x3a2a8a, emissive: new THREE.Color(glow), emissiveIntensity: 0.8, roughness: 0.3 })));
            c.rotation.z = Math.PI;
            c.position.set(-ROAD_HALF + 0.4 + i * ((ROAD_HALF * 2 - 0.8) / 8), bottom + 0.05, z0 - depth / 2);
            root.add(c);
          }
        }
        if (this.style.highContrast) root.add(this.outline(width, beamH, z0, 0xffd23d, bottom));
        break;
      }
      case 'spikes': {
        const h = o.h * S;
        const rows = Math.max(1, Math.round(depth / 0.45));
        const cols = 13;
        const base = new THREE.Mesh(this.geometry(`spikebase-${depth}`, () => new THREE.BoxGeometry(ROAD_HALF * 2 + 0.4, 0.08, depth)), pal.get(`spikebase-${shadowSide}`, () => new THREE.MeshStandardMaterial({ color: shadowSide ? 0x1a1236 : 0x3a3d48, roughness: 0.6, metalness: 0.5 })));
        base.position.set(0, 0.04, z0 - depth / 2);
        root.add(base);
        const coneMat = shadowSide
          ? pal.get('spike-crystal', () => new THREE.MeshStandardMaterial({ color: 0x4a2fb0, emissive: new THREE.Color(glow), emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1 }))
          : pal.get('spike-metal', () => new THREE.MeshStandardMaterial({ color: 0xc8ceda, roughness: 0.25, metalness: 0.9 }));
        const cone = this.geometry(`cone-${h}`, () => new THREE.ConeGeometry(0.17, h, shadowSide ? 5 : 8));
        const mesh = new THREE.InstancedMesh(cone, coneMat, rows * cols);
        const m4 = new THREE.Matrix4();
        let k = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = -ROAD_HALF + 0.25 + c * ((ROAD_HALF * 2 - 0.5) / (cols - 1)) + (r % 2) * 0.12;
            const sc = 0.85 + ((c * 7 + r * 3) % 5) * 0.06;
            m4.makeScale(1, sc, 1).setPosition(x, (h * sc) / 2 + 0.06, z0 - (r + 0.5) * (depth / rows));
            mesh.setMatrixAt(k++, m4);
          }
        }
        mesh.castShadow = this.style.detail;
        root.add(mesh);
        if (shadowSide && !this.style.reducedMotion) update = (t) => ((coneMat as THREE.MeshStandardMaterial).emissiveIntensity = 0.7 + 0.3 * Math.sin(t * 5));
        if (this.style.highContrast) {
          const line = new THREE.Mesh(this.geometry('hc-line', () => new THREE.BoxGeometry(ROAD_HALF * 2, 0.06, 0.06)), pal.get('hc-danger', () => new THREE.MeshBasicMaterial({ color: DANGER })));
          line.position.set(0, h + 0.1, z0);
          root.add(line);
        }
        break;
      }
      case 'pit': {
        const width = 80;
        const water = o.def.style === 'water';
        // The void: an open box below the street.
        const voidMat = pal.get(`void-${shadowSide}-${water}`, () => new THREE.MeshBasicMaterial({ color: water ? 0x0b3a4a : shadowSide ? 0x05030c : 0x15101e, side: THREE.BackSide }));
        const hole = new THREE.Mesh(this.geometry(`void-${depth}`, () => new THREE.BoxGeometry(width, 12, depth)), voidMat);
        hole.position.set(0, -6.01, z0 - depth / 2);
        root.add(hole);
        if (water) {
          const wm = pal.get('water', () => new THREE.MeshStandardMaterial({ color: 0x2aa6b8, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.88, emissive: new THREE.Color(0x0a4a5a), emissiveIntensity: 0.4 }));
          const surf = new THREE.Mesh(this.geometry(`water-${depth}`, () => new THREE.PlaneGeometry(width, depth, 24, 6)), wm);
          surf.rotation.x = -Math.PI / 2;
          surf.position.set(0, -0.55, z0 - depth / 2);
          root.add(surf);
          if (!this.style.reducedMotion) update = (t) => (surf.position.y = -0.55 + Math.sin(t * 2) * 0.05);
        } else {
          // Glowing far rim so the gap reads from a distance.
          const rim = new THREE.Mesh(this.geometry('rim', () => new THREE.BoxGeometry(width, 0.05, 0.08)), pal.get('rim', () => new THREE.MeshBasicMaterial({ color: shadowSide ? glow : 0xffd23d, toneMapped: false })));
          rim.position.set(0, WALK_TOP * 0.5, z0 - depth);
          root.add(rim);
          const rim2 = rim.clone();
          rim2.position.z = z0;
          root.add(rim2);
          if (shadowSide) {
            const mist = sprite(pal.glowSprite(glow, 0.35), width * 0.4, 5);
            mist.position.set(0, -3, z0 - depth / 2);
            root.add(mist);
          }
        }
        break;
      }
      case 'platform': {
        const st = o.def.style;
        const holder = new THREE.Group();
        root.add(holder);
        const thick = st === 'bridge' || st === 'shadowBridge' || st === 'brokenBridge' ? 0.22 : 0.5;
        let mat: THREE.Material;
        if (st === 'phase' || st === 'shadowBridge') {
          mat = pal.get(`phase-${st}`, () => new THREE.MeshStandardMaterial({ color: 0x3a2a8a, emissive: new THREE.Color(glow), emissiveIntensity: 0.9, transparent: true, opacity: 0.75, roughness: 0.3 }));
        } else if (st === 'bridge' || st === 'brokenBridge') {
          mat = pal.get('wood', () => new THREE.MeshStandardMaterial({ map: pavingTexture(0x8a5a32, 'slab'), color: 0xc98b4f, roughness: 0.85 }));
        } else if (st === 'stone') {
          mat = pal.get('stone-slab', () => new THREE.MeshStandardMaterial({ map: pavingTexture(0xb98a55, 'slab'), roughness: 0.9 }));
        } else {
          mat = pal.get(`slab-${shadowSide}`, () => new THREE.MeshStandardMaterial({ map: pavingTexture(shadowSide ? 0x2a2058 : 0x8e8a9a, shadowSide ? 'dark' : 'slab'), roughness: 0.8, emissive: new THREE.Color(shadowSide ? glow : 0), emissiveIntensity: shadowSide ? 0.08 : 0 }));
        }
        if (o.def.cycle) mat = own(mine, mat);
        const slab = new THREE.Mesh(tiledBox(ROAD_HALF * 2, thick, depth, 2.5), mat);
        slab.position.set(0, -thick / 2, -depth / 2);
        slab.castShadow = this.style.detail;
        slab.receiveShadow = true;
        holder.add(slab);
        // Glowing / painted edge on the front.
        const edgeMat = pal.get(`slab-edge-${shadowSide}`, () => new THREE.MeshBasicMaterial({ color: shadowSide ? glow : 0xffd23d, toneMapped: false }));
        const edge = new THREE.Mesh(this.geometry('slab-edge', () => new THREE.BoxGeometry(ROAD_HALF * 2, 0.06, 0.06)), o.def.cycle ? own(mine, edgeMat) : edgeMat);
        edge.position.set(0, 0.01, 0.01);
        holder.add(edge);
        if (st === 'elevator') {
          for (const x of [-ROAD_HALF + 0.3, ROAD_HALF - 0.3]) {
            const cable = new THREE.Mesh(this.geometry('cable', () => new THREE.CylinderGeometry(0.03, 0.03, 20, 6)), pal.get('cable', () => new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.8, roughness: 0.4 })));
            cable.position.set(x, 10, -depth / 2);
            holder.add(cable);
          }
        }
        if (st === 'bridge' || st === 'brokenBridge' || st === 'shadowBridge') {
          for (const x of [-ROAD_HALF, ROAD_HALF]) {
            const rail = new THREE.Mesh(this.geometry(`rail-${depth}`, () => new THREE.BoxGeometry(0.08, 0.08, depth)), pal.get(`rail-${st}`, () => new THREE.MeshStandardMaterial({ color: st === 'shadowBridge' ? glow : 0x5b3a1e, emissive: new THREE.Color(st === 'shadowBridge' ? glow : 0), roughness: 0.8 })));
            rail.position.set(x, 0.9, -depth / 2);
            holder.add(rail);
          }
        }
        update = (t, state) => {
          holder.visible = !state.hidden;
          if (state.hidden) return;
          holder.position.set(0, o.platformTop(t, state) * S, zOf(o.platformX(t, state)));
          if (o.def.cycle) {
            const on = o.isActive(t, state);
            const ending = o.cycleOn(t) && o.cyclePhase(t) > o.def.cycle.duty - 0.12;
            const a = on ? (ending && !this.style.reducedMotion ? 0.5 + 0.5 * Math.sin(t * 40) : 1) : 0.12;
            holder.traverse((c) => {
              const m = (c as THREE.Mesh).material as THREE.Material | undefined;
              if (m && 'opacity' in m) {
                m.transparent = true;
                m.opacity = a * (st === 'phase' ? 0.8 : 1);
              }
            });
          }
        };
        update(0, o.initialState(), 0);
        return { obj: root, update, own: mine };
      }
      case 'blade': {
        const st = o.def.style;
        const holder = new THREE.Group();
        root.add(holder);
        if (st === 'sign') {
          const w = ROAD_HALF * 2 + 0.6;
          const h = o.h * S;
          const sign = new THREE.Mesh(this.geometry(`sign-${h}`, () => new THREE.BoxGeometry(w, h, 0.3)), pal.get('sign', () => new THREE.MeshStandardMaterial({ color: 0x1f1a46, roughness: 0.5, emissive: new THREE.Color(0x2ee6ff), emissiveIntensity: 0.15 })));
          holder.add(sign);
          for (const [y, c, len] of [
            [h * 0.22, 0xff3db8, 0.85],
            [-h * 0.12, 0x2ee6ff, 0.55],
          ] as [number, number, number][]) {
            const strip = new THREE.Mesh(this.geometry(`strip-${len}`, () => new THREE.BoxGeometry(w * len, 0.12, 0.05)), pal.get(`strip-${c}`, () => new THREE.MeshBasicMaterial({ color: c, toneMapped: false })));
            strip.position.set(0, y, 0.17);
            holder.add(strip);
          }
          for (const x of [-w * 0.3, w * 0.3]) {
            const cable = new THREE.Mesh(this.geometry('cable', () => new THREE.CylinderGeometry(0.03, 0.03, 20, 6)), pal.get('cable', () => new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.8, roughness: 0.4 })));
            cable.position.set(x, 10 + h / 2, 0);
            holder.add(cable);
          }
          update = (t, state) => {
            const dx = o.def.motion?.axis === 'x' ? o.motionOffset(t, state) : 0;
            const dy = o.def.motion?.axis === 'y' ? o.motionOffset(t, state) : 0;
            holder.position.set(0, (o.y + dy) * S + h / 2, zOf(o.x + dx) - (o.w * S) / 2);
          };
        } else if (st === 'silhouette') {
          // A shadow person blocking the way.
          const fig = instance('runner', { height: o.h * S * 0.95 });
          const body = pal.get('silhouette', () => rimMaterial(0x05030a, glow));
          remapMaterials(fig, (m) => (/Eye/i.test(m.name) ? pal.get('red-eye', () => new THREE.MeshBasicMaterial({ color: DANGER, toneMapped: false })) : body));
          holder.add(fig);
          update = (t, state) => {
            const dx = o.def.motion?.axis === 'x' ? o.motionOffset(t, state) : 0;
            const dy = o.def.motion?.axis === 'y' ? o.motionOffset(t, state) : 0;
            holder.position.set(0, (o.y + dy) * S, zOf(o.x + dx) - (o.w * S) / 2);
          };
        } else {
          const gear = st === 'gear';
          const r = (o.w / 2) * S;
          const geo = this.geometry(`saw-${gear}-${r}`, () => sawGeometry(r, gear));
          const mat = gear
            ? pal.get('brass', () => new THREE.MeshStandardMaterial({ color: 0xc98b4f, metalness: 0.85, roughness: 0.35 }))
            : st === 'thorn'
              ? pal.get('thorn', () => new THREE.MeshStandardMaterial({ color: 0x3a2a6a, emissive: new THREE.Color(glow), emissiveIntensity: 0.5, roughness: 0.4 }))
              : pal.get('steel', () => new THREE.MeshStandardMaterial({ color: 0xd8dee8, metalness: 0.95, roughness: 0.22 }));
          const blade = new THREE.Mesh(geo, mat);
          blade.castShadow = this.style.detail;
          holder.add(blade);
          const hub = new THREE.Mesh(this.geometry('hub', () => new THREE.CylinderGeometry(0.18, 0.18, 0.2, 16).rotateX(Math.PI / 2)), pal.get('hub', () => new THREE.MeshStandardMaterial({ color: 0x2a2a35, metalness: 0.7, roughness: 0.4 })));
          holder.add(hub);
          const arm = new THREE.Mesh(this.geometry('arm', () => new THREE.CylinderGeometry(0.06, 0.06, 20, 6)), pal.get('cable', () => new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.8, roughness: 0.4 })));
          arm.position.y = 10;
          holder.add(arm);
          const spark = sprite(pal.glowSprite(gear ? 0xffd27a : 0xffffff, 0.35), r * 3);
          holder.add(spark);
          update = (t, state) => {
            const dx = o.def.motion?.axis === 'x' ? o.motionOffset(t, state) : 0;
            const dy = o.def.motion?.axis === 'y' ? o.motionOffset(t, state) : 0;
            holder.position.set(0, (o.y + dy) * S, zOf(o.x + o.w / 2 + dx));
            blade.rotation.z = this.style.reducedMotion ? 0 : -t * (gear ? 2.5 : 12);
          };
        }
        break;
      }
      case 'laser': {
        const posts: THREE.Mesh[] = [];
        const postMat = pal.get('laser-post', () => new THREE.MeshStandardMaterial({ color: 0x2a2350, metalness: 0.7, roughness: 0.35 }));
        for (const dir of [-1, 1]) {
          const post = new THREE.Mesh(this.geometry('laser-post', () => new THREE.BoxGeometry(0.3, 9.5, 0.3)), postMat);
          post.position.set(dir * (ROAD_HALF + 0.35), 4.75, z0 - depth / 2);
          root.add(post);
          posts.push(post);
        }
        const beamMat = own(mine, pal.get('laser-beam', () => new THREE.MeshBasicMaterial({ color: DANGER, toneMapped: false, transparent: true })));
        const haloMat = pal.get('laser-halo', () => glowMaterial(DANGER, 0.5, glowTexture()));
        const beams = new THREE.Group();
        const ghosts = new THREE.Group();
        const eyeMat = own(mine, pal.glowSprite(DANGER, 0.9));
        for (let h = 30; h <= 400; h += 55) {
          const y = h * S;
          const beam = new THREE.Mesh(this.geometry('laser-beam', () => new THREE.BoxGeometry(ROAD_HALF * 2 + 0.7, 0.05, 0.05)), beamMat);
          beam.position.set(0, y, z0 - depth / 2);
          const halo = new THREE.Mesh(this.geometry('laser-halo', () => new THREE.PlaneGeometry(ROAD_HALF * 2 + 0.7, 0.5)), haloMat);
          halo.position.set(0, y, z0 - depth / 2 + 0.03);
          beams.add(beam, halo);
          for (const dir of [-1, 1]) {
            const eye = sprite(eyeMat, 0.4);
            eye.position.set(dir * (ROAD_HALF + 0.2), y, z0 - depth / 2 + 0.2);
            ghosts.add(eye);
          }
        }
        root.add(beams, ghosts);
        update = (t, state) => {
          const on = o.isActive(t, state);
          const warn = !on && !state.off && o.timeUntilOn(t) < 0.35;
          beams.visible = on;
          if (on && !this.style.reducedMotion) beamMat.opacity = 0.85 + 0.15 * Math.sin(t * 50);
          ghosts.visible = on || (warn ? Math.sin(t * 40) > 0 : true);
          eyeMat.opacity = on ? 0.9 : 0.3;
        };
        break;
      }
      case 'lightZone': {
        // Golden light pouring down onto the street: thin light curtains at both ends, bright beams
        // inside, a glowing pool on the ground and rising sparkles. It fades out near the camera so the
        // runner inside it stays visible.
        const st = o.def.style;
        const holder = new THREE.Group();
        root.add(holder);
        const width = FRONT * 2;
        const hgt = 18;
        const curtainMat = own(mine, pal.get('curtain', () => glowMaterial(0xffc861, 0.3, shaftTexture())));
        const beamMat = own(mine, pal.get('beam', () => glowMaterial(0xffe6a8, 0.55, shaftTexture())));
        for (const zz of [0, -depth]) {
          const c = new THREE.Mesh(this.geometry('curtain', () => new THREE.PlaneGeometry(width, hgt)), curtainMat);
          c.position.set(0, hgt / 2, zz);
          holder.add(c);
        }
        for (const x of [-width / 2, width / 2]) {
          const c = new THREE.Mesh(this.geometry(`curtain-side-${depth}`, () => new THREE.PlaneGeometry(depth, hgt)), curtainMat);
          c.rotation.y = Math.PI / 2;
          c.position.set(x, hgt / 2, -depth / 2);
          holder.add(c);
        }
        for (let i = 0; i < 7; i++) {
          const w = 0.35 + ((i * 37) % 5) * 0.12;
          const beam = new THREE.Mesh(this.geometry(`lbeam-${i}`, () => new THREE.PlaneGeometry(w, hgt)), beamMat);
          beam.position.set(-width / 2 + 0.8 + i * ((width - 1.6) / 6), hgt / 2, -depth * (0.15 + 0.12 * (i % 4)));
          holder.add(beam);
        }
        const pool = new THREE.Mesh(this.geometry(`pool-${depth}`, () => new THREE.PlaneGeometry(width * 1.05, depth * 1.4)), own(mine, pal.get('pool', () => glowMaterial(0xffb84a, 0.85, glowTexture()))));
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(0, 0.03, -depth / 2);
        holder.add(pool);
        // Sparkles drifting upwards.
        const n = this.style.detail ? 40 : 16;
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          pos[i * 3] = (((i * 73) % 100) / 100 - 0.5) * width;
          pos[i * 3 + 1] = ((i * 37) % 100) / 100 * 6;
          pos[i * 3 + 2] = -(((i * 53) % 100) / 100) * depth;
        }
        const sparkGeo = new THREE.BufferGeometry();
        sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const sparkMat = own(mine, pal.get('sparks', () => new THREE.PointsMaterial({ color: 0xffe9a8, size: 0.12, map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
        const sparks = new THREE.Points(sparkGeo, sparkMat);
        holder.add(sparks);
        // A sun mark above the street: light reads without colour too.
        const sun = sprite(own(mine, pal.glowSprite(0xffffff, 0.95)), 1.6);
        sun.position.set(0, 6.5, -depth / 2);
        holder.add(sun);
        if (st === 'lamp' || st === 'streetlight') {
          const post = instance('street-light-2', { height: 7 });
          post.position.set(ROAD_HALF + 0.7, 0, -depth / 2);
          post.rotation.y = -Math.PI / 2;
          holder.add(post);
        }
        update = (t, state, dt) => {
          const ls = lightState(o, t, state);
          const intensity = this.style.reducedMotion && ls === 'on' ? 0.9 : lightIntensity(o, t, state);
          const a = ls === 'off' ? 0.03 : intensity;
          const dx = o.def.motion?.axis === 'x' ? o.motionOffset(t, state) : 0;
          holder.position.set(0, 0, zOf(o.x + dx));
          // Fade the curtains as the camera reaches them.
          const ahead = (o.x + dx - this.scroll) * S;
          const near = Math.min(1, Math.max(0.25, (ahead + 3) / 9));
          curtainMat.opacity = 0.32 * a * near;
          beamMat.opacity = 0.5 * a * near;
          (pool.material as THREE.MeshBasicMaterial).opacity = 0.85 * a;
          sparkMat.opacity = a;
          (sun.material as THREE.SpriteMaterial).opacity = ls === 'off' ? 0.25 : 0.95;
          if (!this.style.reducedMotion) {
            const p2 = sparkGeo.getAttribute('position') as THREE.BufferAttribute;
            const arr = p2.array as Float32Array;
            for (let i = 0; i < n; i++) {
              arr[i * 3 + 1] += dt * (0.6 + (i % 5) * 0.2);
              if (arr[i * 3 + 1] > 7) arr[i * 3 + 1] = 0;
            }
            p2.needsUpdate = true;
          }
        };
        break;
      }
      case 'falling': {
        const holder = new THREE.Group();
        const rock = o.def.style === 'rock';
        const size = Math.max(o.w, o.h) * S;
        const box = rock ? new THREE.Mesh(this.geometry(`boulder-${size}`, () => new THREE.DodecahedronGeometry(size / 2, 0)), pal.get('boulder', () => new THREE.MeshStandardMaterial({ color: shadowSide ? 0x2a2050 : 0x8a7a6a, roughness: 0.95, flatShading: true }))) : instance('crate', { height: size });
        if (rock) box.position.y = size / 2;
        if (shadowSide && !rock) remapMaterials(box, (m) => shadowed(m, glow, false));
        holder.add(box);
        root.add(holder);
        const ring = new THREE.Mesh(this.geometry('warn-ring', () => new THREE.RingGeometry(0.7, 1, 32)), own(mine, pal.get('warn-ring', () => new THREE.MeshBasicMaterial({ color: DANGER, transparent: true, toneMapped: false, depthWrite: false }))));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(0, 0.04, z0 - (o.w * S) / 2);
        root.add(ring);
        update = (t, state) => {
          holder.position.set(0, o.fallingBottom(t, state) * S, z0 - (o.w * S) / 2);
          const fade = state.triggeredAt < 0 ? 1 : Math.max(0, 1 - (t - state.triggeredAt) * 2);
          ring.visible = fade > 0;
          ring.scale.setScalar(this.style.reducedMotion ? 1 : 0.9 + 0.1 * Math.sin(t * 10));
          (ring.material as THREE.MeshBasicMaterial).opacity = fade;
        };
        break;
      }
      case 'train': {
        const holder = new THREE.Group();
        const car = instance(shadowSide ? 'broken-car' : 'police-car', { height: 2.3 });
        car.rotation.y = 0;
        if (shadowSide) remapMaterials(car, (m) => shadowed(m, glow, true));
        holder.add(car);
        const size = car.userData.size as THREE.Vector3;
        for (const x of [-size.x * 0.32, size.x * 0.32]) {
          const head = sprite(pal.glowSprite(0xfff6d0, 1), 1.6);
          head.position.set(x, 0.85, size.z / 2 + 0.1);
          holder.add(head);
        }
        // Headlight beams on the road.
        const beam = new THREE.Mesh(this.geometry('headbeam', () => new THREE.PlaneGeometry(3.2, 9)), pal.get('headbeam', () => glowMaterial(0xfff6d0, 0.35, glowTexture())));
        beam.rotation.x = -Math.PI / 2;
        beam.position.set(0, 0.04, size.z / 2 + 4.5);
        holder.add(beam);
        root.add(holder);
        update = (t, state) => {
          holder.position.set(0, 0, zOf(o.trainX(t, state)) - size.z / 2);
        };
        break;
      }
      case 'pendulum': {
        const pivotX = o.x + o.w / 2;
        const beam = new THREE.Mesh(this.geometry('pend-beam', () => new THREE.BoxGeometry(FRONT * 2, 0.4, 0.4)), pal.get('pend-beam', () => new THREE.MeshStandardMaterial({ color: 0x3e2614, roughness: 0.7 })));
        beam.position.set(0, o.y * S, zOf(pivotX));
        root.add(beam);
        const chain = new THREE.Mesh(this.geometry('chain', () => new THREE.CylinderGeometry(0.05, 0.05, 1, 6).translate(0, -0.5, 0)), pal.get('chain', () => new THREE.MeshStandardMaterial({ color: 0x555566, metalness: 0.9, roughness: 0.3 })));
        chain.position.set(0, o.y * S, zOf(pivotX));
        root.add(chain);
        const ball = instance('spiky-ball', { height: 1.6 });
        if (shadowSide) remapMaterials(ball, (m) => shadowed(m, glow, false));
        root.add(ball);
        const len = o.h * S;
        chain.scale.y = len;
        update = (t) => {
          const bob = o.pendulumBob(t);
          ball.position.set(0, bob.y * S - 0.8, zOf(bob.x));
          chain.rotation.x = -bob.angle;
        };
        break;
      }
      case 'gate': {
        const door = o.def.style === 'door';
        const frameMat = pal.get('gate-frame', () => new THREE.MeshStandardMaterial({ color: shadowSide ? 0x2a2050 : 0x3a3f50, metalness: 0.6, roughness: 0.4 }));
        for (const dir of [-1, 1]) {
          const post = new THREE.Mesh(this.geometry('gate-post', () => new THREE.BoxGeometry(0.5, 10, 0.5)), frameMat);
          post.position.set(dir * (FRONT - 0.25), 5, z0 - depth / 2);
          root.add(post);
        }
        const top = new THREE.Mesh(this.geometry('gate-top', () => new THREE.BoxGeometry(FRONT * 2, 0.6, 0.6)), frameMat);
        top.position.set(0, 10, z0 - depth / 2);
        root.add(top);
        const bars = new THREE.Group();
        if (door) {
          const panel = new THREE.Mesh(tiledBox(FRONT * 2 - 0.5, 9.5, 0.3, 2.5), pal.get('door', () => new THREE.MeshStandardMaterial({ map: pavingTexture(0x8a5a32, 'slab'), color: 0xc98b4f, roughness: 0.85 })));
          panel.position.y = 4.75;
          bars.add(panel);
        } else {
          const barMat = shadowSide
            ? pal.get('bars-shadow', () => new THREE.MeshStandardMaterial({ color: 0x3a2a8a, emissive: new THREE.Color(glow), emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.4 }))
            : pal.get('bars', () => new THREE.MeshStandardMaterial({ color: 0x5b6b8c, metalness: 0.85, roughness: 0.3 }));
          const n = 26;
          const inst = new THREE.InstancedMesh(this.geometry('bar', () => new THREE.CylinderGeometry(0.06, 0.06, 9.5, 8)), barMat, n);
          const m4 = new THREE.Matrix4();
          for (let i = 0; i < n; i++) {
            m4.makeTranslation(-FRONT + 0.4 + (i * (FRONT * 2 - 0.8)) / (n - 1), 4.75, 0);
            inst.setMatrixAt(i, m4);
          }
          bars.add(inst);
          for (const y of [0.4, 3, 9]) {
            const rail = new THREE.Mesh(this.geometry('gate-rail', () => new THREE.BoxGeometry(FRONT * 2 - 0.5, 0.18, 0.18)), barMat);
            rail.position.y = y;
            bars.add(rail);
          }
          if (o.def.style === 'timed' || o.def.style === 'slide') {
            const tex = pal.get('gate-hazard', () => new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6 }));
            const h = new THREE.Mesh(this.geometry('gate-hz', () => new THREE.BoxGeometry(FRONT * 2 - 0.5, 0.35, 0.2)), tex);
            h.position.y = 0.6;
            bars.add(h);
          }
        }
        bars.position.z = z0 - depth / 2;
        root.add(bars);
        const lock = sprite(pal.get('lock', () => new THREE.SpriteMaterial({ map: lockTexture(), transparent: true, depthWrite: false })), 1.1);
        lock.position.set(0, 2.4, z0 + 0.3);
        root.add(lock);
        let shown = 0;
        // Own copies of the bar materials so this gate can fade near the camera on its own.
        const faded: THREE.Material[] = [];
        bars.traverse((c) => {
          const mesh = c as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.material = own(mine, mesh.material as THREE.Material);
          faded.push(mesh.material);
        });
        update = (t, state, dt) => {
          const closed = o.isActive(t, state);
          shown += ((closed ? 0 : 1) - shown) * (this.style.reducedMotion ? 1 : Math.min(1, dt * 6));
          bars.position.y = shown * 9;
          lock.visible = closed;
          const a = Math.min(1, Math.max(0.18, ((o.x - this.scroll) * S - 0.5) / 4));
          for (const m of faded) {
            m.transparent = a < 1;
            m.opacity = a;
            m.depthWrite = a >= 1;
          }
        };
        break;
      }
      case 'boost': {
        const mat = pal.get('chevron', () => glowMaterial(this.style.side === 'shadow' ? glow : 0x2ee6ff, 0.9, chevronTexture()));
        for (let k = 0.6; k < depth; k += 1.8) {
          const c = new THREE.Mesh(this.geometry('chev', () => new THREE.PlaneGeometry(1.6, 1.6)), mat);
          c.rotation.x = -Math.PI / 2;
          c.position.set(0, 0.03, z0 - k);
          root.add(c);
        }
        if (!this.style.reducedMotion) update = (t) => (mat.opacity = 0.5 + 0.45 * Math.abs(Math.sin(t * 6)));
        break;
      }
      default:
        return null;
    }
    return { obj: root, update, own: mine };
  }

  /** High-contrast mode: a bright frame around an obstacle's front. */
  private outline(w: number, h: number, z: number, color: number, y0 = 0): THREE.Object3D {
    const g = new THREE.Group();
    const mat = this.pal.get(`hc-${color}`, () => new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    const t = 0.12;
    for (const [x, y, ww, hh] of [
      [0, y0 + h, w, t],
      [0, y0, w, t],
      [-w / 2, y0 + h / 2, t, h],
      [w / 2, y0 + h / 2, t, h],
    ]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, t), mat);
      m.position.set(x, y, z + 0.05);
      g.add(m);
    }
    return g;
  }

  // ───────────────────────────── items ─────────────────────────────

  private createCollectible(kind: 'coin' | 'crystal' | 'key', x: number, y: number): View {
    const pal = this.pal;
    const root = new THREE.Group();
    const holder = new THREE.Group();
    root.add(holder);
    root.position.set(0, y * S, zOf(x));
    if (kind === 'coin') {
      const coin = instance('coin', { height: 0.72 });
      remapMaterials(coin, (m) =>
        pal.get(`coin-${m.name}`, () => new THREE.MeshStandardMaterial({ color: m.name === 'DarkYellow' ? 0xe0a020 : 0xffcf3a, metalness: 0.35, roughness: 0.3, emissive: new THREE.Color(m.name === 'DarkYellow' ? 0x8a5200 : 0xc98a00), emissiveIntensity: 0.55 })),
      );
      coin.position.y = -0.36;
      holder.add(coin);
      root.add(sprite(pal.glowSprite(0xffd36b, 0.35), 1.1));
    } else if (kind === 'crystal') {
      const face = pal.get('crystal-face', () => new THREE.MeshStandardMaterial({ map: crystalFaceTexture(), emissiveMap: crystalFaceTexture(), emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.9, roughness: 0.3 }));
      const rimM = pal.get('crystal-rim', () => new THREE.MeshStandardMaterial({ color: 0x4a2fc0, emissive: new THREE.Color(0x7b5cff), emissiveIntensity: 0.8, metalness: 0.4, roughness: 0.3 }));
      const disc = new THREE.Mesh(this.geometry('crystal-disc', () => new THREE.CylinderGeometry(0.3, 0.3, 0.08, 28).rotateX(Math.PI / 2)), [rimM, face, face]);
      holder.add(disc);
      root.add(sprite(pal.glowSprite(0x9a7bff, 0.7), 1.4));
    } else {
      const key = instance('gem', { height: 0.7 });
      remapMaterials(key, () => pal.get('key', () => new THREE.MeshStandardMaterial({ color: 0xffd36b, metalness: 0.9, roughness: 0.2, emissive: new THREE.Color(0x8a5a00), emissiveIntensity: 0.6 })));
      key.position.y = -0.35;
      holder.add(key);
      root.add(sprite(pal.glowSprite(0xffd36b, 0.8), 1.8));
    }
    const index = this.session.collectibles.findIndex((c) => c.x === x && c.y === y && c.kind === kind && c.side === this.style.side);
    return {
      obj: root,
      update: (t) => {
        root.visible = index < 0 || !this.session.collected[index];
        if (this.style.reducedMotion) return;
        holder.rotation.y = t * 3 + x * 0.01;
        holder.position.y = Math.sin(t * 4 + x * 0.02) * 0.08;
      },
    };
  }

  private createSwitch(kind: 'lever' | 'plate' | 'lamp', x: number, index: number): View {
    const pal = this.pal;
    const root = new THREE.Group();
    root.position.z = zOf(x);
    const accent = this.style.side === 'real' ? 0xff8a3d : this.style.glow;
    const on = () => this.session.switchesOn[index] === 1;
    const mine: THREE.Material[] = [];
    switch (kind) {
      case 'lever': {
        root.position.x = ROAD_HALF + 0.9;
        const base = new THREE.Mesh(this.geometry('lever-base', () => new THREE.BoxGeometry(0.7, 0.5, 0.5)), pal.get('lever-base', () => new THREE.MeshStandardMaterial({ color: 0x3a3355, metalness: 0.6, roughness: 0.4 })));
        base.position.y = 0.25 + WALK_TOP;
        root.add(base);
        const pivot = new THREE.Group();
        pivot.position.y = 0.5 + WALK_TOP;
        root.add(pivot);
        const stick = new THREE.Mesh(this.geometry('lever-stick', () => new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8).translate(0, 0.6, 0)), pal.get('lever-stick', () => new THREE.MeshStandardMaterial({ color: 0x22202e, metalness: 0.7, roughness: 0.3 })));
        pivot.add(stick);
        const knob = new THREE.Mesh(this.geometry('knob', () => new THREE.SphereGeometry(0.16, 16, 12)), own(mine, pal.get(`knob-${accent}`, () => new THREE.MeshStandardMaterial({ color: accent, emissive: new THREE.Color(accent), emissiveIntensity: 0.5 }))));
        knob.position.y = 1.2;
        pivot.add(knob);
        const halo = sprite(pal.glowSprite(accent, 0.6), 1.2);
        halo.position.y = 1.6;
        root.add(halo);
        return {
          obj: root,
          own: mine,
          update: () => {
            const o = on();
            pivot.rotation.x = o ? 0.7 : -0.7;
            (knob.material as THREE.MeshStandardMaterial).color.set(o ? 0x3bb273 : accent);
            halo.material = pal.glowSprite(o ? 0x3bb273 : accent, 0.6);
          },
        };
      }
      case 'plate': {
        const disc = new THREE.Mesh(this.geometry('plate', () => new THREE.CylinderGeometry(0.9, 1, 0.12, 40)), pal.get('plate', () => new THREE.MeshStandardMaterial({ color: 0x2a2a3a, metalness: 0.6, roughness: 0.3 })));
        disc.position.y = 0.06;
        root.add(disc);
        const ring = new THREE.Mesh(this.geometry('plate-ring', () => new THREE.RingGeometry(0.55, 0.85, 40)), own(mine, pal.get(`plate-ring-${accent}`, () => new THREE.MeshBasicMaterial({ color: accent, toneMapped: false, side: THREE.DoubleSide }))));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.13;
        root.add(ring);
        const glowDisc = new THREE.Mesh(this.geometry('plate-glow', () => new THREE.PlaneGeometry(3.4, 3.4)), own(mine, pal.get(`plate-glow-${accent}`, () => glowMaterial(accent, 0.7, glowTexture()))));
        glowDisc.rotation.x = -Math.PI / 2;
        glowDisc.position.y = 0.14;
        root.add(glowDisc);
        return {
          obj: root,
          own: mine,
          update: (t) => {
            const o = on();
            const c = o ? 0x3bb273 : accent;
            (ring.material as THREE.MeshBasicMaterial).color.set(c);
            (glowDisc.material as THREE.MeshBasicMaterial).color.set(c);
            disc.position.y = o ? 0.02 : 0.06;
            if (!this.style.reducedMotion) glowDisc.scale.setScalar(1 + 0.08 * Math.sin(t * 4));
          },
        };
      }
      case 'lamp': {
        const post = instance('street-light-2', { height: 5 });
        post.position.x = ROAD_HALF + 0.7;
        post.rotation.y = -Math.PI / 2;
        root.add(post);
        const cone = new THREE.Mesh(this.geometry('lamp-cone', () => new THREE.ConeGeometry(2.6, 4.6, 24, 1, true).translate(0, -2.3, 0)), pal.get('lamp-cone', () => glowMaterial(0xfff1a8, 0.22)));
        cone.position.set(ROAD_HALF - 0.6, 4.8, 0);
        root.add(cone);
        const bulb = sprite(pal.glowSprite(0xfff1a8, 0.9), 1.2);
        bulb.position.set(ROAD_HALF - 0.6, 4.8, 0);
        root.add(bulb);
        return {
          obj: root,
          update: () => {
            const o = on();
            cone.visible = o;
            bulb.material = pal.glowSprite(o ? 0xfff1a8 : 0x8e9ab5, o ? 0.9 : 0.4);
          },
        };
      }
    }
  }

  private createPortal(x: number, exit: boolean, side: Side, index: number): View {
    const pal = this.pal;
    const [a, b, glow] = this.style.portalColors;
    const main = this.style.side === 'real' ? b : a;
    const root = new THREE.Group();
    const mine: THREE.Material[] = [];
    const r = exit ? 3.3 : PORTAL_HEIGHT * S * 0.55;
    const cy = exit ? 3.5 : PORTAL_HEIGHT * S * 0.5;
    root.position.set(0, cy, zOf(x));
    const ring = new THREE.Mesh(this.geometry(`torus-${r}`, () => new THREE.TorusGeometry(r, exit ? 0.28 : 0.13, 16, 64)), pal.get(`portal-ring-${main}`, () => new THREE.MeshStandardMaterial({ color: main, emissive: new THREE.Color(main), emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.3 })));
    ring.scale.y = 1.08;
    root.add(ring);
    const inner = new THREE.Mesh(this.geometry(`portal-disc-${r}`, () => new THREE.CircleGeometry(r * 0.98, 48)), own(mine, pal.get(`portal-inner-${glow}`, () => glowMaterial(glow, 0.6, swirlTexture()))));
    inner.scale.y = 1.08;
    root.add(inner);
    const core = new THREE.Mesh(this.geometry(`portal-core-${r}`, () => new THREE.CircleGeometry(r * 0.96, 48)), pal.get(`portal-core-${this.style.side}`, () => new THREE.MeshBasicMaterial({ color: this.style.side === 'real' ? 0x0b1640 : 0x12062a, transparent: true, opacity: 0.85, depthWrite: false })));
    core.position.z = -0.02;
    core.scale.y = 1.08;
    root.add(core);
    root.add(sprite(pal.glowSprite(main, 0.55), r * 3.4));
    // Glow on the ground.
    const pool = new THREE.Mesh(this.geometry(`portal-pool-${r}`, () => new THREE.PlaneGeometry(r * 3, r * 1.4)), pal.get(`portal-pool-${main}`, () => glowMaterial(main, 0.6, glowTexture())));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -cy + 0.04;
    root.add(pool);
    if (!exit) {
      // Arrow showing the swap direction (up = to reality, down = to the shadow).
      const arrow = sprite(pal.get(`arrow-${side}`, () => new THREE.SpriteMaterial({ map: arrowTexture(side === 'real'), transparent: true, depthWrite: false })), 0.8);
      arrow.position.y = r * 1.25 + 0.4;
      root.add(arrow);
    }
    return {
      obj: root,
      own: mine,
      update: (t) => {
        const used = !exit && this.session.portalsUsed[index] === 1;
        root.scale.setScalar(used ? 0.85 : 1);
        (inner.material as THREE.MeshBasicMaterial).opacity = used ? 0.2 : 0.6;
        if (!this.style.reducedMotion) inner.rotation.z = -t * 1.8;
      },
    };
  }

  private createCheckpoint(x: number, index: number): View {
    const pal = this.pal;
    const [, b, glow] = this.style.portalColors;
    const root = new THREE.Group();
    const mine: THREE.Material[] = [];
    root.position.set(-(ROAD_HALF + 1.1), WALK_TOP, zOf(x));
    const flag = instance('flag', { height: 2.8 });
    root.add(flag);
    const pad = new THREE.Mesh(this.geometry('cp-pad', () => new THREE.RingGeometry(0.55, 0.85, 40)), own(mine, pal.get('cp-pad', () => new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, toneMapped: false, side: THREE.DoubleSide }))));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.03;
    root.add(pad);
    const halo = new THREE.Mesh(this.geometry('cp-halo', () => new THREE.PlaneGeometry(3, 3)), own(mine, pal.get('cp-halo', () => glowMaterial(0x5aa8ff, 0.7, glowTexture()))));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.04;
    root.add(halo);
    const beam = new THREE.Mesh(this.geometry('cp-beam', () => new THREE.CylinderGeometry(0.6, 0.85, 4, 24, 1, true).translate(0, 2, 0)), own(mine, pal.get('cp-beam', () => glowMaterial(0x5aa8ff, 0.18, shaftTexture()))));
    root.add(beam);
    return {
      obj: root,
      own: mine,
      update: (t) => {
        const lit = this.session.checkpointIndex >= index;
        const c = lit ? glow : 0x5aa8ff;
        (pad.material as THREE.MeshBasicMaterial).color.set(lit ? b : 0x9fe8ff);
        (halo.material as THREE.MeshBasicMaterial).color.set(c);
        (beam.material as THREE.MeshBasicMaterial).color.set(c);
        (pad.material as THREE.MeshBasicMaterial).opacity = this.style.reducedMotion ? 0.9 : 0.6 + 0.3 * Math.sin(t * 4);
      },
    };
  }

  /** Screen-free helper: world position of a sim point (x, h). */
  static toWorld(x: number, h: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, h * S, zOf(x));
  }

  dispose(): void {
    this.reset();
    for (const g of this.geo.values()) g.dispose();
    this.geo.clear();
    this.pal.dispose();
  }
}

/** A circular saw (or a gear) facing the runner: a toothed disc extruded thinly. */
function sawGeometry(r: number, gear: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const teeth = gear ? 12 : 22;
  for (let i = 0; i <= teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = gear ? (i % 2 === 0 ? r : r * 0.82) : i % 2 === 0 ? r : r * 0.86;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(x, y);
    else if (gear) shape.lineTo(x, y);
    else shape.lineTo(x + Math.cos(a + 0.5) * r * 0.08, y + Math.sin(a + 0.5) * r * 0.08);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * (gear ? 0.25 : 0.12), 0, Math.PI * 2, true);
  shape.holes.push(hole);
  if (gear) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.14, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: gear ? 0.25 : 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 24 });
  g.translate(0, 0, -(gear ? 0.125 : 0.025));
  return g;
}

let lockTex: THREE.Texture | null = null;
function lockTexture(): THREE.Texture {
  if (lockTex) return lockTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(29,24,56,0.75)';
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(64, 54, 18, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(38, 54, 52, 38);
  }
  lockTex = new THREE.CanvasTexture(c);
  lockTex.colorSpace = THREE.SRGBColorSpace;
  return lockTex;
}

const arrowTex: Record<string, THREE.Texture> = {};
function arrowTexture(down: boolean): THREE.Texture {
  const k = down ? 'd' : 'u';
  if (arrowTex[k]) return arrowTex[k];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    if (down) {
      ctx.moveTo(24, 40);
      ctx.lineTo(104, 40);
      ctx.lineTo(64, 104);
    } else {
      ctx.moveTo(24, 88);
      ctx.lineTo(104, 88);
      ctx.lineTo(64, 24);
    }
    ctx.fill();
  }
  arrowTex[k] = new THREE.CanvasTexture(c);
  arrowTex[k].colorSpace = THREE.SRGBColorSpace;
  return arrowTex[k];
}
