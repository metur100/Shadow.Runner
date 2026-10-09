import Phaser from 'phaser';

import type { Form } from '../levels/LevelDefinition';
import { COLORS } from '../utils/Constants';
import { drawIcon } from './Icons';
import { addText } from './Typography';

const REAL_COLOR = 0xff8a3d;
const SHADOW_COLOR = 0x6b4cff;

/**
 * The big switch button at the bottom of the gameplay screen. It shows both forms (sun = physical,
 * moon = shadow) with the active one large and bright, a text label of the active world (never colour
 * alone), and a ring that refills during the switch cooldown.
 */
export class ActiveFormIndicator extends Phaser.GameObjects.Container {
  readonly accessibleName = 'Switch';
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly icons: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private form: Form = 'real';
  private cooldown = 0;
  private pressed = false;

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
    this.label = addText(scene, 0, radius * 0.5, 'REALITY', { size: Math.round(radius * 0.24), weight: '700', color: '#ffffff' });
    this.add([this.bg, this.ring, this.icons, this.label]);
    this.setSize(radius * 2, radius * 2);
    this.setInteractive(new Phaser.Geom.Circle(radius, radius, radius + 12), Phaser.Geom.Circle.Contains);
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
    this.label.setText(form === 'real' ? 'REALITY' : 'SHADOW');
    this.redraw();
    if (animate) {
      this.scene.tweens.killTweensOf(this);
      this.setScale(1.12);
      this.scene.tweens.add({ targets: this, scale: 1, duration: 220, ease: 'Back.easeOut' });
    }
  }

  /** 1 = just switched, 0 = ready. */
  setCooldown(fraction: number): void {
    if (Math.abs(fraction - this.cooldown) < 0.02 && fraction !== 0) return;
    this.cooldown = fraction;
    const r = this.radius;
    this.ring.clear();
    if (fraction <= 0) return;
    this.ring.lineStyle(10, 0xffffff, 0.9);
    this.ring.beginPath();
    this.ring.arc(0, 0, r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - fraction), false);
    this.ring.strokePath();
  }

  private redraw(): void {
    const r = this.radius;
    const real = this.form === 'real';
    const color = real ? REAL_COLOR : SHADOW_COLOR;
    const g = this.bg;
    g.clear();
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(0, this.pressed ? 3 : 8, r + 4);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(0, this.pressed ? 4 : 0, r + 4);
    g.fillStyle(color, 1);
    g.fillCircle(0, this.pressed ? 4 : 0, r - 2);
    // Split: the inactive half is darker.
    g.fillStyle(real ? SHADOW_COLOR : REAL_COLOR, 0.55);
    g.slice(0, this.pressed ? 4 : 0, r - 2, real ? -Math.PI / 2 : Math.PI / 2, real ? Math.PI / 2 : Math.PI * 1.5, false);
    g.fillPath();
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(0, -r * 0.45, r * 1.3, r * 0.6);
    const ic = this.icons;
    ic.clear();
    const dy = this.pressed ? 4 : 0;
    const big = r * 0.62;
    const small = r * 0.36;
    // Active icon large in the middle, the other small at the side, with a swap arrow between.
    drawIcon(ic, real ? 'sun' : 'moon', 0, -r * 0.12 + dy, big, 0xffffff, 1);
    drawIcon(ic, real ? 'moon' : 'sun', r * 0.6, -r * 0.42 + dy, small, real ? 0xd9ccff : 0xffe2b8, 0.9);
    drawIcon(ic, 'swap', -r * 0.6, -r * 0.42 + dy, r * 0.3, 0xffffff, 0.85);
    this.label.setY(r * 0.5 + dy);
    this.label.setColor(COLORS.creamText);
  }
}
