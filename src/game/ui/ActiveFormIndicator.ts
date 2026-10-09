import Phaser from 'phaser';

import type { Form } from '../levels/LevelDefinition';

const RING_REAL = 0x5aa8ff;
const RING_SHADOW = 0x9a7bff;
const CORE = 0x141033;

/**
 * The switch button on the seam between the worlds: a dark disc with a glowing ring and a swirl whose
 * bright half faces the active world, with arrows up and down. A ring around it refills during the
 * switch cooldown. The active world is also named by the lane labels (never colour alone).
 */
export class ActiveFormIndicator extends Phaser.GameObjects.Container {
  readonly accessibleName = 'Switch';
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly icons: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private form: Form = 'real';
  private cooldown = 0;
  private pressed = false;
  private spin = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly radius: number,
    private readonly onPress: () => void,
  ) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.ring = scene.add.graphics();
    this.icons = scene.add.graphics();
    this.add([this.bg, this.ring, this.icons]);
    this.setSize(radius * 2, radius * 2);
    this.setInteractive(new Phaser.Geom.Circle(radius, radius, radius + 14), Phaser.Geom.Circle.Contains);
    if (this.input) this.input.cursor = 'pointer';
    this.on('pointerdown', () => {
      this.pressed = true;
      this.redraw();
      this.onPress();
    });
    this.on('pointerup', () => {
      this.pressed = false;
      this.redraw();
    });
    this.on('pointerout', () => {
      this.pressed = false;
      this.redraw();
    });
    scene.add.existing(this);
    this.redraw();
  }

  setForm(form: Form, animate: boolean): void {
    if (form === this.form) return;
    this.form = form;
    if (animate) {
      this.scene.tweens.killTweensOf(this);
      this.spin = Math.PI;
      this.scene.tweens.add({
        targets: this,
        spin: 0,
        duration: 260,
        ease: 'Cubic.easeOut',
        onUpdate: () => this.redraw(),
      });
      this.setScale(1.12);
      this.scene.tweens.add({ targets: this, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
    this.redraw();
  }

  /** 1 = just switched, 0 = ready. */
  setCooldown(fraction: number): void {
    if (Math.abs(fraction - this.cooldown) < 0.02 && fraction !== 0) return;
    this.cooldown = fraction;
    const r = this.radius;
    this.ring.clear();
    if (fraction <= 0) return;
    this.ring.lineStyle(6, 0xffffff, 0.9);
    this.ring.beginPath();
    this.ring.arc(0, 0, r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - fraction), false);
    this.ring.strokePath();
  }

  private redraw(): void {
    const r = this.radius;
    const real = this.form === 'real';
    const ringColor = real ? RING_REAL : RING_SHADOW;
    const dy = this.pressed ? 3 : 0;
    const g = this.bg;
    g.clear();
    // Outer glow and ring.
    g.fillStyle(ringColor, 0.25);
    g.fillCircle(0, dy, r + 16);
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(0, dy + 6, r + 4);
    g.fillStyle(CORE, 1);
    g.fillCircle(0, dy, r + 4);
    g.lineStyle(7, ringColor, 1);
    g.strokeCircle(0, dy, r - 2);
    g.lineStyle(2, 0xffffff, 0.85);
    g.strokeCircle(0, dy, r - 6);

    // Swirl: bright half towards the active world.
    const ic = this.icons;
    ic.clear();
    const s = r * 0.56;
    const rot = (real ? 0 : Math.PI) + this.spin;
    const px = (a: number, d: number) => Math.cos(rot + a) * d;
    const py = (a: number, d: number) => dy + Math.sin(rot + a) * d;
    ic.fillStyle(0x2a2060, 1);
    ic.fillCircle(0, dy, s);
    ic.fillStyle(0xffffff, 1);
    ic.slice(0, dy, s, rot + Math.PI, rot + Math.PI * 2, false);
    ic.fillPath();
    // The S-curve: a white bulge on one side, a dark bulge on the other.
    ic.fillStyle(0xffffff, 1);
    ic.fillCircle(px(0, s / 2), py(0, s / 2), s / 2);
    ic.fillStyle(0x2a2060, 1);
    ic.fillCircle(px(Math.PI, s / 2), py(Math.PI, s / 2), s / 2);
    ic.fillStyle(0x2a2060, 1);
    ic.fillCircle(px(0, s / 2), py(0, s / 2), s * 0.16);
    ic.fillStyle(0xffffff, 1);
    ic.fillCircle(px(Math.PI, s / 2), py(Math.PI, s / 2), s * 0.16);
    ic.lineStyle(2, 0xffffff, 0.9);
    ic.strokeCircle(0, dy, s);

    // Arrows above and below: switching moves between the worlds.
    ic.fillStyle(0xffffff, 0.95);
    const a = r + 26;
    ic.fillTriangle(-8, -a + 4, 8, -a + 4, 0, -a - 8);
    ic.fillRect(-2, -a + 4, 4, 9);
    ic.fillTriangle(-8, a - 4, 8, a - 4, 0, a + 8);
    ic.fillRect(-2, a - 13, 4, 9);
  }
}
