import Phaser from 'phaser';

import type { Collectible } from '../entities/Collectible';
import type { Obstacle } from '../entities/Obstacle';
import type { Portal } from '../entities/Portal';
import type { Switch } from '../entities/Switch';
import type { Side, ThemeId } from '../levels/LevelDefinition';
import type { RunSession } from '../systems/RunSession';
import { hashString } from '../utils/MathUtils';
import { drawCheckpoint, drawCollectible, drawObstacle, drawPortal, drawSwitch, obstacleDepth, type RenderContext } from './ObstacleRenderer';
import { LaneCamera, NEAR_Z } from './Perspective';
import { SceneryRenderer, sceneryStyle } from './Scenery';
import { GROUND_H, laneTextures } from './TextureFactory';
import { lanePalette, type LanePalette } from './Themes';

export interface LaneOptions {
  side: Side;
  theme: ThemeId;
  /** Top of the lane on screen and its height (design units). */
  top: number;
  height: number;
  width: number;
  textureScale: number;
  highContrast: boolean;
  reducedMotion: boolean;
  /** Portal cosmetic colours. */
  portalColors: [number, number, number];
  ambientParticles: number;
  /** Windows, cracks and other small scenery details (off on weak devices). */
  detail: boolean;
}

interface Ambient {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

interface Entry {
  z: number;
  type: 0 | 1 | 2 | 3 | 4;
  index: number;
}

const VIEW_AHEAD = 1500;
const VIEW_BEHIND = 60;

/**
 * One world's lane, seen through a chase camera: a masked strip of the screen with a sky, a skyline
 * on the horizon, a street with roadside buildings running to the vanishing point, and everything
 * in the level (obstacles, collectibles, switches, portals, checkpoints) drawn in perspective, far to
 * near, every frame. The runner is drawn on top by the gameplay scene, in `actors`.
 */
export class LaneView {
  readonly root: Phaser.GameObjects.Container;
  /** Layer for the runner. */
  readonly actors: Phaser.GameObjects.Container;
  readonly fx: Phaser.GameObjects.Container;
  readonly pal: LanePalette;
  readonly side: Side;
  readonly cam: LaneCamera;
  private readonly scenery: SceneryRenderer;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly objs: Phaser.GameObjects.Graphics;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly border: Phaser.GameObjects.Graphics;
  private readonly mask: Phaser.GameObjects.Graphics;
  private readonly rc: RenderContext;
  private readonly ambient: Ambient[] = [];
  private readonly obstacles: Obstacle[];
  private readonly items: Collectible[];
  private readonly switches: Switch[];
  private readonly portals: Portal[];
  private readonly entries: Entry[] = [];
  private entryCount = 0;
  private dimAlpha = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly session: RunSession,
    private readonly opts: LaneOptions,
  ) {
    const { side, theme, top, height, width, textureScale } = opts;
    this.side = side;
    this.pal = lanePalette(theme, side);
    this.cam = new LaneCamera(width, height);
    this.root = scene.add.container(0, top);
    const tex = laneTextures(scene, theme, side, width, height, textureScale);
    const sky = scene.add.image(0, 0, tex.sky).setOrigin(0).setDisplaySize(width, height);
    // The side-on skyline texture becomes the distant city on the horizon.
    const skyline = scene.add.image(0, 0, tex.far).setOrigin(0, 0);
    const baseFrac = 1 - GROUND_H / height;
    const skylineH = height * 0.62;
    skyline.setDisplaySize(width, skylineH);
    skyline.y = this.cam.horizon + 4 - skylineH * baseFrac;
    skyline.setAlpha(0.75);
    const st = sceneryStyle(theme, side);
    const haze = scene.add.rectangle(0, this.cam.horizon - height * 0.06, width, height * 0.1, st.fog, 0.35).setOrigin(0);
    this.bg = scene.add.graphics();
    this.objs = scene.add.graphics();
    this.actors = scene.add.container(0, 0);
    this.fx = scene.add.container(0, 0);
    this.dim = scene.add.rectangle(0, 0, width, height, 0x05030f, 1).setOrigin(0).setAlpha(0);
    this.border = scene.add.graphics();
    this.root.add([sky, skyline, haze, this.bg, this.objs, this.actors, this.fx, this.dim, this.border]);
    if (opts.highContrast) {
      // Calmer background so hazards stand out.
      const veil = scene.add.rectangle(0, 0, width, this.cam.horizon + 20, side === 'real' ? 0xffffff : 0x000000, side === 'real' ? 0.35 : 0.45).setOrigin(0);
      this.root.addAt(veil, 3);
    }
    this.scenery = new SceneryRenderer(this.cam, st, hashString(`${theme}-${side}`) % 1000, opts.detail);

    this.mask = scene.make.graphics({}, false);
    this.mask.fillStyle(0xffffff);
    this.mask.fillRect(0, top, width, height);
    this.root.setMask(this.mask.createGeometryMask());

    this.rc = { cam: this.cam, pal: this.pal, side, highContrast: opts.highContrast, reducedMotion: opts.reducedMotion, portalColors: opts.portalColors };
    this.obstacles = session.obstacles.filter((o) => o.side === side).sort((a, b) => a.minX - b.minX);
    this.items = session.collectibles.filter((c) => c.side === side).sort((a, b) => a.x - b.x);
    this.switches = session.switches.filter((sw) => sw.side === side);
    this.portals = session.portals.filter((p) => p.side === side || p.isExit);

    for (let i = 0; i < opts.ambientParticles; i++) {
      const img = scene.add.image(0, 0, 'dot').setTint(this.pal.particle).setBlendMode(Phaser.BlendModes.ADD);
      const a: Ambient = {
        img,
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 30,
        vy: side === 'shadow' ? -10 - Math.random() * 16 : 20 + Math.random() * 30,
        phase: Math.random() * 10,
      };
      img.setScale(side === 'shadow' ? 0.18 + Math.random() * 0.2 : 0.12 + Math.random() * 0.12);
      this.ambient.push(a);
      this.root.addAt(img, 5);
    }
  }

  get top(): number {
    return this.opts.top;
  }

  get height(): number {
    return this.opts.height;
  }

  /** Screen x of the runner (the middle of the road). */
  get runnerX(): number {
    return this.cam.cx;
  }

  /** Scale of the runner drawing. */
  get runnerScale(): number {
    return this.cam.s0 * 1.25;
  }

  /** Screen y of a height above the ground at the runner's position. */
  screenY(h: number): number {
    return this.opts.top + this.cam.runnerY(h);
  }

  /** Screen position of a point in this world (world x, height). */
  project(worldX: number, h: number): { x: number; y: number } {
    const z = Math.max(NEAR_Z, this.cam.z(worldX));
    return { x: this.cam.cx, y: this.opts.top + this.cam.sy(h, z) };
  }

  setActive(active: boolean, instant = false): void {
    const target = active ? 0 : this.opts.highContrast ? 0.55 : 0.42;
    if (instant || this.opts.reducedMotion) {
      this.dimAlpha = target;
      this.dim.setAlpha(target);
    } else {
      this.scene.tweens.add({ targets: this.dim, alpha: target, duration: 180, onUpdate: () => (this.dimAlpha = this.dim.alpha) });
    }
    this.border.clear();
    if (active) {
      const glow = this.side === 'real' ? 0xffc96b : 0x9a7bff;
      this.border.lineStyle(5, glow, 0.8);
      this.border.strokeRect(2.5, 2.5, this.opts.width - 5, this.opts.height - 5);
    }
  }

  private push(z: number, type: Entry['type'], index: number): void {
    let e = this.entries[this.entryCount];
    if (!e) {
      e = { z: 0, type: 0, index: 0 };
      this.entries.push(e);
    }
    e.z = z;
    e.type = type;
    e.index = index;
    this.entryCount++;
  }

  update(scroll: number, t: number, dt: number): void {
    const session = this.session;
    const cam = this.cam;
    cam.scroll = scroll;
    // The camera rises with the runner onto platforms (not with jumps).
    const form = session.form(this.side);
    const target = form.onGround ? Math.max(0, form.h) * 0.65 : form.h < 0 ? 0 : cam.lift;
    cam.lift += (target - cam.lift) * Math.min(1, dt * 5);

    this.bg.clear();
    this.scenery.draw(this.bg);

    // Collect what is in view and draw it far to near.
    this.entryCount = 0;
    const lo = scroll - VIEW_BEHIND;
    const hi = scroll + VIEW_AHEAD;
    for (const o of this.obstacles) {
      if (o.minX > hi) break;
      if (o.maxX < lo && o.kind !== 'train') continue;
      const st = session.obstacleStates[o.index];
      if (o.kind === 'train') {
        const tx = o.trainX(t, st);
        if (tx + o.w < lo || tx > hi) continue;
      }
      this.push(obstacleDepth(cam, o, t, st) + (o.kind === 'pit' || o.kind === 'boost' ? 10000 : 0), 0, o.index);
    }
    for (const item of this.items) {
      if (item.x > hi) break;
      if (item.x < lo || session.collected[item.index]) continue;
      this.push(cam.z(item.x), 1, item.index);
    }
    for (const sw of this.switches) if (sw.x > lo && sw.x < hi) this.push(cam.z(sw.x), 2, sw.index);
    for (const p of this.portals) if (p.x > lo && p.x < hi) this.push(cam.z(p.x) + 1, 3, p.index);
    for (const cp of session.checkpoints) if (cp.x > lo - 60 && cp.x < hi) this.push(cam.z(cp.x), 4, cp.index);

    const list = this.entries;
    const n = this.entryCount;
    // Insertion sort, farthest first (ground decals – pits, boost arrows – always go underneath).
    for (let i = 1; i < n; i++) {
      const e = list[i];
      let j = i - 1;
      while (j >= 0 && list[j].z < e.z) {
        list[j + 1] = list[j];
        j--;
      }
      list[j + 1] = e;
    }
    const g = this.objs;
    g.clear();
    for (let i = 0; i < n; i++) {
      const e = list[i];
      switch (e.type) {
        case 0:
          drawObstacle(this.rc, g, session.obstacles[e.index], t, session.obstacleStates[e.index]);
          break;
        case 1:
          drawCollectible(this.rc, g, session.collectibles[e.index], t);
          break;
        case 2:
          drawSwitch(this.rc, g, session.switches[e.index], session.switchesOn[e.index] === 1);
          break;
        case 3:
          drawPortal(this.rc, g, session.portals[e.index], session.portalsUsed[e.index] === 1, t);
          break;
        case 4:
          drawCheckpoint(this.rc, g, session.checkpoints[e.index].x, session.checkpointIndex >= e.index, t);
          break;
      }
    }

    // Contact shadow under the runner.
    const groundH = form.onGround ? form.h : Math.max(0, cam.lift / 0.65);
    if (form.h > -40) {
      const y = cam.runnerY(groundH);
      const s = this.runnerScale;
      const k = Math.max(0.4, 1 - (form.h - groundH) / 300);
      g.fillStyle(0x000000, (this.side === 'shadow' ? 0.5 : 0.28) * k);
      g.fillEllipse(cam.cx, y, 64 * s * k, 14 * s * k);
    }
    this.updateAmbient(dt);
  }

  /** After a respawn the world jumps back. */
  rewind(): void {
    this.cam.lift = 0;
  }

  private updateAmbient(dt: number): void {
    const w = this.opts.width;
    const h = this.opts.height;
    for (const a of this.ambient) {
      a.phase += dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt + Math.sin(a.phase * 2) * 0.3;
      if (a.x < -10) a.x += w + 20;
      if (a.x > w + 10) a.x -= w + 20;
      if (a.y < 0) a.y += h;
      if (a.y > h) a.y -= h;
      a.img.setPosition(a.x, a.y);
      a.img.setAlpha(0.3 + 0.4 * Math.abs(Math.sin(a.phase)));
    }
  }

  /** Brief colour flash over the lane (hits, portals, switching). */
  flash(color: number, alpha = 0.5, duration = 260): void {
    if (this.opts.reducedMotion) alpha *= 0.4;
    const r = this.scene.add.rectangle(0, 0, this.opts.width, this.opts.height, color, alpha).setOrigin(0);
    this.root.add(r);
    this.scene.tweens.add({ targets: r, alpha: 0, duration, onComplete: () => r.destroy() });
  }

  get dimmed(): number {
    return this.dimAlpha;
  }

  destroy(): void {
    this.mask.destroy();
    this.root.destroy();
  }
}
