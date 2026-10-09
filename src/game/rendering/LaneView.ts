import Phaser from 'phaser';

import type { Collectible } from '../entities/Collectible';
import type { Obstacle } from '../entities/Obstacle';
import { PORTAL_HEIGHT, type Portal } from '../entities/Portal';
import type { Switch } from '../entities/Switch';
import type { Side, ThemeId } from '../levels/LevelDefinition';
import type { RunSession } from '../systems/RunSession';
import { RUNNER_SCREEN_X } from '../utils/Constants';
import { createObstacleView, type ObstacleView, type RenderContext } from './ObstacleRenderer';
import { GROUND_H, laneTextures } from './TextureFactory';
import { lanePalette, mix, type LanePalette } from './Themes';

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
}

interface Ambient {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

const VIEW_AHEAD = 820;
const VIEW_BEHIND = 320;

/**
 * One world's lane: a masked strip of the screen with a parallax background, a ground strip and a
 * scrolling world container holding obstacles, collectibles, switches, portals and checkpoints.
 * Display objects are created only while things are on (or near) the screen and released afterwards;
 * collectible sprites come from a pool.
 */
export class LaneView {
  readonly root: Phaser.GameObjects.Container;
  /** Scrolling container: x = world x, y = −height (origin on the ground line). */
  readonly world: Phaser.GameObjects.Container;
  /** Layer for the runner (fixed horizontally). */
  readonly actors: Phaser.GameObjects.Container;
  readonly fx: Phaser.GameObjects.Container;
  readonly groundY: number;
  readonly pal: LanePalette;
  readonly side: Side;
  private readonly far: Phaser.GameObjects.TileSprite;
  private readonly mid: Phaser.GameObjects.TileSprite;
  private readonly ground: Phaser.GameObjects.TileSprite;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly border: Phaser.GameObjects.Graphics;
  private readonly mask: Phaser.GameObjects.Graphics;
  private readonly rc: RenderContext;
  private readonly obstacleViews = new Map<number, ObstacleView>();
  private readonly itemViews = new Map<number, Phaser.GameObjects.Image>();
  private readonly itemPool: Phaser.GameObjects.Image[] = [];
  private readonly switchViews = new Map<number, { g: Phaser.GameObjects.Graphics; on: boolean }>();
  private readonly portalViews = new Map<number, Phaser.GameObjects.Container>();
  private readonly checkpointViews = new Map<number, { c: Phaser.GameObjects.Container; lit: boolean }>();
  private readonly ambient: Ambient[] = [];
  private readonly obstacles: Obstacle[];
  private readonly items: Collectible[];
  private readonly switches: Switch[];
  private readonly portals: Portal[];
  private obstacleCursor = 0;
  private dimAlpha = 0;
  private readonly textureScale: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly session: RunSession,
    private readonly opts: LaneOptions,
  ) {
    const { side, theme, top, height, width, textureScale } = opts;
    this.side = side;
    this.textureScale = textureScale;
    this.pal = lanePalette(theme, side);
    this.groundY = height - GROUND_H;
    this.root = scene.add.container(0, top);
    const tex = laneTextures(scene, theme, side, width, height, textureScale);
    const s = scene.textures.get(tex.sky).getSourceImage().width / width;
    const sky = scene.add.image(0, 0, tex.sky).setOrigin(0).setDisplaySize(width, height);
    this.far = scene.add.tileSprite(0, 0, width, height, tex.far).setOrigin(0).setTileScale(1 / s);
    this.mid = scene.add.tileSprite(0, 0, width, height, tex.mid).setOrigin(0).setTileScale(1 / s);
    this.ground = scene.add.tileSprite(0, this.groundY, width, GROUND_H, tex.ground).setOrigin(0).setTileScale(1 / s);
    this.world = scene.add.container(RUNNER_SCREEN_X, this.groundY);
    this.actors = scene.add.container(0, 0);
    this.fx = scene.add.container(RUNNER_SCREEN_X, this.groundY);
    this.dim = scene.add.rectangle(0, 0, width, height, 0x05030f, 1).setOrigin(0).setAlpha(0);
    this.border = scene.add.graphics();
    this.root.add([sky, this.far, this.mid, this.ground, this.world, this.dim, this.actors, this.fx, this.border]);
    if (opts.highContrast) {
      // Calmer background so hazards stand out.
      const veil = scene.add.rectangle(0, 0, width, this.groundY, side === 'real' ? 0xffffff : 0x000000, side === 'real' ? 0.35 : 0.45).setOrigin(0);
      this.root.addAt(veil, 3);
    }

    this.mask = scene.make.graphics({}, false);
    this.mask.fillStyle(0xffffff);
    this.mask.fillRect(0, top, width, height);
    this.root.setMask(this.mask.createGeometryMask());

    this.rc = { scene, pal: this.pal, top: this.groundY - 6, highContrast: opts.highContrast, reducedMotion: opts.reducedMotion };
    this.obstacles = session.obstacles.filter((o) => o.side === side).sort((a, b) => a.minX - b.minX);
    this.items = session.collectibles.filter((c) => c.side === side);
    this.switches = session.switches.filter((sw) => sw.side === side);
    this.portals = session.portals.filter((p) => p.side === side || p.isExit);

    for (let i = 0; i < opts.ambientParticles; i++) {
      const img = scene.add.image(0, 0, 'dot').setTint(this.pal.particle).setBlendMode(Phaser.BlendModes.ADD);
      const a: Ambient = {
        img,
        x: Math.random() * width,
        y: Math.random() * this.groundY,
        vx: side === 'shadow' ? -10 - Math.random() * 20 : -20 - Math.random() * 30,
        vy: side === 'shadow' ? -8 - Math.random() * 14 : 4 - Math.random() * 8,
        phase: Math.random() * 10,
      };
      img.setScale(side === 'shadow' ? 0.18 + Math.random() * 0.2 : 0.12 + Math.random() * 0.12);
      this.ambient.push(a);
      this.root.addAt(img, 4);
    }
  }

  get top(): number {
    return this.opts.top;
  }

  get height(): number {
    return this.opts.height;
  }

  /** Screen y of a height above this lane's ground line. */
  screenY(h: number): number {
    return this.opts.top + this.groundY - h;
  }

  screenX(worldX: number, scroll: number): number {
    return RUNNER_SCREEN_X + worldX - scroll;
  }

  setActive(active: boolean, instant = false): void {
    const target = active ? 0 : this.opts.highContrast ? 0.55 : 0.4;
    if (instant || this.opts.reducedMotion) {
      this.dimAlpha = target;
      this.dim.setAlpha(target);
    } else {
      this.scene.tweens.add({ targets: this.dim, alpha: target, duration: 180, onUpdate: () => (this.dimAlpha = this.dim.alpha) });
    }
    this.border.clear();
    if (active) {
      const glow = this.side === 'real' ? 0xffc96b : 0x9a7bff;
      this.border.lineStyle(6, glow, 0.85);
      this.border.strokeRect(3, 3, this.opts.width - 6, this.opts.height - 6);
    }
  }

  update(scroll: number, t: number, dt: number): void {
    const session = this.session;
    this.world.x = RUNNER_SCREEN_X - scroll;
    const k = this.textureScale;
    this.far.tilePositionX = scroll * 0.12 * k;
    this.mid.tilePositionX = scroll * 0.35 * k;
    this.ground.tilePositionX = scroll * k;

    // Obstacles: create views as they come into range, release them once behind.
    while (this.obstacleCursor < this.obstacles.length && this.obstacles[this.obstacleCursor].minX < scroll + VIEW_AHEAD) {
      const o = this.obstacles[this.obstacleCursor++];
      if (o.maxX < scroll - VIEW_BEHIND) continue;
      const view = createObstacleView(this.rc, o);
      if (view) {
        this.world.add(view.root);
        this.obstacleViews.set(o.index, view);
      }
    }
    for (const [index, view] of this.obstacleViews) {
      const o = session.obstacles[index];
      if (o.maxX < scroll - VIEW_BEHIND && (o.kind !== 'train' || o.trainX(t, session.obstacleStates[index]) + o.w < scroll - VIEW_BEHIND)) {
        view.root.destroy();
        this.obstacleViews.delete(index);
        continue;
      }
      view.update(t, session.obstacleStates[index]);
    }

    this.updateItems(scroll, t);
    this.updateSwitches(scroll);
    this.updatePortals(scroll, t);
    this.updateCheckpoints(scroll, t);
    this.updateAmbient(dt);
  }

  /** After a respawn the world jumps back: rebuild the views around the new position. */
  rewind(): void {
    for (const view of this.obstacleViews.values()) view.root.destroy();
    this.obstacleViews.clear();
    this.obstacleCursor = 0;
    for (const [i, img] of this.itemViews) this.releaseItem(i, img);
    for (const sv of this.switchViews.values()) sv.g.destroy();
    this.switchViews.clear();
  }

  private updateItems(scroll: number, t: number): void {
    const session = this.session;
    for (const [i, img] of this.itemViews) {
      const item = session.collectibles[i];
      if (item.x < scroll - VIEW_BEHIND || session.collected[i]) this.releaseItem(i, img);
    }
    for (const item of this.items) {
      if (item.x > scroll + VIEW_AHEAD) break;
      if (item.x < scroll - VIEW_BEHIND || session.collected[item.index] || this.itemViews.has(item.index)) continue;
      const img = this.itemPool.pop() ?? this.scene.add.image(0, 0, 'coin');
      img.setTexture(item.kind === 'coin' ? 'coin' : item.kind === 'crystal' ? 'crystal' : 'key');
      img.setVisible(true).setDisplaySize(item.kind === 'key' ? 46 : 34, item.kind === 'key' ? 46 : 34);
      this.world.add(img);
      this.itemViews.set(item.index, img);
    }
    for (const [i, img] of this.itemViews) {
      const item = session.collectibles[i];
      const bob = this.opts.reducedMotion ? 0 : Math.sin(t * 4 + item.x * 0.02) * 3;
      img.setPosition(item.x, -item.y + bob);
      if (!this.opts.reducedMotion && item.kind === 'coin') img.scaleX = img.scaleY * Math.abs(Math.cos(t * 3 + item.x * 0.01)) + 0.0001;
    }
  }

  private releaseItem(index: number, img: Phaser.GameObjects.Image): void {
    img.setVisible(false);
    this.world.remove(img);
    this.itemPool.push(img);
    this.itemViews.delete(index);
  }

  private updateSwitches(scroll: number): void {
    const session = this.session;
    for (const sw of this.switches) {
      if (sw.x > scroll + VIEW_AHEAD) break;
      const existing = this.switchViews.get(sw.index);
      if (sw.x < scroll - VIEW_BEHIND) {
        if (existing) {
          existing.g.destroy();
          this.switchViews.delete(sw.index);
        }
        continue;
      }
      const on = session.switchesOn[sw.index] === 1;
      if (existing && existing.on === on) continue;
      const g = existing?.g ?? this.scene.add.graphics();
      if (!existing) this.world.add(g);
      g.clear();
      g.x = sw.x;
      drawSwitch(g, sw, on, this.pal, this.opts.highContrast);
      this.switchViews.set(sw.index, { g, on });
    }
  }

  private updatePortals(scroll: number, t: number): void {
    for (const p of this.portals) {
      const visible = p.x > scroll - VIEW_BEHIND && p.x < scroll + VIEW_AHEAD;
      let view = this.portalViews.get(p.index);
      if (!visible) {
        if (view) {
          view.destroy();
          this.portalViews.delete(p.index);
        }
        continue;
      }
      if (!view) {
        view = createPortalView(this.scene, p, this.opts.portalColors, p.isExit ? this.groundY - 10 : PORTAL_HEIGHT, this.side);
        this.world.add(view);
        this.portalViews.set(p.index, view);
      }
      const used = this.session.portalsUsed[p.index] === 1;
      view.setAlpha(used && !p.isExit ? 0.35 : 1);
      const swirl = view.list[1] as Phaser.GameObjects.Graphics | undefined;
      if (swirl && !this.opts.reducedMotion) swirl.rotation = t * 1.5;
    }
  }

  private updateCheckpoints(scroll: number, t: number): void {
    this.session.checkpoints.forEach((cp) => {
      const visible = cp.x > scroll - VIEW_BEHIND && cp.x < scroll + VIEW_AHEAD;
      let view = this.checkpointViews.get(cp.index);
      if (!visible) {
        if (view) {
          view.c.destroy();
          this.checkpointViews.delete(cp.index);
        }
        return;
      }
      const lit = this.session.checkpointIndex >= cp.index;
      if (!view || view.lit !== lit) {
        view?.c.destroy();
        const c = createCheckpointView(this.scene, cp.x, lit, this.side, this.opts.portalColors);
        this.world.add(c);
        view = { c, lit };
        this.checkpointViews.set(cp.index, view);
      }
      const halo = view.c.list[0] as Phaser.GameObjects.Image;
      halo.setAlpha(lit ? 0.6 + 0.3 * Math.sin(t * 4) : 0.25);
    });
  }

  private updateAmbient(dt: number): void {
    const w = this.opts.width;
    for (const a of this.ambient) {
      a.phase += dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt + Math.sin(a.phase * 2) * 0.3;
      if (a.x < -10) a.x += w + 20;
      if (a.y < 0) a.y += this.groundY;
      if (a.y > this.groundY) a.y -= this.groundY;
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

function drawSwitch(g: Phaser.GameObjects.Graphics, sw: Switch, on: boolean, pal: LanePalette, hc: boolean): void {
  const accent = sw.side === 'real' ? 0xff8a3d : pal.solidEdge;
  switch (sw.kind) {
    case 'lever': {
      g.fillStyle(0x3a3355, 1);
      g.fillRoundedRect(-18, -16, 36, 16, 5);
      const angle = on ? 0.7 : -0.7;
      g.lineStyle(7, 0x1d1838, 1);
      g.lineBetween(0, -10, Math.sin(angle) * 60, -10 - Math.cos(angle) * 60);
      g.fillStyle(on ? 0x3bb273 : accent, 1);
      g.fillCircle(Math.sin(angle) * 60, -10 - Math.cos(angle) * 60, 12);
      // ON / OFF text cue as well as colour.
      g.fillStyle(on ? 0x3bb273 : 0xffffff, 1);
      g.fillRoundedRect(-14, -34, 28, 12, 4);
      break;
    }
    case 'plate': {
      g.fillStyle(0x1d1838, 0.6);
      g.fillRoundedRect(-34, -6, 68, 8, 3);
      g.fillStyle(on ? 0x3bb273 : accent, 1);
      g.fillRoundedRect(-28, on ? -5 : -12, 56, on ? 6 : 10, 4);
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeRoundedRect(-28, on ? -5 : -12, 56, on ? 6 : 10, 4);
      break;
    }
    case 'lamp': {
      g.fillStyle(0x2f3b57, 1);
      g.fillRect(-4, -130, 8, 130);
      g.fillRoundedRect(-10, -6, 20, 6, 2);
      g.fillRect(-4, -134, 34, 6);
      g.fillStyle(on ? 0xfff1a8 : 0x8e9ab5, 1);
      g.fillCircle(26, -124, 10);
      if (on) {
        g.fillStyle(0xfff1a8, 0.35);
        g.fillTriangle(26, -124, -10, 0, 62, 0);
      }
      break;
    }
  }
  if (hc) {
    g.lineStyle(3, 0xffffff, 1);
    g.strokeCircle(0, -20, 26);
  }
}

function createPortalView(scene: Phaser.Scene, p: Portal, colors: [number, number, number], height: number, side: Side): Phaser.GameObjects.Container {
  const c = scene.add.container(p.x, 0);
  const [a, b, glow] = colors;
  const halo = scene.add.image(0, -height / 2, 'glow').setTint(side === 'real' ? b : a).setBlendMode(Phaser.BlendModes.ADD);
  halo.setDisplaySize(height * 0.9, height * 1.3);
  const swirl = scene.add.graphics();
  swirl.y = -height / 2;
  swirl.lineStyle(5, glow, 0.8);
  for (let i = 0; i < 3; i++) {
    swirl.beginPath();
    swirl.arc(0, 0, height * (0.18 + i * 0.07), i * 2, i * 2 + 2.4, false);
    swirl.strokePath();
  }
  const ring = scene.add.graphics();
  ring.lineStyle(9, a, 1);
  ring.strokeEllipse(0, -height / 2, height * 0.5, height);
  ring.lineStyle(4, b, 1);
  ring.strokeEllipse(0, -height / 2, height * 0.5 - 12, height - 12);
  if (p.isExit) {
    ring.fillStyle(glow, 0.25);
    ring.fillEllipse(0, -height / 2, height * 0.5 - 12, height - 12);
  } else {
    // Arrow showing the swap direction (up = to reality, down = to the shadow).
    ring.fillStyle(0xffffff, 1);
    const down = p.side === 'real';
    ring.fillTriangle(-10, down ? -height - 14 : -height - 30, 10, down ? -height - 14 : -height - 30, 0, down ? -height - 30 : -height - 14);
  }
  c.add([halo, swirl, ring]);
  return c;
}

function createCheckpointView(scene: Phaser.Scene, x: number, lit: boolean, side: Side, colors: [number, number, number]): Phaser.GameObjects.Container {
  const c = scene.add.container(x, 0);
  const color = lit ? colors[2] : side === 'real' ? 0xffffff : 0x9a7bff;
  const halo = scene.add.image(0, -90, 'glow').setTint(lit ? colors[1] : 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(150, 220);
  const g = scene.add.graphics();
  g.lineStyle(7, mix(color, 0x000000, 0.1), 1);
  g.beginPath();
  g.moveTo(-34, 0);
  g.lineTo(-34, -120);
  g.arc(0, -120, 34, Math.PI, 0, false);
  g.lineTo(34, 0);
  g.strokePath();
  g.fillStyle(lit ? 0x3bb273 : 0xff8a3d, 1);
  g.fillTriangle(34, -150, 34, -126, 66, -138);
  g.lineStyle(3, 0x1d1838, 1);
  g.lineBetween(34, -160, 34, -120);
  c.add([halo, g]);
  return c;
}
