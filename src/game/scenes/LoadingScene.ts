import { GameContext } from '../GameContext';
import { loadModels } from '../three/Models';
import { Renderer3D } from '../three/Renderer3D';
import { ProgressBar } from '../ui/ProgressBar';
import { drawLogo } from '../ui/Logo';
import { addText } from '../ui/Typography';
import { COLORS } from '../utils/Constants';
import { BaseScene } from './BaseScene';

/**
 * Loading screen: the logo and a progress bar while the 3D models are decoded; the 3D canvas behind
 * the Phaser canvas is created here.
 */
export class LoadingScene extends BaseScene {
  constructor() {
    super('Loading');
  }

  create(): void {
    this.setupScene('Loading Shadow Runner');
    const { W, H } = this;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0xffb27a, 0xffb27a, 0x2a1b5c, 0x2a1b5c, 1);
    bg.fillRect(0, 0, W, H / 2);
    bg.fillGradientStyle(0x2a1b5c, 0x2a1b5c, 0x0b0822, 0x0b0822, 1);
    bg.fillRect(0, H / 2, W, H / 2);
    const wave = this.add.graphics();
    drawLogo(this, W / 2, H * 0.42, 0.95);
    const bar = new ProgressBar(this, W / 2, H * 0.68, { width: 420, height: 22, fill: COLORS.accent, track: 0xffffff, trackAlpha: 0.2 });
    const label = addText(this, W / 2, H * 0.68 + 50, 'Building two worlds…', { size: 26, weight: '500', color: COLORS.creamText });

    // The 3D canvas sits behind Phaser's; the bundled models load in the background meanwhile.
    Renderer3D.init(this.game.canvas, W, H, { lowEnd: GameContext.profile.lowEnd });
    let modelProgress = 0;
    let modelsDone = false;
    let failed = false;
    loadModels((f) => (modelProgress = f))
      .then(() => (modelsDone = true))
      .catch(() => {
        failed = true;
        label.setText('Could not load the game data – please restart.');
      });
    let t = 0;
    const tick = (_time: number, delta: number) => {
      t += delta / 1000;
      wave.clear();
      wave.fillStyle(0xffffff, 0.85);
      for (let x = 0; x <= W; x += 12) {
        const y = H / 2 + Math.sin(x * 0.03 + t * 6) * (GameContext.reducedMotion ? 0 : 6);
        wave.fillCircle(x, y, 2.5);
      }
      bar.tick(delta / 1000);
      bar.setValue(modelProgress);
      if (modelsDone && t > 0.9 && !failed) {
        label.setText('Ready!');
        // Only remove our own listener – Phaser's tweens and camera effects also listen to 'update'.
        this.events.off('update', tick);
        this.go(GameContext.save.tutorialDone ? 'Menu' : 'Tutorial');
      }
    };
    this.events.on('update', tick);
  }
}
