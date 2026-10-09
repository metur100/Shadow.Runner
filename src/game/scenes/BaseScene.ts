import Phaser from 'phaser';

import { GameContext } from '../GameContext';
import type { ThemeId } from '../levels/LevelDefinition';
import { gameplayLayout } from '../rendering/Layout';
import { Renderer3D } from '../three/Renderer3D';
import { World3D } from '../three/World3D';
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
   * Menu background: the 3D reality street above and the shadow street below, with the runner and its
   * shadow running away from the camera, split by a glowing seam at `seamY`.
   */
  protected addTwinBackground(theme: ThemeId = 'city', runners = true, seamY = this.H * 0.5): void {
    const topH = Math.round(seamY);
    const save = GameContext.save;
    const colors = { real: selectedColors(save.cosmetics.selected, 'costume'), shadow: selectedColors(save.cosmetics.selected, 'shadowForm') };
    const portal = selectedColors(save.cosmetics.selected, 'portal');
    if (!Renderer3D.available) {
      // No WebGL for the 3D worlds: plain day / night halves.
      this.add.rectangle(0, 0, this.W, topH, lanePalette(theme, 'real').skyTop).setOrigin(0);
      this.add.rectangle(0, topH, this.W, this.H - topH, lanePalette(theme, 'shadow').skyBottom).setOrigin(0);
    } else {
      this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
      const worlds = (['real', 'shadow'] as const).map(
        (side) =>
          new World3D({
            side,
            theme,
            session: null,
            runnerColors: colors[side],
            portalColors: portal,
            highContrast: false,
            reducedMotion: GameContext.reducedMotion,
            detail: !GameContext.profile.lowEnd,
            seed: side === 'real' ? 11 : 12,
          }),
      );
      if (!runners) for (const w of worlds) w.runner.root.visible = false;
      Renderer3D.show(this);
      let scroll = 0;
      let t = 0;
      const draw = (dt: number) => {
        t += dt;
        scroll += (GameContext.reducedMotion ? 0 : 6.5 * 42) * dt;
        for (const w of worlds) {
          w.update(scroll, t, dt, { anim: 'run', h: 0, solid: true, speed: 6.5, cheer: false, reducedMotion: GameContext.reducedMotion }, true);
        }
        // Each half shows its world's lower part (street and runner) like the gameplay lanes.
        const laneH = gameplayLayout(this.H, this.safeTop, this.safeBottom).laneH;
        Renderer3D.render([
          { world: worlds[0], x: 0, y: topH - laneH, w: this.W, h: laneH },
          { world: worlds[1], x: 0, y: topH, w: this.W, h: laneH },
        ]);
      };
      draw(0.016);
      const handler = (_t: number, delta: number) => draw(Math.min(delta, 100) / 1000);
      this.events.on('update', handler);
      this.events.once('shutdown', () => {
        this.events.off('update', handler);
        for (const w of worlds) w.dispose();
        Renderer3D.hide(this);
      });
    }
    // Darken both halves a little so UI on top stays readable.
    this.add.rectangle(0, 0, this.W, this.H, COLORS.night, 0.3).setOrigin(0);
    const seam = this.add.graphics();
    seam.fillStyle(0x9fe8ff, 0.35);
    seam.fillRect(0, topH - 8, this.W, 16);
    seam.fillStyle(0xffffff, 0.9);
    seam.fillRect(0, topH - 2, this.W, 4);
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
