import Phaser from 'phaser';

import type { Form } from '../../levels/LevelDefinition';
import type { FxPool } from '../../rendering/FxPool';
import type { GameplayLayout } from '../../rendering/Layout';

export interface EffectsOptions {
  layout: GameplayLayout;
  width: number;
  reducedMotion: boolean;
  /** Switch-effect cosmetic: 'flash' | 'ripple' | 'shards' | 'ink'. */
  transition: string;
  transitionColors: [number, number, number];
}

/**
 * Screen-space effects of a run: the glowing divider and its switch wave, the beam between the two
 * forms on a switch, cosmetic switch effects, the cross-world link drawn from a switch to what it
 * changes in the other world, the eclipse tint and the pursuing eclipse wave in chase levels.
 */
export class RunEffects {
  private readonly divider: Phaser.GameObjects.Graphics;
  private readonly links: Phaser.GameObjects.Graphics;
  private readonly eclipseTint: Phaser.GameObjects.Rectangle;
  private readonly chaseWall: Phaser.GameObjects.Graphics | null;
  private waveTime = 10;
  private waveDir = 1;
  private readonly linkList: { x1: number; y1: number; x2: number; y2: number; color: number; life: number }[] = [];
  private eclipse = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: FxPool,
    private readonly opts: EffectsOptions,
    chase: boolean,
  ) {
    const { layout, width } = opts;
    this.eclipseTint = scene.add.rectangle(0, layout.realTop, width, layout.controlsTop - layout.realTop, 0x8a3dff, 0).setOrigin(0).setDepth(30);
    this.divider = scene.add.graphics().setDepth(40);
    this.links = scene.add.graphics().setDepth(42);
    this.chaseWall = chase ? scene.add.graphics().setDepth(35) : null;
  }

  /** The switch moment: a wave along the divider, a beam between the forms and the cosmetic effect. */
  switched(to: Form, x: number, fromY: number, toY: number): void {
    this.waveTime = 0;
    this.waveDir = to === 'shadow' ? 1 : -1;
    const [c0, c1, c2] = this.opts.transitionColors;
    if (this.opts.reducedMotion) return;
    // A beam joining the two forms – the "ghost" passing between the worlds.
    const g = this.scene.add.graphics().setDepth(43).setPosition(x, 0);
    g.fillStyle(c0, 0.6);
    g.fillRect(-6, Math.min(fromY, toY), 12, Math.abs(toY - fromY));
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(-2, Math.min(fromY, toY), 4, Math.abs(toY - fromY));
    this.scene.tweens.add({ targets: g, alpha: 0, scaleX: 3, duration: 260, onComplete: () => g.destroy() });
    switch (this.opts.transition) {
      case 'ripple':
        for (let i = 0; i < 3; i++) this.ring(x, toY, c1, i * 70);
        break;
      case 'shards':
        this.fx.burst(x, toY, { count: 16, color: c0, texture: 'spark', speed: 320, life: 0.45, scale: 0.6 });
        this.fx.burst(x, fromY, { count: 8, color: c2, texture: 'spark', speed: 200, life: 0.35, scale: 0.5 });
        break;
      case 'ink': {
        const blot = this.scene.add.circle(x, toY, 20, c0, 0.7).setDepth(43);
        this.scene.tweens.add({ targets: blot, radius: 140, alpha: 0, duration: 380, onComplete: () => blot.destroy() });
        this.fx.burst(x, toY, { count: 10, color: c1, speed: 260, life: 0.4, scale: 0.7 });
        break;
      }
      default:
        this.fx.burst(x, toY, { count: 12, color: c0, speed: 240, life: 0.35, scale: 0.6 });
        this.ring(x, toY, c1, 0);
    }
  }

  private ring(x: number, y: number, color: number, delay: number): void {
    const ring = this.scene.add.circle(x, y, 24).setStrokeStyle(5, color, 1).setDepth(43);
    ring.setAlpha(0);
    this.scene.tweens.add({ targets: ring, radius: 120, alpha: { from: 1, to: 0 }, delay, duration: 420, onComplete: () => ring.destroy() });
  }

  /** A glowing link from a switch in one world to the obstacle it changes in the other. */
  link(x1: number, y1: number, x2: number, y2: number, color: number): void {
    this.linkList.push({ x1, y1, x2, y2, color, life: 0.9 });
    if (!this.opts.reducedMotion) this.fx.burst(x2, y2, { count: 12, color, texture: 'spark', speed: 180, life: 0.5, scale: 0.5 });
  }

  setEclipse(on: boolean): void {
    this.eclipse = on;
    this.scene.tweens.add({ targets: this.eclipseTint, fillAlpha: on ? 0.16 : 0, duration: 400 });
  }

  update(dt: number, t: number, runSpeed: number): void {
    const { layout, width } = this.opts;
    const y = layout.dividerY;
    this.waveTime += dt;
    const g = this.divider;
    g.clear();
    const pulse = this.eclipse ? 0.6 + 0.4 * Math.sin(t * 8) : 0.35;
    g.fillStyle(this.eclipse ? 0xc44dff : 0x9fe8ff, pulse);
    g.fillRect(0, y - 7, width, 14);
    g.fillStyle(0xffffff, 0.95);
    if (this.waveTime < 0.6 && !this.opts.reducedMotion) {
      // A wave rolls along the seam after each switch.
      const amp = 14 * (1 - this.waveTime / 0.6);
      const front = this.waveTime * width * 2.2;
      for (let x = 0; x <= width; x += 6) {
        const d = Math.abs(x - front);
        const yy = y + Math.sin(x * 0.05 - this.waveTime * 30) * amp * Math.max(0, 1 - d / 260) * this.waveDir;
        g.fillRect(x, yy - 2, 6, 4);
      }
    } else {
      g.fillRect(0, y - 2, width, 4);
      if (!this.opts.reducedMotion) {
        // A soft shimmer travelling along the seam.
        const sx = ((t * 260) % (width + 200)) - 100;
        g.fillStyle(0xffffff, 0.6);
        g.fillRect(sx, y - 4, 80, 8);
      }
    }

    const l = this.links;
    l.clear();
    for (let i = this.linkList.length - 1; i >= 0; i--) {
      const k = this.linkList[i];
      k.life -= dt;
      k.x1 -= runSpeed * dt;
      k.x2 -= runSpeed * dt;
      if (k.life <= 0) {
        this.linkList.splice(i, 1);
        continue;
      }
      const a = Math.min(1, k.life * 2);
      l.lineStyle(10, k.color, 0.3 * a);
      this.curve(l, k);
      l.lineStyle(4, 0xffffff, 0.9 * a);
      this.curve(l, k);
    }

    if (this.chaseWall) {
      const c = this.chaseWall;
      c.clear();
      const w = 70 + Math.sin(t * 3) * 12;
      for (let i = 0; i < 6; i++) {
        c.fillStyle(0x05030a, 0.75 - i * 0.12);
        c.fillRect(0, layout.realTop, w + i * 14, layout.controlsTop - layout.realTop);
      }
      c.fillStyle(0xc44dff, 0.8);
      for (let yy = layout.realTop; yy < layout.controlsTop; yy += 26) c.fillCircle(w + 10 + Math.sin(yy * 0.1 + t * 6) * 8, yy, 3);
    }
  }

  private curve(g: Phaser.GameObjects.Graphics, k: { x1: number; y1: number; x2: number; y2: number }): void {
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(k.x1, k.y1),
      new Phaser.Math.Vector2((k.x1 + k.x2) / 2 + 60, (k.y1 + k.y2) / 2),
      new Phaser.Math.Vector2(k.x2, k.y2),
    );
    curve.draw(g, 24);
  }
}
