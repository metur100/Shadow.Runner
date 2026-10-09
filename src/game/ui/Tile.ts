import Phaser from 'phaser';

import { AudioManager } from '../systems/AudioManager';
import { Haptics } from '../utils/Haptics';
import type { Focusable, FocusManager } from './FocusManager';

export interface TileOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Name for screen readers and automated tests. */
  name: string;
  onClick: () => void;
  focus?: FocusManager;
  /** Selected tiles get a bright outline. */
  selected?: boolean;
  radius?: number;
  fill?: number;
  fillAlpha?: number;
}

/**
 * Card-style button (world cards, level cards, collection items). Content is added by the caller as
 * children positioned around the tile centre.
 */
export class Tile extends Phaser.GameObjects.Container implements Focusable {
  readonly accessibleName: string;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private pressed = false;
  private selected: boolean;

  constructor(
    scene: Phaser.Scene,
    private readonly opts: TileOptions,
  ) {
    super(scene, opts.x, opts.y);
    this.accessibleName = opts.name;
    this.selected = opts.selected ?? false;
    this.bg = scene.add.graphics();
    this.ring = scene.add.graphics();
    this.add([this.bg, this.ring]);
    this.setSize(opts.width, opts.height);
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, opts.width, opts.height), Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';
    this.on('pointerdown', () => {
      this.pressed = true;
      this.draw();
    });
    this.on('pointerout', () => {
      this.pressed = false;
      this.draw();
    });
    this.on('pointerup', () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.draw();
      this.activate();
    });
    scene.add.existing(this);
    opts.focus?.add(this);
    this.once('destroy', () => opts.focus?.remove(this));
    this.draw();
  }

  get focusable(): boolean {
    return this.visible && this.active;
  }

  activate(): void {
    AudioManager.unlock();
    AudioManager.button();
    Haptics.play('tap');
    this.opts.onClick();
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.draw();
  }

  setFocused(focused: boolean): void {
    this.ring.clear();
    if (!focused) return;
    const { width: w, height: h } = this.opts;
    const r = (this.opts.radius ?? 24) + 6;
    this.ring.lineStyle(6, 0xffffff, 1);
    this.ring.strokeRoundedRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16, r);
  }

  private draw(): void {
    const { width: w, height: h } = this.opts;
    const r = this.opts.radius ?? 24;
    const g = this.bg;
    g.clear();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, r);
    g.fillStyle(this.opts.fill ?? 0xffffff, (this.opts.fillAlpha ?? 0.1) + (this.pressed ? 0.08 : 0));
    g.fillRoundedRect(-w / 2, -h / 2 + (this.pressed ? 3 : 0), w, h, r);
    if (this.selected) {
      g.lineStyle(5, 0xffd36b, 1);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    } else {
      g.lineStyle(2, 0xffffff, 0.18);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    }
  }
}
