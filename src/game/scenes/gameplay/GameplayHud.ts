import Phaser from 'phaser';

import type { Form, LevelDefinition } from '../../levels/LevelDefinition';
import type { GameplayLayout } from '../../rendering/Layout';
import type { RunSession } from '../../systems/RunSession';
import { ActiveFormIndicator } from '../../ui/ActiveFormIndicator';
import { Button } from '../../ui/Button';
import { drawIcon } from '../../ui/Icons';
import { ProgressBar } from '../../ui/ProgressBar';
import { addText } from '../../ui/Typography';
import { COLORS } from '../../utils/Constants';
import type { BaseScene } from '../BaseScene';

export interface HudOptions {
  layout: GameplayLayout;
  level: LevelDefinition;
  /** Short label left of the title, e.g. "1-3", "Daily", "Endless". */
  tag: string;
  endless: boolean;
  leftHanded: boolean;
  reducedMotion: boolean;
  onPause(): void;
  onSwitch(): void;
  onJump(): void;
  onSlide(): void;
}

/**
 * Everything drawn over the two lanes: the top bar (pause, level, progress with checkpoint ticks,
 * coins, crystals, lives), the world labels on each lane (text + icon, the active one marked), toasts
 * and banners, the light-ahead warning, and the bottom controls (switch button, jump and slide
 * buttons – mirrored in left-handed mode).
 */
export class GameplayHud {
  readonly switchButton: ActiveFormIndicator;
  readonly pauseButton: Button;
  private readonly progress: ProgressBar | null;
  private readonly distance: Phaser.GameObjects.Text | null;
  private readonly coins: Phaser.GameObjects.Text;
  private readonly crystals: Phaser.GameObjects.Text;
  private readonly hearts: Phaser.GameObjects.Graphics;
  private readonly realLabel: Phaser.GameObjects.Container;
  private readonly shadowLabel: Phaser.GameObjects.Container;
  private readonly warning: Phaser.GameObjects.Container;
  private readonly toastLayer: Phaser.GameObjects.Container;
  private lastCoins = -1;
  private lastCrystals = -1;
  private lastLives = -1;
  private warningOn = false;
  private readonly jumpButton: Button;
  private readonly slideButton: Button;
  private readonly hint: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: BaseScene,
    private readonly opts: HudOptions,
  ) {
    const { W, safeTop } = scene;
    const { layout, level } = opts;
    const y = safeTop + 56;

    const bar = scene.add.graphics().setDepth(50);
    bar.fillStyle(COLORS.night, 0.92);
    bar.fillRect(0, 0, W, layout.hudBottom);
    bar.fillStyle(0xffffff, 0.08);
    bar.fillRect(0, layout.hudBottom - 3, W, 3);

    this.pauseButton = new Button(scene, { x: 56, y, width: 84, height: 80, icon: 'pause', variant: 'secondary', onClick: opts.onPause, focus: scene.focus });
    this.pauseButton.setDepth(60);
    (this.pauseButton as unknown as { accessibleName: string }).accessibleName = 'Pause';

    addText(scene, 118, y - 22, opts.tag ? `${opts.tag}  ${level.name}` : level.name, { size: 24, weight: '600', color: COLORS.creamText, origin: [0, 0.5] }).setDepth(60);
    if (opts.endless) {
      this.progress = null;
      this.distance = addText(scene, 118, y + 14, '0 m', { size: 30, weight: '700', color: COLORS.creamText, origin: [0, 0.5] }).setDepth(60);
    } else {
      this.distance = null;
      const markers = level.checkpoints.map((c) => c / level.length);
      this.progress = new ProgressBar(scene, 118 + 150, y + 16, { width: 300, height: 16, fill: 0xffc96b, track: 0xffffff, trackAlpha: 0.18 });
      this.progress.setDepth(60);
      const ticks = scene.add.graphics().setDepth(61);
      for (const m of markers) {
        ticks.fillStyle(0xffffff, 0.8);
        ticks.fillRect(118 + m * 300 - 1.5, y + 6, 3, 20);
      }
      drawIcon(ticks, 'portal', 118 + 300 + 18, y + 16, 26, 0x9fe8ff, 1);
    }

    const right = W - 24;
    const icons = scene.add.graphics().setDepth(60);
    drawIcon(icons, 'coin', right - 176, y - 18, 28, COLORS.coin, 1);
    drawIcon(icons, 'crystal', right - 72, y - 18, 30, COLORS.crystal, 1);
    this.coins = addText(scene, right - 156, y - 18, '0', { size: 26, weight: '700', color: COLORS.creamText, origin: [0, 0.5] }).setDepth(60);
    this.crystals = addText(scene, right - 52, y - 18, '0', { size: 26, weight: '700', color: COLORS.creamText, origin: [0, 0.5] }).setDepth(60);
    this.hearts = scene.add.graphics().setDepth(60);

    this.realLabel = this.laneLabel('real', layout.realTop + 14);
    this.shadowLabel = this.laneLabel('shadow', layout.shadowTop + 14);

    // Light-ahead warning: icon + text (not colour alone), shown above the switch button.
    this.warning = scene.add.container(W / 2, layout.controlsTop + 14).setDepth(70).setVisible(false);
    const wg = scene.add.graphics();
    wg.fillStyle(0xfff1a8, 1);
    wg.fillRoundedRect(-150, -18, 300, 36, 18);
    drawIcon(wg, 'sun', -122, 0, 24, 0xd8642a, 1);
    this.warning.add([wg, addText(scene, 14, 0, 'LIGHT AHEAD', { size: 22, weight: '700', color: '#7a3a12' })]);

    this.toastLayer = scene.add.container(0, 0).setDepth(80);

    // Bottom controls.
    const cy = layout.controlsY;
    const left = opts.leftHanded;
    this.switchButton = new ActiveFormIndicator(scene, W / 2, cy, layout.switchRadius, opts.onSwitch);
    this.switchButton.setDepth(60);
    this.jumpButton = new Button(scene, { x: 0, y: cy - 52, width: 136, height: 88, icon: 'jump', label: 'Jump', variant: 'ghost', fontSize: 24, onClick: opts.onJump });
    this.slideButton = new Button(scene, { x: 0, y: cy + 52, width: 136, height: 88, icon: 'slide', label: 'Slide', variant: 'ghost', fontSize: 24, onClick: opts.onSlide });
    this.jumpButton.setDepth(60);
    this.slideButton.setDepth(60);
    this.hint = addText(scene, 0, cy, 'Tap anywhere\nto switch\n\nSwipe ↑ jump\nSwipe ↓ slide', {
      size: 19,
      weight: '500',
      color: COLORS.muted,
      lineSpacing: 2,
    }).setDepth(60);
    const controlsBg = scene.add.graphics().setDepth(55);
    controlsBg.fillStyle(COLORS.night, 0.94);
    controlsBg.fillRect(0, layout.controlsTop, W, scene.H - layout.controlsTop);
    this.setLeftHanded(left);
  }

  /** Left-handed mode puts the jump / slide buttons on the left. */
  setLeftHanded(left: boolean): void {
    const W = this.scene.W;
    const sideX = left ? 92 : W - 92;
    this.jumpButton.x = sideX;
    this.slideButton.x = sideX;
    this.hint.x = left ? W - 112 : 112;
  }

  private laneLabel(form: Form, y: number): Phaser.GameObjects.Container {
    const c = this.scene.add.container(this.scene.W - 20, y).setDepth(45);
    const g = this.scene.add.graphics();
    const text = addText(this.scene, -58, 18, form === 'real' ? 'REALITY' : 'SHADOW', { size: 20, weight: '700', color: '#ffffff' });
    c.add([g, text]);
    c.setData('form', form);
    return c;
  }

  setForm(form: Form, animate: boolean): void {
    this.switchButton.setForm(form, animate);
    for (const label of [this.realLabel, this.shadowLabel]) {
      const lf = label.getData('form') as Form;
      const active = lf === form;
      const g = label.list[0] as Phaser.GameObjects.Graphics;
      g.clear();
      g.fillStyle(lf === 'real' ? 0xff8a3d : 0x6b4cff, active ? 1 : 0.5);
      g.fillRoundedRect(-150, 0, 150, 36, 18);
      drawIcon(g, lf === 'real' ? 'sun' : 'moon', -130, 18, 22, 0xffffff, active ? 1 : 0.6);
      const text = label.list[1] as Phaser.GameObjects.Text;
            text.setAlpha(active ? 1 : 0.6);
      label.setScale(active ? 1 : 0.88);
    }
  }

  setEclipse(on: boolean): void {
    for (const label of [this.realLabel, this.shadowLabel]) {
      label.setScale(1);
      (label.list[1] as Phaser.GameObjects.Text).setAlpha(1);
    }
    if (on) this.banner('ECLIPSE', 'Both forms are real – jump and slide together', 0xb05cff);
  }

  update(session: RunSession, dt: number): void {
    if (this.progress) {
      this.progress.setValue(session.progress);
      this.progress.tick(dt);
    }
    if (this.distance) this.distance.setText(`${Math.floor(session.x / 10)} m`);
    if (session.coins !== this.lastCoins) {
      this.lastCoins = session.coins;
      this.coins.setText(String(session.coins));
      this.pop(this.coins);
    }
    if (session.crystals !== this.lastCrystals) {
      this.lastCrystals = session.crystals;
      this.crystals.setText(String(session.crystals));
      this.pop(this.crystals);
    }
    if (session.lives !== this.lastLives) {
      this.lastLives = session.lives;
      this.drawHearts(session.lives, session.maxLives);
    }
    this.switchButton.setCooldown(session.switcher.cooldownFraction);
  }

  private pop(text: Phaser.GameObjects.Text): void {
    if (this.opts.reducedMotion) return;
    text.setScale(1.3);
    this.scene.tweens.add({ targets: text, scale: 1, duration: 160 });
  }

  private drawHearts(lives: number, max: number): void {
    const g = this.hearts;
    g.clear();
    if (max > 9) return;
    const right = this.scene.W - 30;
    const y = this.scene.safeTop + 56 + 22;
    for (let i = 0; i < max; i++) {
      const x = right - i * 34;
      drawIcon(g, 'heart', x, y, 26, i < lives ? 0xff5d73 : 0x4a4566, 1);
    }
  }

  setWarning(on: boolean, t: number): void {
    if (on !== this.warningOn) {
      this.warningOn = on;
      this.warning.setVisible(on);
    }
    if (on && !this.opts.reducedMotion) this.warning.setAlpha(0.65 + 0.35 * Math.sin(t * 14));
  }

  /** Short message near the top of the lanes. */
  toast(text: string, color = 0xffffff, duration = 1600, y?: number): void {
    const { W } = this.scene;
    const ty = y ?? this.opts.layout.realTop + 112;
    const label = addText(this.scene, W / 2, ty, text, {
      size: 25,
      weight: '700',
      color: '#ffffff',
      wrapWidth: W - 80,
      stroke: '#1d1838',
      strokeThickness: 7,
    });
    label.setTint(color);
    this.toastLayer.add(label);
    // One message at a time: a new toast replaces the previous one.
    for (const other of [...this.toastLayer.list]) if (other !== label) other.destroy();
    label.setAlpha(0);
    this.scene.tweens.add({ targets: label, alpha: 1, duration: 140 });
    this.scene.tweens.add({ targets: label, alpha: 0, delay: duration, duration: 300, onComplete: () => label.destroy() });
  }

  /** Big banner over the divider (level intro, eclipse, hit). */
  banner(title: string, sub: string, color: number, duration = 1500): void {
    const { W } = this.scene;
    const y = this.opts.layout.dividerY;
    const c = this.scene.add.container(W / 2, y).setDepth(85);
    const g = this.scene.add.graphics();
    g.fillStyle(COLORS.night, 0.85);
    g.fillRoundedRect(-320, -66, 640, 132, 28);
    g.lineStyle(4, color, 1);
    g.strokeRoundedRect(-320, -66, 640, 132, 28);
    const t1 = addText(this.scene, 0, -20, title, { size: 44, weight: '700', color: '#ffffff' });
    t1.setTint(color);
    const t2 = addText(this.scene, 0, 30, sub, { size: 23, weight: '500', color: COLORS.creamText, wrapWidth: 600 });
    c.add([g, t1, t2]);
    c.setAlpha(0);
    if (!this.opts.reducedMotion) c.setScale(0.85);
    this.scene.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: c, alpha: 0, delay: duration, duration: 300, onComplete: () => c.destroy() });
  }
}
