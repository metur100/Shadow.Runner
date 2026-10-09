import Phaser from 'phaser';

import { AudioManager } from '../systems/AudioManager';
import { COLORS } from '../utils/Constants';
import { Haptics } from '../utils/Haptics';
import type { Focusable, FocusManager } from './FocusManager';
import { drawIcon, type IconName } from './Icons';
import { addText } from './Typography';

/** Settings row: icon, label, description and an ON / OFF switch (state shown as text and shape). */
export class Toggle extends Phaser.GameObjects.Container implements Focusable {
  readonly accessibleName: string;
  private readonly knob: Phaser.GameObjects.Graphics;
  private readonly stateLabel: Phaser.GameObjects.Text;
  private readonly ring: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly rowWidth: number,
    label: string,
    description: string,
    icon: IconName,
    private isOn: boolean,
    private readonly onChange: (value: boolean) => void,
    focus?: FocusManager,
  ) {
    super(scene, x, y);
    this.accessibleName = label;
    const w = rowWidth;
    const h = 96;
    const bg = scene.add.graphics();
    bg.fillStyle(0xffffff, 0.08);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    const ig = scene.add.graphics();
    drawIcon(ig, icon, -w / 2 + 48, 0, 36, 0xfff8ec, 1);
    const title = addText(scene, -w / 2 + 92, -14, label, { size: 30, weight: '600', color: COLORS.creamText, origin: [0, 0.5] });
    const desc = addText(scene, -w / 2 + 92, 20, description, { size: 20, weight: '500', color: COLORS.muted, origin: [0, 0.5] });
    this.knob = scene.add.graphics();
    this.stateLabel = addText(scene, w / 2 - 76, 0, '', { size: 20, weight: '700', color: '#ffffff' });
    this.ring = scene.add.graphics();
    this.add([bg, ig, title, desc, this.knob, this.stateLabel, this.ring]);
    this.setSize(w, h);
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';
    this.on('pointerup', () => this.activate());
    scene.add.existing(this);
    focus?.add(this);
    this.once('destroy', () => focus?.remove(this));
    this.redraw();
  }

  get focusable(): boolean {
    return this.visible && this.active;
  }

  activate(): void {
    this.isOn = !this.isOn;
    AudioManager.unlock();
    AudioManager.button();
    Haptics.play('tap');
    this.redraw();
    this.onChange(this.isOn);
  }

  setFocused(focused: boolean): void {
    this.ring.clear();
    if (!focused) return;
    this.ring.lineStyle(5, 0xffffff, 1);
    this.ring.strokeRoundedRect(-this.rowWidth / 2 - 6, -54, this.rowWidth + 12, 108, 26);
  }

  private redraw(): void {
    const g = this.knob;
    const x = this.rowWidth / 2 - 76;
    g.clear();
    g.fillStyle(this.isOn ? COLORS.good : 0x4a4566, 1);
    g.fillRoundedRect(x - 52, -24, 104, 48, 24);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(this.isOn ? x + 28 : x - 28, 0, 18);
    this.stateLabel.setText(this.isOn ? 'ON' : 'OFF');
    this.stateLabel.setX(this.isOn ? x - 14 : x + 14);
  }
}
