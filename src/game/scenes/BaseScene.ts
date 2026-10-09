import Phaser from 'phaser';

import { GameContext } from '../GameContext';
import type { ThemeId } from '../levels/LevelDefinition';
import { drawRunnerBack } from '../rendering/CharacterRenderer';
import { gameplayLayout } from '../rendering/Layout';
import { LaneCamera } from '../rendering/Perspective';
import { SceneryRenderer, sceneryStyle } from '../rendering/Scenery';
import { backgroundScale, GROUND_H, laneTextures, trimLaneTextures } from '../rendering/TextureFactory';
import { lanePalette } from '../rendering/Themes';
import { selectedColors } from '../systems/Cosmetics';
import { Button } from '../ui/Button';
import { FocusManager } from '../ui/FocusManager';
import { addText } from '../ui/Typography';
import { COLORS } from '../utils/Constants';

/** Announces text to screen readers through an aria-live region in index.html. */
export function announce(text: string): void {
  const region = document.getElementById('sr-status');
  if (region) region.textContent = text;
}

/**
 * Common scene setup. The game is laid out in design units (720 wide); the main camera is zoomed by
 * the device render scale so everything is drawn at full device resolution.
 */
export abstract class BaseScene extends Phaser.Scene {
  W = 720;
  H = 1280;
  /** Render scale (canvas pixels per design unit). */
  k = 1;
  safeTop = 0;
  safeBottom = 0;
  focus!: FocusManager;
  private leaving = false;

  protected setupScene(title?: string): void {
    const profile = GameContext.profile;
    this.W = profile.width;
    this.H = profile.height;
    this.k = profile.renderScale;
    this.safeTop = profile.safeTop;
    this.safeBottom = profile.safeBottom;
    this.leaving = false;
    const cam = this.cameras.main;
    cam.setZoom(this.k);
    cam.centerOn(this.W / 2, this.H / 2);
    cam.setBackgroundColor(COLORS.night);
    this.focus = new FocusManager(this);
    if (!GameContext.reducedMotion) cam.fadeIn(220, 18, 14, 42);
    if (title) announce(title);
    (window as unknown as { __srScene?: string }).__srScene = this.scene.key;
  }

  /** Fade out and switch scene. */
  go(key: string, data?: object): void {
    if (this.leaving) return;
    this.leaving = true;
    const start = () => this.scene.start(key, data);
    if (GameContext.reducedMotion) {
      start();
      return;
    }
    this.cameras.main.fadeOut(160, 18, 14, 42);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, start);
  }

  /**
   * Menu background: the reality street above, the shadow street below, both seen from behind the
   * runner and rolling slowly towards the horizon, with a glowing seam between them and (optionally)
   * the runner and its shadow running away from the camera.
   */
  protected addTwinBackground(theme: ThemeId = 'city', runners = false, seamY = this.H * 0.5): void {
    const s = backgroundScale(this.k, GameContext.profile.lowEnd);
    trimLaneTextures(this, ['city', theme]);
    const laneH = gameplayLayout(this.H, this.safeTop, this.safeBottom).laneH;
    const topH = Math.round(seamY);
    const detail = !GameContext.profile.lowEnd;
    const save = GameContext.save;
    const colors = { real: selectedColors(save.cosmetics.selected, 'costume'), shadow: selectedColors(save.cosmetics.selected, 'shadowForm') };
    const worlds = (['real', 'shadow'] as const).map((side) => {
      // The reality half is anchored on the seam from above, the shadow half hangs below it.
      const top = side === 'real' ? topH - laneH : topH;
      const tex = laneTextures(this, theme, side, this.W, laneH, s);
      const pal = lanePalette(theme, side);
      this.add.rectangle(0, side === 'real' ? 0 : topH, this.W, side === 'real' ? topH : this.H - topH, side === 'real' ? pal.skyTop : sceneryStyle(theme, side).walk).setOrigin(0);
      const c = this.add.container(0, top);
      const cam = new LaneCamera(this.W, laneH);
      const sky = this.add.image(0, 0, tex.sky).setOrigin(0).setDisplaySize(this.W, laneH);
      const skylineH = laneH * 0.62;
      const skyline = this.add.image(0, cam.horizon + 4 - skylineH * (1 - GROUND_H / laneH), tex.far).setOrigin(0).setDisplaySize(this.W, skylineH).setAlpha(0.75);
      const street = this.add.graphics();
      const runner = this.add.graphics();
      c.add([sky, skyline, street, runner]);
      const scenery = new SceneryRenderer(cam, sceneryStyle(theme, side), 7, detail);
      return { side, cam, street, runner, scenery };
    });
    // Darken both halves a little so UI on top stays readable.
    this.add.rectangle(0, 0, this.W, this.H, COLORS.night, 0.35).setOrigin(0);
    const seam = this.add.graphics();
    seam.fillStyle(0x9fe8ff, 0.35);
    seam.fillRect(0, topH - 8, this.W, 16);
    seam.fillStyle(0xffffff, 0.9);
    seam.fillRect(0, topH - 2, this.W, 4);
    let t = 0;
    const draw = (dt: number) => {
      t += dt;
      for (const w of worlds) {
        w.cam.scroll = t * 240;
        w.street.clear();
        w.scenery.draw(w.street);
        if (runners) {
          w.runner.clear();
          drawRunnerBack(w.runner, { side: w.side, anim: 'run', phase: t * 11, time: t, colors: colors[w.side], glow: 0.5 });
          w.runner.setPosition(w.cam.cx, w.cam.runnerY(0)).setScale(w.cam.s0 * 1.25);
        }
      }
    };
    draw(0);
    if (!GameContext.reducedMotion) this.events.on('update', (_t: number, delta: number) => draw(Math.min(delta, 100) / 1000));
  }

  /** Back button + centred title along the top safe edge. Returns the y below the header. */
  protected addHeader(title: string, onBack: () => void): number {
    const y = this.safeTop + 70;
    new Button(this, { x: 66, y, width: 96, height: 84, icon: 'back', variant: 'secondary', onClick: onBack, focus: this.focus });
    addText(this, this.W / 2, y, title, { size: 46, weight: '700', color: COLORS.creamText, shadow: true });
    this.focus.onBack = onBack;
    return y + 70;
  }

  /** Visible, named, clickable widgets of this scene – used by the automated smoke test. */
  listButtons(): NamedWidget[] {
    const found: NamedWidget[] = [];
    const visit = (list: Phaser.GameObjects.GameObject[]) => {
      for (const obj of list) {
        const widget = obj as Partial<NamedWidget>;
        if (typeof widget.accessibleName === 'string' && widget.visible && obj.input?.enabled) found.push(obj as NamedWidget);
        if (obj instanceof Phaser.GameObjects.Container) visit(obj.list);
      }
    };
    visit(this.children.list);
    return found;
  }
}

/** Any clickable container with a readable name (buttons, cards, tiles, toggles). */
export interface NamedWidget extends Phaser.GameObjects.Container {
  accessibleName: string;
}
