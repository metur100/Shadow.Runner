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
  /** Short label for the level, e.g. "1-3", "Daily", "Endless". */
  tag: string;
  endless: boolean;
  leftHanded: boolean;
  reducedMotion: boolean;
  onPause(): void;
  onSwitch(): void;
  onJump(): void;
  onSlide(): void;
  onLane(dir: -1 | 1): void;
}

const GLASS = 0x0d0a24;

function pill(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, alpha = 0.55): void {
  g.fillStyle(GLASS, alpha);
  g.fillRoundedRect(x, y, w, h, h / 2);
  g.lineStyle(2, 0xffffff, 0.18);
  g.strokeRoundedRect(x, y, w, h, h / 2);
}

/**
 * Everything floating over the two worlds, kept light so the worlds stay in view: distance (and level
 * progress) top left, coins and pause top right, crystals at the top of the shadow world, the world
 * labels, the switch button on the seam, translucent jump / slide buttons in one bottom corner and lane
 * buttons in the other (mirrored in left-handed mode), toasts, banners and the light-ahead warning.
 */
export class GameplayHud {
  readonly switchButton: ActiveFormIndicator;
  readonly pauseButton: Button;
  private readonly progress: ProgressBar | null;
  private readonly distance: Phaser.GameObjects.Text;
  private readonly distanceBg: Phaser.GameObjects.Graphics;
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
  private lastMeters = -1;
  private warningOn = false;
  private readonly jumpButton: Button;
  private readonly slideButton: Button;
  private readonly leftButton: Button;
  private readonly rightButton: Button;
  private readonly hint: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: BaseScene,
    private readonly opts: HudOptions,
  ) {
    const { W, safeTop } = scene;
    const { layout, level } = opts;
    const y = safeTop + 48;

    // Top-left: distance, then level progress with checkpoint ticks.
    this.distanceBg = scene.add.graphics().setDepth(59);
    this.distance = addText(scene, 44, y, '0m', { size: 36, weight: '700', color: '#ffffff', origin: [0, 0.5] }).setDepth(60);
    if (opts.endless) {
      this.progress = null;
    } else {
      const markers = level.checkpoints.map((c) => c / level.length);
      const bx = 30;
      const bw = 210;
      const by = y + 48;
      this.progress = new ProgressBar(scene, bx + bw / 2, by, { width: bw, height: 10, fill: 0xffc96b, track: 0xffffff, trackAlpha: 0.25 });
      this.progress.setDepth(60);
      const ticks = scene.add.graphics().setDepth(61);
      for (const m of markers) {
        ticks.fillStyle(0xffffff, 0.85);
        ticks.fillRect(bx + m * bw - 1.5, by - 9, 3, 18);
      }
      drawIcon(ticks, 'portal', bx + bw + 16, by, 22, 0x9fe8ff, 1);
      addText(scene, bx + bw + 34, by, opts.tag || level.name, { size: 18, weight: '600', color: '#ffffff', origin: [0, 0.5], stroke: '#1d1838', strokeThickness: 4 }).setDepth(60);
    }
    this.hearts = scene.add.graphics().setDepth(60);

    // Top-right: coins and pause.
    const icons = scene.add.graphics().setDepth(60);
    const coinPill = scene.add.graphics().setDepth(59);
    pill(coinPill, W - 252, y - 28, 150, 56);
    drawIcon(icons, 'coin', W - 222, y, 34, COLORS.coin, 1);
    this.coins = addText(scene, W - 196, y, '0', { size: 30, weight: '700', color: '#ffffff', origin: [0, 0.5] }).setDepth(60);
    this.pauseButton = new Button(scene, { x: W - 54, y, width: 68, height: 68, radius: 34, icon: 'pause', variant: 'hud', onClick: opts.onPause, focus: scene.focus });
    this.pauseButton.setDepth(60);
    (this.pauseButton as unknown as { accessibleName: string }).accessibleName = 'Pause';

    // Crystals: top right of the shadow world, where they are collected.
    const cy = layout.shadowTop + 46;
    const crystalPill = scene.add.graphics().setDepth(59);
    pill(crystalPill, W - 176, cy - 26, 150, 52);
    drawIcon(icons, 'crystal', W - 148, cy, 32, COLORS.crystal, 1);
    this.crystals = addText(scene, W - 122, cy, '0', { size: 28, weight: '700', color: '#ffffff', origin: [0, 0.5] }).setDepth(60);

    // World labels (text + icon, not colour alone) at the left of each world.
    this.realLabel = this.laneLabel('real', layout.dividerY - 56);
    this.shadowLabel = this.laneLabel('shadow', layout.shadowTop + 24);

    // Light-ahead warning: icon + text, just under the switch button.
    this.warning = scene.add.container(W / 2, layout.dividerY + layout.switchRadius + 66).setDepth(70).setVisible(false);
    const wg = scene.add.graphics();
    wg.fillStyle(0xfff1a8, 1);
    wg.fillRoundedRect(-140, -18, 280, 36, 18);
    drawIcon(wg, 'sun', -112, 0, 24, 0xd8642a, 1);
    this.warning.add([wg, addText(scene, 14, 0, 'LIGHT AHEAD', { size: 22, weight: '700', color: '#7a3a12' })]);

    this.toastLayer = scene.add.container(0, 0).setDepth(80);

    // The switch sits on the seam between the worlds.
    this.switchButton = new ActiveFormIndicator(scene, W / 2, layout.dividerY, layout.switchRadius, opts.onSwitch);
    this.switchButton.setDepth(65);

    // Translucent jump / slide buttons in the bottom corner of the shadow world.
    const bb = layout.buttonsBottom;
    this.jumpButton = new Button(scene, { x: 0, y: bb - 148, width: 112, height: 100, radius: 28, icon: 'jump', label: 'Jump', variant: 'hud', fontSize: 20, onClick: opts.onJump });
    this.slideButton = new Button(scene, { x: 0, y: bb - 40, width: 112, height: 80, radius: 28, icon: 'slide', label: 'Slide', variant: 'hud', fontSize: 20, onClick: opts.onSlide });
    this.leftButton = new Button(scene, { x: 0, y: bb - 40, width: 100, height: 80, radius: 28, icon: 'laneLeft', label: 'Left', variant: 'hud', fontSize: 18, onClick: () => opts.onLane(-1) });
    this.rightButton = new Button(scene, { x: 0, y: bb - 40, width: 100, height: 80, radius: 28, icon: 'laneRight', label: 'Right', variant: 'hud', fontSize: 18, onClick: () => opts.onLane(1) });
    for (const b of [this.jumpButton, this.slideButton, this.leftButton, this.rightButton]) b.setDepth(60).setAlpha(0.85);
    this.hint = addText(scene, W / 2, layout.shadowTop + layout.laneH * 0.42, 'Tap anywhere to switch  ·  Swipe ↑ jump  ·  ↓ slide  ·  ← → change lanes', {
      size: 19,
      weight: '600',
      color: '#ffffff',
      stroke: '#1d1838',
      strokeThickness: 5,
      wrapWidth: 420,
    }).setDepth(60);
    this.setLeftHanded(opts.leftHanded);
  }

  /** Left-handed mode puts the jump / slide buttons on the left and the lane buttons on the right. */
  setLeftHanded(left: boolean): void {
    const W = this.scene.W;
    const sideX = left ? 80 : W - 80;
    this.jumpButton.x = sideX;
    this.slideButton.x = sideX;
    this.leftButton.x = left ? W - 190 : 74;
    this.rightButton.x = left ? W - 74 : 190;
  }

  private laneLabel(form: Form, y: number): Phaser.GameObjects.Container {
    const c = this.scene.add.container(24, y).setDepth(45);
    const g = this.scene.add.graphics();
    const text = addText(this.scene, 50, 17, form === 'real' ? 'REALITY' : 'SHADOW', { size: 17, weight: '700', color: '#ffffff', origin: [0, 0.5] });
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
      g.fillStyle(lf === 'real' ? 0xff8a3d : 0x6b4cff, active ? 0.95 : 0.45);
      g.fillRoundedRect(0, 0, 140, 34, 17);
      drawIcon(g, lf === 'real' ? 'sun' : 'moon', 26, 17, 20, 0xffffff, active ? 1 : 0.6);
      (label.list[1] as Phaser.GameObjects.Text).setAlpha(active ? 1 : 0.6);
      label.setScale(active ? 1 : 0.9);
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
    const meters = Math.floor(session.x / 10);
    if (meters !== this.lastMeters) {
      this.lastMeters = meters;
      this.distance.setText(`${meters.toLocaleString('en-US')}m`);
      const g = this.distanceBg;
      g.clear();
      pill(g, 24, this.distance.y - 30, this.distance.width + 40, 60);
    }
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
    // The control hint is shown at the start of a run only.
    const hintAlpha = Math.max(0, Math.min(1, (600 - session.x) / 300));
    this.hint.setAlpha(hintAlpha).setVisible(hintAlpha > 0);
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
    const right = this.scene.W - 40;
    const y = this.scene.safeTop + 48 + 52;
    for (let i = 0; i < max; i++) {
      const x = right - i * 32;
      drawIcon(g, 'heart', x, y, 24, i < lives ? 0xff5d73 : 0x4a4566, 1);
    }
  }

  setWarning(on: boolean, t: number): void {
    if (on !== this.warningOn) {
      this.warningOn = on;
      this.warning.setVisible(on);
    }
    if (on && !this.opts.reducedMotion) this.warning.setAlpha(0.65 + 0.35 * Math.sin(t * 14));
  }

  /** Short message in the upper world. */
  toast(text: string, color = 0xffffff, duration = 1600, y?: number): void {
    const { W } = this.scene;
    const ty = y ?? this.opts.layout.hudBottom + 70;
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

  /** Big banner over the seam (level intro, eclipse, hit). */
  banner(title: string, sub: string, color: number, duration = 1500): void {
    const { W } = this.scene;
    const y = this.opts.layout.dividerY;
    const c = this.scene.add.container(W / 2, y).setDepth(85);
    const g = this.scene.add.graphics();
    g.fillStyle(COLORS.night, 0.88);
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
