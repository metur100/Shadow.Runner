import type Phaser from 'phaser';

import { GameContext } from '../GameContext';
import { buildTutorialLevel } from '../levels/LevelData';
import type { LevelDefinition, TutorialStep } from '../levels/LevelDefinition';
import { drawIcon, type IconName } from '../ui/Icons';
import { addText } from '../ui/Typography';
import { COLORS } from '../utils/Constants';
import { announce } from './BaseScene';
import { GameplayScene, type GameplayData } from './GameplayScene';

const ACTION_HINT: Record<TutorialStep['action'], { icon: IconName; text: string }> = {
  none: { icon: 'hand', text: 'Tap to continue' },
  switch: { icon: 'swap', text: 'Tap anywhere (or press Tab)' },
  jump: { icon: 'jump', text: 'Swipe up (or press Space)' },
  slide: { icon: 'slide', text: 'Swipe down (or press ↓)' },
};

/**
 * The interactive tutorial: a real run where time freezes at each step until the player performs the
 * action it teaches – first the two worlds, then switching, light, jumping, sliding and a cross-world
 * lever.
 */
export class TutorialScene extends GameplayScene {
  private stepIndex = 0;
  private waiting: TutorialStep | null = null;
  private done = false;
  private prompt: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Tutorial');
  }

  override init(_data: GameplayData): void {
    super.init({ mode: 'tutorial' });
    this.stepIndex = 0;
    this.waiting = null;
    this.done = false;
    this.prompt = null;
  }

  protected override buildLevel(): LevelDefinition {
    return buildTutorialLevel();
  }

  protected override startIntro(): void {
    this.hud.banner('How to play', 'Two worlds, one runner', 0x9fe8ff, 900);
    this.time.delayedCall(GameContext.reducedMotion ? 400 : 1000, () => (this.frozen = false));
  }

  protected override beforeStep(): boolean {
    const steps = this.level.tutorialSteps ?? [];
    if (this.waiting) {
      if (this.satisfied(this.waiting)) this.resolve();
      else return true;
    }
    const next = steps[this.stepIndex];
    if (next && this.session.x >= next.x) {
      this.stepIndex++;
      this.waiting = next;
      this.done = false;
      this.showPrompt(next);
      return true;
    }
    return false;
  }

  private satisfied(step: TutorialStep): boolean {
    if (step.action === 'switch') return this.session.active === step.form;
    return this.done;
  }

  protected override allowAction(action: 'switch' | 'jump' | 'slide' | 'tap'): boolean {
    if (this.frozen) return false;
    const step = this.waiting;
    if (!step) return true;
    if (step.action === 'none') {
      this.done = true;
      return false;
    }
    const matches =
      (step.action === 'switch' && (action === 'switch' || action === 'tap')) ||
      (step.action === 'jump' && action === 'jump') ||
      (step.action === 'slide' && action === 'slide');
    if (!matches) {
      this.nudge();
      return false;
    }
    this.done = true;
    return true;
  }

  private resolve(): void {
    this.waiting = null;
    const prompt = this.prompt;
    this.prompt = null;
    if (prompt) this.tweens.add({ targets: prompt, alpha: 0, duration: 150, onComplete: () => prompt.destroy() });
  }

  private nudge(): void {
    if (!this.prompt || GameContext.reducedMotion) return;
    this.tweens.add({ targets: this.prompt, x: this.W / 2 + 12, duration: 50, yoyo: true, repeat: 2 });
  }

  private showPrompt(step: TutorialStep): void {
    this.prompt?.destroy();
    const { W } = this;
    const lane = step.text.startsWith('And this is your shadow') ? this.lanes.shadow : step.text.startsWith('This is you') ? this.lanes.real : null;
    const y = lane ? (lane === this.lanes.real ? this.layout.shadowTop + this.layout.laneH * 0.45 : this.layout.realTop + this.layout.laneH * 0.45) : this.layout.dividerY;
    const c = this.add.container(W / 2, y).setDepth(90);
    const text = addText(this, 0, -24, step.text, { size: 27, weight: '600', color: COLORS.inkText, wrapWidth: 560, lineSpacing: 4 });
    const hint = ACTION_HINT[step.action];
    const h = text.height + 110;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(-310, -h / 2 + 8, 620, h, 28);
    g.fillStyle(COLORS.panel, 1);
    g.fillRoundedRect(-310, -h / 2, 620, h, 28);
    text.setY(-h / 2 + 30 + text.height / 2);
    const ig = this.add.graphics();
    drawIcon(ig, hint.icon, -150, h / 2 - 40, 34, step.action === 'switch' ? 0x6b4cff : COLORS.accent, 1);
    const ht = addText(this, 20, h / 2 - 40, hint.text, { size: 23, weight: '700', color: step.action === 'switch' ? '#5236c9' : '#d8642a' });
    c.add([g, text, ig, ht]);
    // Point at the world being introduced.
    if (lane) {
      const arrow = this.add.graphics();
      const up = lane === this.lanes.real;
      arrow.fillStyle(COLORS.panel, 1);
      if (up) arrow.fillTriangle(-130, -h / 2 + 2, -90, -h / 2 + 2, -110, -h / 2 - 26);
      else arrow.fillTriangle(-130, h / 2 - 2, -90, h / 2 - 2, -110, h / 2 + 26);
      c.add(arrow);
    }
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
    if (!GameContext.reducedMotion) this.tweens.add({ targets: ig, y: step.action === 'slide' ? 6 : -6, duration: 420, yoyo: true, repeat: -1 });
    this.prompt = c;
    announce(`${step.text} ${hint.text}`);
  }

  protected override afterRespawn(): void {
    // Re-arm any prompt that lies after the checkpoint the run restarted from.
    const steps = this.level.tutorialSteps ?? [];
    this.resolve();
    this.stepIndex = steps.findIndex((s) => s.x > this.session.x + 1);
    if (this.stepIndex < 0) this.stepIndex = steps.length;
  }

  protected override finish(): void {
    GameContext.update({ ...GameContext.save, tutorialDone: true });
    this.go('Result', {
      mode: 'tutorial',
      levelIndex: -1,
      levelName: 'Tutorial',
      stats: this.session.stats(),
      score: null,
      required: 0,
      failReason: null,
      failForm: null,
      failX: 0,
      newBest: false,
      unlockedLevel: null,
      unlockedWorld: null,
      newCosmetics: [],
    });
  }

  protected override exit(): void {
    GameContext.update({ ...GameContext.save, tutorialDone: true });
    this.go('Menu');
  }
}
