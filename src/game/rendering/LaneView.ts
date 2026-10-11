import Phaser from 'phaser';
import * as THREE from 'three';

import type { Side, ThemeId } from '../levels/LevelDefinition';
import type { RunSession } from '../systems/RunSession';
import type { RunnerVisual } from '../three/Runner3D';
import { World3D } from '../three/World3D';
import { hashString } from '../utils/MathUtils';
import { lanePalette, type LanePalette } from './Themes';

export interface LaneOptions {
  side: Side;
  theme: ThemeId;
  /** Top of the lane on screen and its height (design units). */
  top: number;
  height: number;
  width: number;
  highContrast: boolean;
  reducedMotion: boolean;
  /** Portal cosmetic colours. */
  portalColors: [number, number, number];
  /** Runner colours (costume / shadow form). */
  runnerColors: [number, number, number];
  /** Windows, shadows and other details (off on weak devices). */
  detail: boolean;
}

/**
 * One world's lane: a 3D world (see three/World3D) drawn into a strip of the screen, plus the 2D
 * overlays Phaser draws on top of it – the dimming of the inactive world, the active border and
 * flashes. Positions of things in the world are projected to screen coordinates for the HUD and
 * particle effects.
 */
export class LaneView {
  readonly world: World3D;
  readonly pal: LanePalette;
  readonly side: Side;
  private readonly overlay: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly border: Phaser.GameObjects.Graphics;
  private readonly v = new THREE.Vector3();
  private dimAlpha = 0;
  private visual: RunnerVisual = { anim: 'run', h: 0, lx: 0, solid: true, speed: 8, cheer: false, reducedMotion: false };
  private onGround = true;
  private scroll = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    session: RunSession,
    private readonly opts: LaneOptions,
  ) {
    this.side = opts.side;
    this.pal = lanePalette(opts.theme, opts.side);
    this.world = new World3D({
      side: opts.side,
      theme: opts.theme,
      session,
      runnerColors: opts.runnerColors,
      portalColors: opts.portalColors,
      highContrast: opts.highContrast,
      reducedMotion: opts.reducedMotion,
      detail: opts.detail,
      seed: hashString(`${session.level.id}-${opts.side}`) % 10000,
    });
    this.overlay = scene.add.container(0, opts.top).setDepth(30);
    this.dim = scene.add.rectangle(0, 0, opts.width, opts.height, 0x05030f, 1).setOrigin(0).setAlpha(0);
    this.border = scene.add.graphics();
    this.overlay.add([this.dim, this.border]);
  }

  get top(): number {
    return this.opts.top;
  }

  get height(): number {
    return this.opts.height;
  }

  /** Screen x of the runner (it moves across the lanes). */
  get runnerX(): number {
    return this.project(this.scroll, 40, this.visual.lx).x;
  }

  /** Screen y of a height above the ground at the runner's position. */
  screenY(h: number): number {
    return this.project(this.scroll, h, this.visual.lx).y;
  }

  /** Screen position of a point in this world (sim x, height, lateral position in lanes). */
  project(worldX: number, h: number, lx = 0): { x: number; y: number } {
    const p = this.world.projectSim(worldX, h, this.v, lx);
    return { x: ((p.x + 1) / 2) * this.opts.width, y: this.opts.top + ((1 - p.y) / 2) * this.opts.height };
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

  /** The runner of this world for the next frame. */
  setRunner(visual: RunnerVisual, onGround: boolean): void {
    this.visual = visual;
    this.onGround = onGround;
  }

  update(scroll: number, t: number, dt: number): void {
    this.scroll = scroll;
    this.world.update(scroll, t, dt, this.visual, this.onGround);
  }

  /** After a respawn the world jumps back: rebuild the street and objects around the new position. */
  rewind(): void {
    this.world.rewind();
  }

  /** Brief colour flash over the lane (hits, portals, switching). */
  flash(color: number, alpha = 0.5, duration = 260): void {
    if (this.opts.reducedMotion) alpha *= 0.4;
    const r = this.scene.add.rectangle(0, 0, this.opts.width, this.opts.height, color, alpha).setOrigin(0);
    this.overlay.add(r);
    this.scene.tweens.add({ targets: r, alpha: 0, duration, onComplete: () => r.destroy() });
  }

  get dimmed(): number {
    return this.dimAlpha;
  }

  destroy(): void {
    this.overlay.destroy();
    this.world.dispose();
  }
}
