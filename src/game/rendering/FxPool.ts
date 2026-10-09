import Phaser from 'phaser';

interface Particle {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
  spin: number;
  scale0: number;
  scale1: number;
  alive: boolean;
}

export interface BurstOptions {
  count: number;
  color: number;
  texture?: 'dot' | 'spark';
  speed?: number;
  life?: number;
  scale?: number;
  gravity?: number;
  /** Extra horizontal drift (e.g. −run speed so particles stay in the world). */
  drift?: number;
  angle?: number;
  spread?: number;
  additive?: boolean;
}

/**
 * Pooled image particles for sparkles, trails and bursts. Images are created once up to the device's
 * budget and recycled; when the pool is exhausted new effects are simply skipped.
 */
export class FxPool {
  private readonly particles: Particle[] = [];
  private readonly free: Particle[] = [];

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Container,
    budget: number,
  ) {
    for (let i = 0; i < budget; i++) {
      const img = scene.add.image(0, 0, 'dot').setVisible(false);
      layer.add(img);
      const p: Particle = { img, vx: 0, vy: 0, life: 0, maxLife: 1, gravity: 0, spin: 0, scale0: 1, scale1: 0, alive: false };
      this.particles.push(p);
      this.free.push(p);
    }
  }

  burst(x: number, y: number, o: BurstOptions): void {
    for (let i = 0; i < o.count; i++) {
      const p = this.free.pop();
      if (!p) return;
      const angle = (o.angle ?? 0) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2);
      const speed = (o.speed ?? 160) * (0.5 + Math.random() * 0.7);
      p.vx = Math.cos(angle) * speed + (o.drift ?? 0);
      p.vy = Math.sin(angle) * speed;
      p.maxLife = p.life = (o.life ?? 0.5) * (0.7 + Math.random() * 0.5);
      p.gravity = o.gravity ?? 0;
      p.spin = (Math.random() - 0.5) * 8;
      p.scale0 = (o.scale ?? 0.5) * (0.7 + Math.random() * 0.6);
      p.scale1 = 0;
      p.alive = true;
      p.img
        .setTexture(o.texture ?? 'dot')
        .setPosition(x, y)
        .setTint(o.color)
        .setBlendMode(o.additive === false ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
        .setScale(p.scale0)
        .setAlpha(1)
        .setVisible(true);
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        p.img.setVisible(false);
        this.free.push(p);
        continue;
      }
      p.vy += p.gravity * dt;
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.img.rotation += p.spin * dt;
      const k = p.life / p.maxLife;
      p.img.setScale(p.scale1 + (p.scale0 - p.scale1) * k);
      p.img.setAlpha(Math.min(1, k * 1.6));
    }
  }

  clear(): void {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.alive = false;
      p.img.setVisible(false);
      this.free.push(p);
    }
  }
}
