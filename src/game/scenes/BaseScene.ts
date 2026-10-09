import Phaser from 'phaser';

import { GameContext } from '../GameContext';
import type { ThemeId } from '../levels/LevelDefinition';
import { drawRunner } from '../rendering/CharacterRenderer';
import { gameplayLayout } from '../rendering/Layout';
import { backgroundScale, laneTextures, trimLaneTextures } from '../rendering/TextureFactory';
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
   * Menu background: the reality world above, the shadow world below, a glowing seam between them and
   * (optionally) the runner and its shadow running in place on either side of the seam.
   */
  protected addTwinBackground(theme: ThemeId = 'city', runners = false, seamY = this.H * 0.5): void {
    // Reuses the gameplay lane textures (no extra canvases): the reality lane sits on the seam, the
    // shadow lane hangs below it, and plain sky colour fills the rest.
    const s = backgroundScale(this.k, GameContext.profile.lowEnd);
    trimLaneTextures(this, ['city', theme]);
    const laneH = gameplayLayout(this.H, this.safeTop, this.safeBottom).laneH;
    const topH = Math.round(seamY);
    const real = laneTextures(this, theme, 'real', this.W, laneH, s);
    const shadow = laneTextures(this, theme, 'shadow', this.W, laneH, s);
    const realPal = lanePalette(theme, 'real');
    const shadowPal = lanePalette(theme, 'shadow');
    this.add.rectangle(0, 0, this.W, topH, realPal.skyTop).setOrigin(0);
    this.add.image(0, topH - laneH, real.sky).setOrigin(0).setDisplaySize(this.W, laneH);
    const farR = this.add.tileSprite(0, topH - laneH, this.W, laneH, real.far).setOrigin(0).setTileScale(1 / s);
    const midR = this.add.tileSprite(0, topH - laneH, this.W, laneH, real.mid).setOrigin(0).setTileScale(1 / s);
    this.add.tileSprite(0, topH - 60, this.W, 60, real.ground).setOrigin(0).setTileScale(1 / s);
    this.add.rectangle(0, topH, this.W, this.H - topH, shadowPal.skyBottom).setOrigin(0);
    this.add.image(0, topH, shadow.sky).setOrigin(0).setDisplaySize(this.W, laneH);
    const farS = this.add.tileSprite(0, topH, this.W, laneH, shadow.far).setOrigin(0).setTileScale(1 / s);
    const midS = this.add.tileSprite(0, topH, this.W, laneH, shadow.mid).setOrigin(0).setTileScale(1 / s);
    // Darken both halves a little so UI on top stays readable.
    this.add.rectangle(0, 0, this.W, this.H, COLORS.night, 0.35).setOrigin(0);
    const seam = this.add.graphics();
    seam.fillStyle(0x9fe8ff, 0.35);
    seam.fillRect(0, topH - 8, this.W, 16);
    seam.fillStyle(0xffffff, 0.9);
    seam.fillRect(0, topH - 2, this.W, 4);
    if (!GameContext.reducedMotion) {
      this.events.on('update', (_t: number, delta: number) => {
        const d = delta / 1000;
        farR.tilePositionX += 18 * d * s;
        midR.tilePositionX += 50 * d * s;
        farS.tilePositionX += 18 * d * s;
        midS.tilePositionX += 50 * d * s;
      });
    }
    if (runners) {
      const save = GameContext.save;
      const realColors = selectedColors(save.cosmetics.selected, 'costume');
      const shadowColors = selectedColors(save.cosmetics.selected, 'shadowForm');
      const a = this.add.graphics().setPosition(this.W * 0.22, topH - 62).setScale(1.1);
      const b = this.add.graphics().setPosition(this.W * 0.22, topH + 62).setScale(1.1, -1.1);
      let t = 0;
      const draw = (dt: number) => {
        t += dt;
        a.clear();
        b.clear();
        drawRunner(a, { side: 'real', anim: 'run', phase: t * 11, time: t, colors: realColors, glow: 0.5 });
        drawRunner(b, { side: 'shadow', anim: 'run', phase: t * 11, time: t, colors: shadowColors, glow: 0.5 });
      };
      draw(0);
      if (!GameContext.reducedMotion) this.events.on('update', (_t: number, delta: number) => draw(delta / 1000));
    }
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
